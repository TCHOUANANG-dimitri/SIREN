from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import (
    ALL_PERMISSIONS,
    check_secondary_quota,
    get_child_access,
    sanitize_permissions,
)
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.sharing import crud_share
from app.crud.user import crud_user
from app.models.user import User

router = APIRouter()


class ShareCreate(BaseModel):
    userIdentifier: str = Field(..., min_length=3, max_length=255)
    # Tous les droits décochés par défaut (CDC App §4.5) : une liste vide est permise.
    permissions: list[str] = Field(default_factory=list)


class SharePatch(BaseModel):
    permissions: list[str] | None = None
    status: str | None = Field(None, pattern="^(actif|revoque)$")


async def _share_dict(db, s):
    user = await crud_user.get(db, s.user_id)
    return {
        "id": s.id,
        "childId": s.child_id,
        "userId": s.user_id,
        "nom": user.nom if user else "—",
        "permissions": sanitize_permissions(s.permissions),
        "status": getattr(s.status, "value", s.status),
        "invitedAt": s.invited_at.isoformat(),
    }


async def _find_user(db, identifier: str):
    identifier = identifier.strip()
    if "@" in identifier:
        return await crud_user.get_by_email(db, identifier.lower())
    result = await db.execute(select(User).where(User.telephone == identifier, User.deleted_at.is_(None)))
    return result.scalars().first()


@router.get("/{child_id}/shares")
async def list_shares(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    return [await _share_dict(db, s) for s in await crud_share.list_by_child(db, child_id)]


@router.post("/{child_id}/shares", status_code=status.HTTP_201_CREATED)
async def create_share(child_id: str, req: ShareCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()

    # BLOQUANT (email / SMS) : l'invité doit déjà avoir un compte ; aucune invitation
    # n'est envoyée tant qu'aucun fournisseur n'est branché (CDC App §10).
    target_user = await _find_user(db, req.userIdentifier)
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=422, detail="Impossible de s'inviter soi-même")

    existing = await crud_share.list_by_child(db, child_id)
    if any(s.user_id == target_user.id and getattr(s.status, "value", s.status) != "revoque" for s in existing):
        raise HTTPException(status_code=409, detail="Partage déjà existant")
    check_secondary_quota(existing)

    share = await crud_share.create(db, {
        "child_id": child_id,
        "user_id": target_user.id,
        "permissions": sanitize_permissions(req.permissions),
        "status": "invite",
    })
    return await _share_dict(db, share)


@router.get("/shares/{share_id}")
async def get_share(share_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    share = await crud_share.get(db, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Partage introuvable")
    if share.user_id != current_user.id:
        access = await get_child_access(db, current_user, share.child_id)
        access.require_principal()
    return await _share_dict(db, share)


@router.patch("/shares/{share_id}")
async def patch_share(share_id: str, req: SharePatch, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    share = await crud_share.get(db, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Partage introuvable")
    current_status = getattr(share.status, "value", share.status)
    is_invitee = share.user_id == current_user.id

    if is_invitee:
        # L'invité peut accepter (invite → actif) ou se retirer (→ revoque), jamais changer ses droits.
        if req.permissions is not None:
            raise HTTPException(status_code=403, detail="Seul le parent modifie les droits")
        if req.status == "actif" and current_status != "invite":
            raise HTTPException(status_code=409, detail="Invitation non valide")
    else:
        access = await get_child_access(db, current_user, share.child_id)
        access.require_principal()
        if req.status == "actif" and current_status != "actif":
            # Réactiver un accès compte à nouveau dans le plafond.
            check_secondary_quota(await crud_share.list_by_child(db, share.child_id), exclude_id=share.id)

    update = {}
    if req.permissions is not None:
        update["permissions"] = sanitize_permissions(req.permissions)
    if req.status is not None:
        update["status"] = req.status
        update["responded_at"] = datetime.now(timezone.utc)
    updated = await crud_share.update(db, share, update)
    return await _share_dict(db, updated)


@router.get("/{child_id}/permissions")
async def get_my_permissions(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    return sorted(ALL_PERMISSIONS) if access.is_principal else sorted(access.permissions)


@router.get("/{child_id}/shares/audit")
async def list_audit(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    result = []
    for e in await crud_share.list_audit(db, child_id):
        user = await crud_user.get(db, e.user_id)
        result.append({
            "id": e.id,
            "childId": e.child_id,
            "secondaryUserId": e.user_id,
            "secondaryNom": user.nom if user else "—",
            "infoType": e.info_type,
            "timestamp": e.ts.isoformat(),
        })
    return result
