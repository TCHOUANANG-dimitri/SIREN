from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.crud.base import CRUDBase
from app.models.param_pack import ParamPack
from typing import Optional


class CRUDParamPack(CRUDBase[ParamPack]):
    async def get_latest(self, db: AsyncSession, child_id: str) -> Optional[ParamPack]:
        result = await db.execute(
            select(ParamPack)
            .where(ParamPack.child_id == child_id, ParamPack.validated == True)
            .order_by(desc(ParamPack.version))
            .limit(1)
        )
        return result.scalar_one_or_none()


crud_param_pack = CRUDParamPack(ParamPack)
