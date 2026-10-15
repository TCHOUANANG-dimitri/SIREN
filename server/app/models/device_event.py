import enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.types import pg_enum


class DeviceEventType(str, enum.Enum):
    ARRACHEMENT = "arrachement"
    SIGNAL_PERDU = "signal_perdu"
    BATTERIE_FAIBLE = "batterie_faible"
    RECONNEXION = "reconnexion"
    RESET = "reset"
    # Ajoutés par la migration 003 : événements déjà acceptés par l'API d'ingestion.
    ALLUMAGE = "allumage"
    EXTINCTION = "extinction"
    EN_CHARGE = "en_charge"
    AUTRE = "autre"


# Code envoyé par le dispositif (contrat dispositif-serveur-v1) → valeur stockée.
DEVICE_EVENT_CODES = {
    "removal": DeviceEventType.ARRACHEMENT,
    "low_battery": DeviceEventType.BATTERIE_FAIBLE,
    "power_on": DeviceEventType.ALLUMAGE,
    "power_off": DeviceEventType.EXTINCTION,
    "charging": DeviceEventType.EN_CHARGE,
    "signal_lost": DeviceEventType.SIGNAL_PERDU,
    "reconnect": DeviceEventType.RECONNEXION,
    "reset": DeviceEventType.RESET,
}


class DeviceEvent(Base):
    __tablename__ = "device_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(50), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[DeviceEventType] = mapped_column(pg_enum(DeviceEventType, "device_event_type"), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
