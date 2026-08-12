from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.emergency_contact import crud_emergency_contact
from app.crud.child import crud_child

router = APIRouter()


@router.get("/{child_id}/emergency-contacts")
async def list_contacts(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    contacts = await crud_emergency_contact.list(db, child_id=child_id)
    return [{
        "id": c.id,
        "childId": c.child_id,
        "nom": c.nom,
        "telephone": c.telephone,
    } for c in contacts]


@router.post("/{child_id}/emergency-contacts", status_code=status.HTTP_201_CREATED)
async def create_contact(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    contact = await crud_emergency_contact.create(db, {
        "child_id": child_id,
        "nom": req.get("nom"),
        "telephone": req.get("telephone"),
    })
    return {
        "id": contact.id,
        "childId": contact.child_id,
        "nom": contact.nom,
        "telephone": contact.telephone,
    }