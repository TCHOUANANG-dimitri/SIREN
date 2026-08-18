import enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, SmallInteger, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class RiskState(str, enum.Enum):
    VEILLE = "veille"
    PREALERTE = "prealerte"
    URGENCE = "urgence"
    DISPARITION = "disparition"


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    state: Mapped[RiskState] = mapped_column(SAEnum(RiskState), default=RiskState.VEILLE)
    confidence: Mapped[int] = mapped_column(SmallInteger, default=100)
    reasons: Mapped[dict] = mapped_column(JSON, nullable=True)
    sub_scores: Mapped[dict] = mapped_column(JSON, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
