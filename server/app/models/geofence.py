import uuid, enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SAEnum, ARRAY, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.core.database import Base


class GeofenceType(str, enum.Enum):
    AUTORISE = "autorise"
    INTERDIT = "interdit"


class Geofence(Base):
    __tablename__ = "geofences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    nom: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[GeofenceType] = mapped_column(SAEnum(GeofenceType), default=GeofenceType.INTERDIT)
    geom: Mapped[str] = mapped_column(Geometry("Geometry", srid=4326), nullable=False)
    notify_enter: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_exit: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    child = relationship("Child", back_populates="geofences", lazy="selectin")
    schedules = relationship("GeofenceSchedule", back_populates="geofence", lazy="selectin", cascade="all, delete-orphan")


class GeofenceSchedule(Base):
    __tablename__ = "geofence_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    geofence_id: Mapped[str] = mapped_column(String(36), ForeignKey("geofences.id", ondelete="CASCADE"), nullable=False)
    jours: Mapped[list] = mapped_column(ARRAY(Integer), nullable=False)
    heure_debut: Mapped[str] = mapped_column(Time, nullable=False)
    heure_fin: Mapped[str] = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    geofence = relationship("Geofence", back_populates="schedules", lazy="selectin")
