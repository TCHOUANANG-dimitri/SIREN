from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.crud.base import CRUDBase
from app.models.sharing import SecondaryAccess, AccessAudit
from typing import List, Optional


class CRUDSecondaryAccess(CRUDBase[SecondaryAccess]):
    async def list_by_child(self, db: AsyncSession, child_id: str) -> List[SecondaryAccess]:
        return await self.list(db, child_id=child_id)

    async def get_active(self, db: AsyncSession, child_id: str, user_id: str) -> Optional[SecondaryAccess]:
        result = await db.execute(
            select(SecondaryAccess).where(
                SecondaryAccess.child_id == child_id,
                SecondaryAccess.user_id == user_id,
                SecondaryAccess.status.in_(["invite", "actif"])
            )
        )
        return result.scalar_one_or_none()

    async def list_audit(self, db: AsyncSession, child_id: str) -> List[AccessAudit]:
        result = await db.execute(
            select(AccessAudit)
            .where(AccessAudit.child_id == child_id)
            .order_by(desc(AccessAudit.ts))
            .limit(100)
        )
        return result.scalars().all()


crud_share = CRUDSecondaryAccess(SecondaryAccess)
crud_audit = CRUDBase(AccessAudit)
