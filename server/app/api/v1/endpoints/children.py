from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update as sql_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.errors import api_error
from app.core.security import verify_password
from app.core.serial import InvalidSerial, parse_serial
from app.crud.child import crud_child
from app.crud.device import crud_device
from app.models.device import Device
from app.models.device_link import DeviceCommand
from app.models.user import User
from app.schemas.child import ChildCreateRequest, ChildPatchRequest, DevicePairRequest
from app.services import rate_limit

router = APIRouter()


def _child_dict(c):
    return {
        "id": c.id,
        "prenom": c.prenom,
        "photoUrl": c.photo_url,
        "deviceId": c.device_id,
        "parentId": c.parent_id,
        "modelConfidence": c.model_confidence,
        "createdAt": c.created_at.isoformat(),
        "sleepSchedule": c.sleep_schedule,
    }


def _device_status(device):
    return {
        "deviceId": device.device_id,
        "battery": device.battery,
        "online": device.online,
        "lastSeen": device.last_seen.isoformat() if device.last_seen else None,
        # La qualité réelle vient de la dernière position ; hors ligne = perdue.
        "fixQuality": "gps_recent" if device.online else "perdu",
        "configVersion": device.config_version,
        "firmwareVersion": device.firmware_version,
        "energyMode": device.energy_mode,
        "sensitivity": device.sensitivity,
    }


