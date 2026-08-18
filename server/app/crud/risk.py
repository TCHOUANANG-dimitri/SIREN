from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.crud.base import CRUDBase
from app.models.risk_score import RiskScore
from typing import Optional, List
from datetime import datetime, timedelta


class CRUDRisk(CRUDBase[RiskScore]):
    async def get_latest(self, db: AsyncSession, child_id: str) -> Optional[RiskScore]:
        result = await db.execute(
            select(RiskScore)
            .where(RiskScore.child_id == child_id)
            .order_by(desc(RiskScore.ts))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_history(self, db: AsyncSession, child_id: str, hours: int = 24) -> List[RiskScore]:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        result = await db.execute(
            select(RiskScore)
            .where(RiskScore.child_id == child_id, RiskScore.ts >= cutoff)
            .order_by(desc(RiskScore.ts))
        )
        return result.scalars().all()


crud_risk = CRUDRisk(RiskScore)
