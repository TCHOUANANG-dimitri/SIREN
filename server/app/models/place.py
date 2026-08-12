import uuid, enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, REAL, DateTime, ForeignKey, Enum as SAEnum, ARRAY, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from app.core.database import Base


class PlaceSource(str, enum.Enum):
    DECLARE = "declare"
    APPRIS = "appris"


class Place(Base):
    __tablename__ = "places"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    nom: Mapped[str] = mapped_column(String(150), nullable=False)
    geom: Mapped[str] = mapped_column(Geometry("Point", srid=4326), nullable=False)
    radius_m: Mapped[float] = mapped_column(REAL, default=50)
    source: Mapped[PlaceSource] = mapped_column(SAEnum(PlaceSource), default=PlaceSource.DECLARE)
    visit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    child = relationship("Child", back_populates="places", lazy="selectin")
    schedules = relationship("PlaceSchedule", back_populates="place", lazy="selectin", cascade="all, delete-orphan")


class PlaceSchedule(Base):
    __tablename__ = "place_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    place_id: Mapped[str] = mapped_column(String(36), ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    jours: Mapped[list] = mapped_column(ARRAY(Integer), nullable=False)
    heure_debut: Mapped[str] = mapped_column(Time, nullable=False)
    heure_fin: Mapped[str] = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    place = relationship("Place", back_populates="schedules", lazy="selectin")
