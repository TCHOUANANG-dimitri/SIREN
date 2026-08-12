from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.child import Child
from app.crud.child import crud_child
from app.crud.device import crud_device
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
    }


@router.get("")
async def list_children(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    children = await crud_child.list_by_user(db, current_user.id, current_user.role)
    return [_child_dict(c) for c in children]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_child(
    req: ChildCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "principal":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seuls les parents peuvent ajouter un enfant")

    device = await crud_device.get_by_id(db, req.deviceId)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositif introuvable")

    existing = await crud_child.get_by_device(db, req.deviceId)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dispositif déjà associé")

    child = await crud_child.create(db, {
        "prenom": req.prenom,
        "device_id": req.deviceId,
        "photo_url": req.photoUrl,
        "parent_id": current_user.id,
    })
    return _child_dict(child)


@router.get("/{child_id}")
async def get_child(
    child_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    child = await crud_child.get(db, child_id)
    if not child or child.deleted_at:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable")
    return _child_dict(child)


@router.patch("/{child_id}")
async def patch_child(
    child_id: str,
    req: ChildPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    child = await crud_child.get(db, child_id)
    if not child or child.deleted_at:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    update = {}
    if req.prenom is not None:
        update["prenom"] = req.prenom
    if req.sleep_schedule is not None:
        from sqlalchemy import text
        import json
        await db.execute(text("UPDATE children SET sleep_schedule = :schedule WHERE id = :id"),
                         {"schedule": json.dumps(req.sleep_schedule), "id": child_id})
        await db.flush()

    if update:
        updated = await crud_child.update(db, child, update)
        return _child_dict(updated)
    return _child_dict(child)


@router.get("/{child_id}/status")
async def get_child_status(
    child_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    device = await crud_device.get_by_id(db, child.device_id) if child.device_id else None
    if not device:
        raise HTTPException(status_code=404, detail="Aucun dispositif associé")

    return {
        "deviceId": device.device_id,
        "battery": device.battery,
        "online": device.online,
        "lastSeen": device.last_seen.isoformat() if device.last_seen else None,
        "fixQuality": "gps_recent" if device.online else "perdu",
        "configVersion": device.config_version,
        "firmwareVersion": device.firmware_version,
        "energyMode": device.energy_mode,
        "sensitivity": device.sensitivity,
    }


@router.get("/devices/{device_id}")
async def find_device(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device = await crud_device.get_by_id(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositif introuvable")
    return {
        "deviceId": device.device_id,
        "configVersion": device.config_version,
        "firmwareVersion": device.firmware_version,
        "online": device.online,
    }
