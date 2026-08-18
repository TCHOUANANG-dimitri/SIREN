from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.base import CRUDBase
from app.models.place import Place, PlaceSchedule
from typing import List


class CRUDPlace(CRUDBase[Place]):
    async def list_by_child(self, db: AsyncSession, child_id: str) -> List[Place]:
        return await self.list(db, child_id=child_id)


crud_place = CRUDPlace(Place)
crud_place_schedule = CRUDBase(PlaceSchedule)
