from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.crud.base import CRUDBase
from app.models.child import Child
from app.models.device import Device
from typing import Optional, List


class CRUDChild(CRUDBase[Child]):
    async def get_by_device(self, db: AsyncSession, device_id: str) -> Optional[Child]:
        result = await db.execute(select(Child).where(Child.device_id == device_id, Child.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def list_by_parent(self, db: AsyncSession, parent_id: str) -> List[Child]:
        return await self.list(db, parent_id=parent_id)

    async def list_by_user(self, db: AsyncSession, user_id: str, role: str) -> List[Child]:
        if role == "principal":
            return await self.list_by_parent(db, user_id)
        from app.models.sharing import SecondaryAccess
        result = await db.execute(
            select(Child).join(SecondaryAccess, SecondaryAccess.child_id == Child.id)
            .where(SecondaryAccess.user_id == user_id, SecondaryAccess.status == "actif", Child.deleted_at.is_(None))
        )
        return result.scalars().all()


crud_child = CRUDChild(Child)
