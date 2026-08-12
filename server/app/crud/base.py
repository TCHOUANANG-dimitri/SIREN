from typing import TypeVar, Generic, Type, Optional, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class CRUDBase(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, db: AsyncSession, id: str) -> Optional[ModelType]:
        result = await db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def list(self, db: AsyncSession, skip: int = 0, limit: int = 100, **filters) -> List[ModelType]:
        query = select(self.model)
        for key, value in filters.items():
            if value is not None:
                query = query.where(getattr(self.model, key) == value)
        result = await db.execute(query.offset(skip).limit(limit))
        return result.scalars().all()

    async def create(self, db: AsyncSession, obj_in: dict) -> ModelType:
        obj = self.model(**obj_in)
        db.add(obj)
        await db.flush()
        return obj

    async def update(self, db: AsyncSession, db_obj: ModelType, obj_in: dict) -> ModelType:
        for field, value in obj_in.items():
            if value is not None:
                setattr(db_obj, field, value)
        await db.flush()
        return db_obj

    async def delete(self, db: AsyncSession, id: str) -> bool:
        obj = await self.get(db, id)
        if not obj:
            return False
        await db.delete(obj)
        await db.flush()
        return True

    async def count(self, db: AsyncSession, **filters) -> int:
        query = select(func.count()).select_from(self.model)
        for key, value in filters.items():
            if value is not None:
                query = query.where(getattr(self.model, key) == value)
        result = await db.execute(query)
        return result.scalar()
