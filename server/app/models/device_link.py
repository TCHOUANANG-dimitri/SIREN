import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.types import UUIDStr


class DeviceCommand(Base):
    """Commande descendante (protocole §8) : PENDING → SUCCESS | FAILED | TIMEOUT."""

    __tablename__ = "device_commands"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(String(50), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False)
    child_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("children.id", ondelete="CASCADE"), nullable=False)
    requested_by: Mapped[str | None] = mapped_column(UUIDStr, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    valeur: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="PENDING")
    detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeviceRelayEvent(Base):
    """Trame relayée par un téléphone : (device_id, event_id) unique → idempotence."""

    __tablename__ = "device_relay_events"
    __table_args__ = (UniqueConstraint("device_id", "event_id", name="uq_device_relay_event"),)

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(String(50), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    relayed_by: Mapped[str | None] = mapped_column(UUIDStr, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RateLimitEvent(Base):
    """Événement compté pour la limitation de débit (clé HMAC, jamais la valeur en clair)."""

    __tablename__ = "rate_limit_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(String(30), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
