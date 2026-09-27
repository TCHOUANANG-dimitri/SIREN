from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.emergency_contact import crud_emergency_contact
from app.models.user import User

router = APIRouter()


class ContactCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    telephone: str = Field(..., pattern=r"^\+?[0-9 .-]{6,20}$")


def _contact_dict(c):
    return {"id": c.id, "childId": c.child_id, "nom": c.nom, "telephone": c.telephone}


@router.get("/{child_id}/emergency-contacts")
async def list_contacts(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_any("alertes_urgence", "mobilisation")
    return [_contact_dict(c) for c in await crud_emergency_contact.list(db, child_id=child_id)]


@router.post("/{child_id}/emergency-contacts", status_code=status.HTTP_201_CREATED)
async def create_contact(child_id: str, req: ContactCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    contact = await crud_emergency_contact.create(db, {"child_id": child_id, "nom": req.nom.strip(), "telephone": req.telephone.strip()})
    return _contact_dict(contact)