@router.get("")
async def list_children(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    children = await crud_child.list_by_user(db, current_user.id, current_user.role)
    return [_child_dict(c) for c in children if c.deleted_at is None]


def _serial_or_error(raw: str) -> str:
    try:
        return parse_serial(raw)
    except InvalidSerial:
        raise api_error(422, "serial_invalid", "Numéro de série attendu : SIREN-XXXXX-XXXXX")


async def _pairing_failure(db: AsyncSession, user: User, error: HTTPException) -> HTTPException:
    """Compte l'échec (même si la requête échoue ensuite) puis renvoie l'erreur à lever."""
    await rate_limit.record(db, "pair_fail", user.id)
    await db.commit()
    return error


async def resolve_device_for_pairing(db: AsyncSession, user: User, raw_id: str, pin: str | None, for_child_id: str | None = None) -> Device:
    """
    Vérifie qu'un dispositif peut être associé par `user` :
    - format exact SIREN-XXXXX-XXXXX, sensible à la casse ;
    - dispositif connu, non associé à une autre famille (même réponse qu'inconnu
      tant que la possession n'est pas prouvée : on ne révèle pas qu'il est suivi) ;
    - PIN d'activation imprimé sur la boîte, exigé s'il est enregistré (preuve de
      possession du protocole dispositif) ; sans PIN enregistré, le numéro seul
      n'est PAS une preuve de possession — risque résiduel, docs/DECISIONS_TECHNIQUES.md D-07 ;
    - échecs limités par compte ET par dispositif (PAIRING_MAX_FAILURES_PER_USER /
      PAIRING_FAILURE_WINDOW_S). Les compteurs ne sont jamais remis à zéro par une
      réussite : dissocier puis réassocier son propre dispositif ne rouvre pas
      d'essais sur le PIN d'un autre, et plusieurs comptes ne cumulent pas leurs essais
      sur un même boîtier.
    """
    window = settings.PAIRING_FAILURE_WINDOW_S
    await rate_limit.ensure_below(db, "pair_fail", user.id, settings.PAIRING_MAX_FAILURES_PER_USER, window)
    device_id = _serial_or_error(raw_id)
    await rate_limit.ensure_below(db, "pair_fail_device", device_id, settings.PAIRING_MAX_FAILURES_PER_USER, window)
    device = await crud_device.get_by_id(db, device_id)
    not_found = api_error(404, "device_not_found", "Dispositif introuvable")
    if device is None:
        raise await _pairing_failure(db, user, not_found)
    holder = await crud_child.get_by_device(db, device_id)
    if holder is not None and holder.id == for_child_id:
        raise api_error(409, "device_already_paired", "Ce dispositif est déjà associé à cet enfant")
    if holder is not None and holder.parent_id == user.id:
        raise api_error(409, "device_already_paired", "Ce dispositif est déjà associé à un de vos enfants")
    if device.activation_pin_hash:
        if not pin:
            raise api_error(403, "pin_required", "PIN d'activation requis")
        if not verify_password(pin.strip(), device.activation_pin_hash):
            await rate_limit.record(db, "pair_fail_device", device_id)
            raise await _pairing_failure(db, user, api_error(403, "pin_invalid", "PIN d'activation incorrect"))
        if holder is not None:
            # Possession prouvée : l'ancien propriétaire doit d'abord dissocier le dispositif.
            raise api_error(409, "device_taken", "Dispositif associé à un autre compte")
    elif holder is not None:
        raise await _pairing_failure(db, user, not_found)
    return device


async def _cancel_pending_commands(db: AsyncSession, child_id: str, detail: str) -> None:
    await db.execute(
        sql_update(DeviceCommand)
        .where(DeviceCommand.child_id == child_id, DeviceCommand.status == "PENDING")
        .values(status="FAILED", detail=detail, responded_at=datetime.now(timezone.utc))
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_child(req: ChildCreateRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "principal":
        raise api_error(403, "principal_only", "Seuls les parents peuvent ajouter un enfant")
    device = await resolve_device_for_pairing(db, current_user, req.deviceId, req.activationPin)
    try:
        child = await crud_child.create(db, {
            "prenom": req.prenom.strip(),
            "device_id": device.device_id,
            "photo_url": req.photoUrl,
            "parent_id": current_user.id,
        })
    except IntegrityError:
        # Deux appairages simultanés du même dispositif : l'index uq_children_device tranche.
        await db.rollback()
        raise api_error(409, "device_taken", "Dispositif associé à un autre compte")
    return _child_dict(child)


@router.put("/{child_id}/device")
async def pair_device(child_id: str, req: DevicePairRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """(Ré)associe un dispositif à un enfant existant ; l'ancien est libéré."""
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    device = await resolve_device_for_pairing(db, current_user, req.deviceId, req.activationPin, for_child_id=child_id)
    child = access.child
    if child.device_id and child.device_id != device.device_id:
        await _cancel_pending_commands(db, child.id, "device_replaced")
    try:
        child = await crud_child.update(db, child, {"device_id": device.device_id})
    except IntegrityError:
        await db.rollback()
        raise api_error(409, "device_taken", "Dispositif associé à un autre compte")
    return _child_dict(child)


@router.delete("/{child_id}/device")
async def unpair_device(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Dissocie le dispositif : l'historique reste à l'enfant, le boîtier peut être ré-associé."""
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    child = access.child
    if not child.device_id:
        raise api_error(404, "no_device", "Aucun dispositif associé")
    await _cancel_pending_commands(db, child.id, "device_unpaired")
    child.device_id = None  # crud.update ignore les None
    await db.flush()
    return _child_dict(child)


@router.get("/devices/{device_id}")
async def find_device(device_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Limite l'énumération des numéros de série (hit : chaque recherche compte).
    await rate_limit.hit(db, "device_lookup", current_user.id, settings.DEVICE_LOOKUP_MAX_PER_USER_PER_HOUR, 3600)
    serial = _serial_or_error(device_id)
    device = await crud_device.get_by_id(db, serial)
    if not device:
        await db.commit()
        raise api_error(404, "device_not_found", "Dispositif introuvable")
    if await crud_child.get_by_device(db, device.device_id):
        # Même réponse qu'un dispositif inconnu : on ne révèle pas qu'il est suivi par une autre famille.
        await db.commit()
        raise api_error(404, "device_not_found", "Dispositif introuvable")
    return {
        "deviceId": device.device_id,
        "configVersion": device.config_version,
        "firmwareVersion": device.firmware_version,
        "online": device.online,
        "battery": device.battery,
        "pinRequired": bool(device.activation_pin_hash),
    }


@router.get("/{child_id}")
async def get_child(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    return _child_dict(access.child)


@router.patch("/{child_id}")
async def patch_child(child_id: str, req: ChildPatchRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    update = {}
    if req.prenom is not None:
        update["prenom"] = req.prenom.strip()
    if req.sleepSchedule is not None:
        update["sleep_schedule"] = req.sleepSchedule.model_dump()
    child = await crud_child.update(db, access.child, update) if update else access.child
    return _child_dict(child)


@router.get("/{child_id}/status")
async def get_child_status(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    device = await crud_device.get_by_id(db, access.child.device_id) if access.child.device_id else None
    if not device:
        raise HTTPException(status_code=404, detail="Aucun dispositif associé")
    return _device_status(device)
