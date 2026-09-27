"""
Réglages du dispositif (CDC App §4.2) : l'app écrit, le serveur incrémente la
version de configuration, le dispositif la récupère à sa prochaine connexion
(GET /device/v1/pack ; la version courante est aussi renvoyée dans l'ack de télémétrie).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.device import crud_device
from app.models.user import User

router = APIRouter()


class DeviceSettingsPatch(BaseModel):
    energyMode: str | None = Field(None, pattern="^(continu|equilibre|economie)$")
    sensitivity: int | None = Field(None, ge=0, le=100)


def _settings_dict(device):
    return {"energyMode": device.energy_mode, "sensitivity": device.sensitivity, "configVersion": device.config_version}


async def _device_for(db, current_user, child_id):
    access = await get_child_access(db, current_user, child_id)
    device = await crud_device.get_by_id(db, access.child.device_id) if access.child.device_id else None
    if not device:
        raise HTTPException(status_code=404, detail="Aucun dispositif associé")
    return access, device


@router.get("/{child_id}/device/settings")
async def get_device_settings(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _, device = await _device_for(db, current_user, child_id)
    return _settings_dict(device)


@router.patch("/{child_id}/device/settings")
async def patch_device_settings(child_id: str, req: DeviceSettingsPatch, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access, device = await _device_for(db, current_user, child_id)
    access.require_principal()
    update = {}
    if req.energyMode is not None and req.energyMode != device.energy_mode:
        update["energy_mode"] = req.energyMode
    if req.sensitivity is not None and str(req.sensitivity) != device.sensitivity:
        update["sensitivity"] = str(req.sensitivity)
    if update:
        # Nouvelle version seulement si quelque chose change : un double envoi est sans effet.
        update["config_version"] = device.config_version + 1
        device = await crud_device.update(db, device, update)
    return _settings_dict(device)
