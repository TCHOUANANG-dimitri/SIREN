import enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DeviceEventType(str, enum.Enum):
    ARRACHEMENT = "arrachement"
    SIGNAL_PERDU = "signal_perdu"
    BATTERIE_FAIBLE = "batterie_faible"
    RECONNEXION = "reconnexion"
    RESET = "reset"


class DeviceEvent(Base):
    __tablename__ = "device_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(50), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[DeviceEventType] = mapped_column(SAEnum(DeviceEventType), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
