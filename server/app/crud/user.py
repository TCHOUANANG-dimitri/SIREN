from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.crud.base import CRUDBase
from app.models.user import User
from app.core.security import hash_password


class CRUDUser(CRUDBase[User]):
    async def get_by_email(self, db: AsyncSession, email: str) -> User:
        result = await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def create_user(self, db: AsyncSession, nom: str, email: str, password: str, telephone: str = None) -> User:
        return await self.create(db, {
            "nom": nom,
            "email": email,
            "password_hash": hash_password(password),
            "telephone": telephone,
        })

    async def update_password(self, db: AsyncSession, user: User, new_password: str) -> User:
        user.password_hash = hash_password(new_password)
        await db.flush()
        return user


crud_user = CRUDUser(User)
