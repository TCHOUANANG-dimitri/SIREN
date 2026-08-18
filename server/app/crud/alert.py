from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.crud.base import CRUDBase
from app.models.alert import Alert
from typing import List, Optional


class CRUDAlert(CRUDBase[Alert]):
    async def list_by_child(self, db: AsyncSession, child_id: str, status: Optional[str] = None) -> List[Alert]:
        query = select(Alert).where(Alert.child_id == child_id)
        if status:
            query = query.where(Alert.status == status)
        query = query.order_by(desc(Alert.created_at))
        result = await db.execute(query)
        return result.scalars().all()

    async def list_by_user(self, db: AsyncSession, child_ids: List[str]) -> List[Alert]:
        query = select(Alert).where(Alert.child_id.in_(child_ids)).order_by(desc(Alert.created_at))
        result = await db.execute(query)
        return result.scalars().all()


crud_alert = CRUDAlert(Alert)
