import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.types import UUIDStr


class OtpChallenge(Base):
    """
    Code à usage unique envoyé par email (vérification d'inscription, 2FA,
    réinitialisation du mot de passe). Ni le code ni le jeton de challenge ne
    sont stockés en clair : seules leurs empreintes HMAC le sont.
    """
    __tablename__ = "otp_challenges"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # signup_verify | login_2fa | password_reset
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
