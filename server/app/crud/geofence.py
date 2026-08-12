from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.base import CRUDBase
from app.models.geofence import Geofence, GeofenceSchedule
from typing import List


class CRUDGeofence(CRUDBase[Geofence]):
    async def list_by_child(self, db: AsyncSession, child_id: str) -> List[Geofence]:
        return await self.list(db, child_id=child_id)


crud_geofence = CRUDGeofence(Geofence)
