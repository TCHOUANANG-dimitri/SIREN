import uuid, enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, JSON, Enum as SAEnum, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ShareStatus(str, enum.Enum):
    INVITE = "invite"
    ACTIF = "actif"
    REVOQUE = "revoque"


class PermissionEnum(str, enum.Enum):
    POSITION_PRECISE = "position_precise"
    ETAT_ZONE = "etat_zone"
    ALERTES_PREALERTE = "alertes_prealerte"
    ALERTES_URGENCE = "alertes_urgence"
    HISTORIQUE = "historique"
    MOBILISATION = "mobilisation"


class SecondaryAccess(Base):
    __tablename__ = "secondary_access"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permissions: Mapped[list] = mapped_column(ARRAY(String), nullable=False)
    status: Mapped[ShareStatus] = mapped_column(SAEnum(ShareStatus), default=ShareStatus.INVITE)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    responded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class AccessAudit(Base):
    __tablename__ = "access_audit"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    info_type: Mapped[str] = mapped_column(String(50), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
