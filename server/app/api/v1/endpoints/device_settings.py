"""
Endpoints device settings - manquant côté backend.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.device import Device
from app.crud.child import crud_child
from app.crud.device import crud_device

router = APIRouter()


@router.get("/{child_id}/device/settings")
async def get_device_settings(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    device = await crud_device.get_by_id(db, child.device_id) if child.device_id else None
    if not device:
        raise HTTPException(status_code=404, detail="Aucun dispositif associé")

    return {
        "energyMode": device.energy_mode,
        "sensitivity": device.sensitivity,
        "configVersion": device.config_version,
    }


@router.patch("/{child_id}/device/settings")
async def patch_device_settings(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    device = await crud_device.get_by_id(db, child.device_id) if child.device_id else None
    if not device:
        raise HTTPException(status_code=404, detail="Aucun dispositif associé")

    update = {}
    if "energyMode" in req:
        update["energy_mode"] = req["energyMode"]
    if "sensitivity" in req:
        update["sensitivity"] = req["sensitivity"]

    updated = await crud_device.update(db, device, update)
    return {
        "energyMode": updated.energy_mode,
        "sensitivity": updated.sensitivity,
        "configVersion": updated.config_version,
    }