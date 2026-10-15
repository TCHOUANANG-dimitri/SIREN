import enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.types import UUIDStr, pg_enum


class PlatformType(str, enum.Enum):
    FCM = "fcm"
    APNS = "apns"


class PushToken(Base):
    __tablename__ = "push_tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[PlatformType] = mapped_column(pg_enum(PlatformType, "platform_type"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="push_tokens", lazy="selectin")
