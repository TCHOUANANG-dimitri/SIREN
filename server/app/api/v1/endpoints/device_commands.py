"""
Commandes à distance vers le traceur (protocole §8) : création, suivi.
LOCALISER exige le droit `position_precise` ; MODE et REDEMARRER sont réservés
au parent principal. NUMERO_SMS et RESET_USINE ne sont pas exposés.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.errors import api_error
from app.models.device_link import DeviceCommand
from app.models.user import User
from app.schemas.device import DeviceCommandRequest
from app.services import device_commands, device_protocol, rate_limit

router = APIRouter()

COMMANDS_PER_CHILD_PER_MINUTE = 6


async def send_command(db: AsyncSession, user: User, child_id: str, code: str, valeur: str | None) -> DeviceCommand:
    access = await get_child_access(db, user, child_id)
    if code == "LOCALISER":
        access.require("position_precise")
    else:
        access.require_principal()
    reason = device_protocol.validate_command(code, valeur)
    if reason:
        raise api_error(422, reason, "Commande refusée")
    if not access.child.device_id:
        raise api_error(404, "no_device", "Aucun dispositif associé")
    await rate_limit.hit(db, "device_cmd", f"{user.id}:{child_id}", COMMANDS_PER_CHILD_PER_MINUTE, 60)
    return await device_commands.create_and_dispatch(
        db, device_id=access.child.device_id, child_id=child_id, user_id=user.id, code=code, valeur=valeur
    )


@router.post("/{child_id}/commands", status_code=status.HTTP_201_CREATED)
async def create_command(child_id: str, req: DeviceCommandRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    command = await send_command(db, current_user, child_id, req.code, req.valeur)
    return device_commands.command_dict(command)


@router.get("/{child_id}/commands/{command_id}")
async def get_command(child_id: str, command_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_child_access(db, current_user, child_id)
    if not device_commands.is_command_id(command_id):
        raise api_error(404, "command_not_found", "Commande inconnue")
    command = (
        await db.execute(select(DeviceCommand).where(DeviceCommand.id == command_id, DeviceCommand.child_id == child_id))
    ).scalar_one_or_none()
    if command is None:
        raise api_error(404, "command_not_found", "Commande inconnue")
    return device_commands.command_dict(command)
