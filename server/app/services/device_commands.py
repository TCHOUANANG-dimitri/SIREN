"""
Commandes descendantes serveur → traceur (protocole §8).

Cycle : PENDING → SUCCESS | FAILED (accusé signé du traceur) ou TIMEOUT
(aucun accusé après DEVICE_COMMAND_TIMEOUT_S, tâche `commands`).
Si aucun canal n'est disponible au moment de la demande, la commande passe
immédiatement à FAILED (« pas de faux espoir », §8 étape 2).

Canal : DEVICE_COMMAND_CHANNEL. Seule la valeur vide (aucun canal) est
utilisable aujourd'hui : la publication MQTT (topic faucon/<id>/cmd, QoS 1)
attend un broker et ses identifiants — T-DEV-MQTT dans docs/TACHES_DIFFEREES.md.
Les tests remplacent le canal par `set_test_publisher`.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.device_link import DeviceCommand
from app.services import device_protocol

logger = logging.getLogger("siren.commands")

FINAL_STATUSES = ("SUCCESS", "FAILED", "TIMEOUT")

def is_command_id(value: str) -> bool:
    """Identifiant de commande bien formé (UUID) : tout autre valeur ne peut désigner aucune commande."""
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


_test_publisher: Optional[Callable[[str, dict], bool]] = None


def set_test_publisher(publisher: Optional[Callable[[str, dict], bool]]) -> None:
    """Réservé aux tests : reçoit (device_id, message signé) et renvoie True si « publié »."""
    global _test_publisher
    _test_publisher = publisher


def channel_available() -> bool:
    if _test_publisher is not None:
        return True
    # MQTT non branché (aucun broker fourni) : jamais prétendu disponible.
    return False


def command_dict(command: DeviceCommand) -> dict:
    return {
        "id": command.id,
        "childId": command.child_id,
        "code": command.code,
        "valeur": command.valeur,
        "status": command.status,
        "detail": command.detail,
        "createdAt": command.created_at.isoformat() if command.created_at else None,
        "respondedAt": command.responded_at.isoformat() if command.responded_at else None,
    }


async def create_and_dispatch(db: AsyncSession, *, device_id: str, child_id: str, user_id: str, code: str, valeur: Optional[str]) -> DeviceCommand:
    command = DeviceCommand(device_id=device_id, child_id=child_id, requested_by=user_id, code=code, valeur=valeur, status="PENDING")
    db.add(command)
    await db.flush()
    if not channel_available() or not settings.DEVICE_COMMAND_SIGNING_KEY:
        command.status, command.detail = "FAILED", "no_channel"
        command.responded_at = datetime.now(timezone.utc)
        await db.flush()
        return command
    message = device_protocol.build_command(settings.DEVICE_COMMAND_SIGNING_KEY, command.id, code, valeur)
    published = False
    try:
        published = bool(_test_publisher and _test_publisher(device_id, message))
    except Exception:  # le canal ne doit jamais faire échouer la requête
        logger.exception("Publication de la commande %s impossible", command.id)
    if not published:
        command.status, command.detail = "FAILED", "publish_failed"
        command.responded_at = datetime.now(timezone.utc)
        await db.flush()
    return command


async def apply_ack(db: AsyncSession, *, command_id: str, tracker_id: str, cmd: str, ok: bool, detail: str) -> Optional[DeviceCommand]:
    """Accusé déjà authentifié (signature vérifiée par l'appelant). Idempotent."""
    if not is_command_id(command_id):
        return None
    command = (await db.execute(select(DeviceCommand).where(DeviceCommand.id == command_id).with_for_update())).scalar_one_or_none()
    if command is None or command.device_id != tracker_id or command.code != cmd:
        return None
    if command.status == "PENDING":
        command.status = "SUCCESS" if ok else "FAILED"
        command.detail = (detail or "")[:200] or None
        command.responded_at = datetime.now(timezone.utc)
        await db.flush()
    return command


async def expire_pending(db: AsyncSession, now: Optional[datetime] = None) -> list[DeviceCommand]:
    """PENDING depuis plus de DEVICE_COMMAND_TIMEOUT_S → TIMEOUT (protocole : cron chaque minute)."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=settings.DEVICE_COMMAND_TIMEOUT_S)
    expired = (
        await db.execute(
            update(DeviceCommand)
            .where(DeviceCommand.status == "PENDING", DeviceCommand.created_at < cutoff)
            .values(status="TIMEOUT", detail="no_ack", responded_at=now)
            .returning(DeviceCommand)
        )
    ).scalars().all()
    return list(expired)
