import enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, BigInteger, SmallInteger, DateTime, ForeignKey, JSON, Enum as SAEnum, REAL
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from app.core.database import Base


class FixQuality(str, enum.Enum):
    GPS_RECENT = "gps_recent"
    ESTIMEE = "estimee"
    PERDU = "perdu"


class Position(Base):
    __tablename__ = "positions"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    child_id: Mapped[str] = mapped_column(String(36), ForeignKey("children.id", ondelete="CASCADE"), nullable=False, index=True)
    geom: Mapped[str] = mapped_column(Geometry("Point", srid=4326), nullable=False)
    speed_kmh: Mapped[float] = mapped_column(REAL, nullable=True)
    accuracy_m: Mapped[float] = mapped_column(REAL, nullable=True)
    heading: Mapped[float] = mapped_column(REAL, nullable=True)
    fix_quality: Mapped[FixQuality] = mapped_column(SAEnum(FixQuality), default=FixQuality.GPS_RECENT)
    battery: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    imu_data: Mapped[dict] = mapped_column(JSON, nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
