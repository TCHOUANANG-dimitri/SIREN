from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.sharing import crud_share, crud_audit
from app.crud.child import crud_child
from app.crud.user import crud_user

router = APIRouter()


async def _share_dict(db, s):
    user = await crud_user.get(db, s.user_id)
    return {
        "id": s.id,
        "childId": s.child_id,
        "userId": s.user_id,
        "nom": user.nom if user else "Inconnu",
        "permissions": s.permissions,
        "status": s.status,
        "invitedAt": s.invited_at.isoformat(),
    }


@router.get("/{child_id}/shares")
async def list_shares(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    shares = await crud_share.list_by_child(db, child_id)
    return [await _share_dict(db, s) for s in shares]


@router.post("/{child_id}/shares", status_code=status.HTTP_201_CREATED)
async def create_share(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Recherche par email ou téléphone
    identifier = req.get("userIdentifier")
    target_user = await crud_user.get_by_email(db, identifier)
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    existing = await crud_share.get_active(db, child_id, target_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="Partage déjà existant")

    share = await crud_share.create(db, {
        "child_id": child_id,
        "user_id": target_user.id,
        "permissions": req.get("permissions", []),
        "status": "invite",
    })
    return await _share_dict(db, share)


@router.get("/shares/{share_id}")
async def get_share(share_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    share = await crud_share.get(db, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Partage introuvable")
    return await _share_dict(db, share)


@router.patch("/shares/{share_id}")
async def patch_share(share_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    share = await crud_share.get(db, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Partage introuvable")

    update = {}
    if req.get("permissions") is not None:
        update["permissions"] = req["permissions"]
    if req.get("status") is not None:
        update["status"] = req["status"]
        if req["status"] in ("actif", "revoque"):
            from datetime import datetime, timezone
            update["responded_at"] = datetime.now(timezone.utc)

    updated = await crud_share.update(db, share, update)
    return await _share_dict(db, updated)


@router.get("/{child_id}/permissions")
async def get_my_permissions(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role == "principal":
        child = await crud_child.get(db, child_id)
        if child and child.parent_id == current_user.id:
            return ["position_precise", "etat_zone", "alertes_prealerte", "alertes_urgence", "historique", "mobilisation"]
    share = await crud_share.get_active(db, child_id, current_user.id)
    return share.permissions if share else []


@router.get("/{child_id}/shares/audit")
async def list_audit(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    entries = await crud_share.list_audit(db, child_id)
    result = []
    for e in entries:
        user = await crud_user.get(db, e.user_id)
        result.append({
            "id": e.id,
            "childId": e.child_id,
            "secondaryUserId": e.user_id,
            "secondaryNom": user.nom if user else "Inconnu",
            "infoType": e.info_type,
            "timestamp": e.ts.isoformat(),
        })
    return result