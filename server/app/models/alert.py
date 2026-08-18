import uuid, enum
from datetime import datetime, timezone
from sqlalchemy import String, SmallInteger, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from app.core.database import Base


class AlertLevel(str, enum.Enum):
    PREALERTE = "prealerte"
    URGENCE = "urgence"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    ACQUITTEE = "acquittee"
    FAUSSE = "fausse"
    RESOLUE = "resolue"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    level: Mapped[AlertLevel] = mapped_column(SAEnum(AlertLevel), nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    reasons: Mapped[dict] = mapped_column(JSON, nullable=True)
    geom: Mapped[str] = mapped_column(Geometry("Point", srid=4326), nullable=True)
    status: Mapped[AlertStatus] = mapped_column(SAEnum(AlertStatus), default=AlertStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
