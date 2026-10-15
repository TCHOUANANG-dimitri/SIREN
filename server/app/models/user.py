import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.types import UUIDStr, pg_enum
import enum


class RoleType(str, enum.Enum):
    PRINCIPAL = "principal"
    SECONDAIRE = "secondaire"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=lambda: str(uuid.uuid4()))
    nom: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    telephone: Mapped[str] = mapped_column(String(30), nullable=True)
    role: Mapped[RoleType] = mapped_column(pg_enum(RoleType, "role_type"), default=RoleType.PRINCIPAL)
    langue: Mapped[str] = mapped_column(String(5), default="fr")
    twofa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    twofa_secret: Mapped[str] = mapped_column(String(64), nullable=True)
    # Adresse confirmée par code (OTP_MODE=email) ; null = non vérifiée.
    email_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Versions des documents juridiques acceptées à l'inscription (src/legal côté app).
    terms_version: Mapped[str] = mapped_column(String(20), nullable=True)
    privacy_version: Mapped[str] = mapped_column(String(20), nullable=True)
    legal_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    children = relationship("Child", back_populates="parent", lazy="selectin")
    push_tokens = relationship("PushToken", back_populates="user", lazy="selectin")
