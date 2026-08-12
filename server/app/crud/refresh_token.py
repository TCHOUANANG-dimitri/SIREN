from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.crud.base import CRUDBase
from app.models.refresh_token import RefreshToken
from typing import Optional


class CRUDRefreshToken(CRUDBase[RefreshToken]):
    async def get_by_hash(self, db: AsyncSession, token_hash: str) -> Optional[RefreshToken]:
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash, RefreshToken.revoked == False)
        )
        return result.scalar_one_or_none()


crud_refresh_token = CRUDRefreshToken(RefreshToken)
