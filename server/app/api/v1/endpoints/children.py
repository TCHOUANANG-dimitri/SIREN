from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.child import crud_child
from app.crud.device import crud_device
from app.models.user import User
from app.schemas.child import ChildCreateRequest, ChildPatchRequest

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


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_child(req: ChildCreateRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "principal":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seuls les parents peuvent ajouter un enfant")

    device_id = req.deviceId.strip().upper()
    device = await crud_device.get_by_id(db, device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositif introuvable")

    # BLOQUANT (contrat Dispositif) : la seule connaissance de l'identifiant imprimé
    # suffit à appairer. Un code d'appairage secret (dans le QR) doit être ajouté
    # dès que le pôle Dispositif en fixe le format.
    existing = await crud_child.get_by_device(db, device_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dispositif déjà associé")

    child = await crud_child.create(db, {
        "prenom": req.prenom.strip(),
        "device_id": device_id,
        "photo_url": req.photoUrl,
        "parent_id": current_user.id,
    })
    return _child_dict(child)


@router.get("/devices/{device_id}")
async def find_device(device_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    device = await crud_device.get_by_id(db, device_id.strip().upper())
    if not device:
        raise HTTPException(status_code=404, detail="Dispositif introuvable")
    if await crud_child.get_by_device(db, device.device_id):
        # Même réponse qu'un dispositif inconnu : on ne révèle pas qu'il est suivi par une autre famille.
        raise HTTPException(status_code=404, detail="Dispositif introuvable")
    return {
        "deviceId": device.device_id,
        "configVersion": device.config_version,
        "firmwareVersion": device.firmware_version,
        "online": device.online,
        "battery": device.battery,
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
