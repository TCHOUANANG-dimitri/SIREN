import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.types import UUIDStr


class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=lambda: str(uuid.uuid4()))
    child_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    nom: Mapped[str] = mapped_column(String(150), nullable=False)
    telephone: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
