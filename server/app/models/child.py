import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, SmallInteger, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Child(Base):
    __tablename__ = "children"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    prenom: Mapped[str] = mapped_column(String(100), nullable=False)
    photo_url: Mapped[str] = mapped_column(String, nullable=True)
    parent_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(String(50), ForeignKey("devices.device_id", ondelete="SET NULL"), nullable=True, unique=True)
    model_confidence: Mapped[int] = mapped_column(SmallInteger, default=0)
    sleep_schedule: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    parent = relationship("User", back_populates="children", lazy="selectin")
    device = relationship("Device", lazy="selectin")
    places = relationship("Place", back_populates="child", lazy="selectin")
    geofences = relationship("Geofence", back_populates="child", lazy="selectin")
    param_packs = relationship("ParamPack", back_populates="child", lazy="selectin")
