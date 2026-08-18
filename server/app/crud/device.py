from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.crud.base import CRUDBase
from app.models.device import Device
from typing import Optional


class CRUDDevice(CRUDBase[Device]):
    async def get_by_id(self, db: AsyncSession, device_id: str) -> Optional[Device]:
        result = await db.execute(select(Device).where(Device.device_id == device_id))
        return result.scalar_one_or_none()


crud_device = CRUDDevice(Device)
