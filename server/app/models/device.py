from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    secret_key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, default=1)
    firmware_version: Mapped[str] = mapped_column(String(30), nullable=True)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    battery: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    energy_mode: Mapped[str] = mapped_column(String(20), default="normal")
    sensitivity: Mapped[str] = mapped_column(String(20), default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
