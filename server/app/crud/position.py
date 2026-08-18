from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from geoalchemy2 import functions as geo_func
from app.crud.base import CRUDBase
from app.models.position import Position
from typing import Optional, List
from datetime import datetime


class CRUDPosition(CRUDBase[Position]):
    async def get_latest(self, db: AsyncSession, child_id: str) -> Optional[Position]:
        result = await db.execute(
            select(Position)
            .where(Position.child_id == child_id)
            .order_by(desc(Position.ts))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_history(self, db: AsyncSession, child_id: str, from_dt: Optional[datetime], to_dt: Optional[datetime], limit: int = 500) -> List[Position]:
        query = select(Position).where(Position.child_id == child_id)
        if from_dt:
            query = query.where(Position.ts >= from_dt)
        if to_dt:
            query = query.where(Position.ts <= to_dt)
        query = query.order_by(desc(Position.ts)).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()


crud_position = CRUDPosition(Position)
