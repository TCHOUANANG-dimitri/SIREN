"""
Contrôle d'accès aux données d'un enfant (RBAC — CDC App §2, §4.5).

Toute route qui expose ou modifie une donnée liée à un enfant DOIT passer par
`get_child_access`. Le client n'est jamais source d'autorité : les droits
affichés par l'application ne sont qu'un confort, la décision est prise ici.

Règles :
  - le parent propriétaire (principal) a tous les droits ;
  - un secondaire n'a que les droits cochés, et seulement si son accès est « actif » ;
  - toute autre personne reçoit 404 (on ne confirme pas l'existence de l'enfant).
"""

from dataclasses import dataclass
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ALL_PERMISSIONS = frozenset(
    {
        "position_precise",
        "etat_zone",
        "alertes_prealerte",
        "alertes_urgence",
        "historique",
        "mobilisation",
    }
)

# Plafond de proches (secondaires invités ou actifs) par enfant — CDC App §2.
MAX_SECONDARIES_PER_CHILD = 3


@dataclass(frozen=True)
class ChildAccess:
    child: object
    user_id: str
    is_principal: bool
    permissions: frozenset

    def has(self, permission: str) -> bool:
        return self.is_principal or permission in self.permissions

    def require(self, permission: str) -> None:
        if not self.has(permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Droit non accordé")

    def require_any(self, *permissions: str) -> None:
        if not any(self.has(p) for p in permissions):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Droit non accordé")

    def require_principal(self) -> None:
        if not self.is_principal:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Action réservée au parent principal")


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable")


def _status_value(value) -> str:
    return getattr(value, "value", value)


def resolve_access(child, user, share) -> ChildAccess:
    """Décision pure (testable sans base) à partir de l'enfant, de l'utilisateur et de son partage éventuel."""
    if child is None or getattr(child, "deleted_at", None) is not None:
        raise _not_found()
    if child.parent_id == user.id:
        return ChildAccess(child=child, user_id=user.id, is_principal=True, permissions=ALL_PERMISSIONS)
    if share is None or _status_value(share.status) != "actif":
        raise _not_found()
    granted = frozenset(p for p in (share.permissions or []) if p in ALL_PERMISSIONS)
    return ChildAccess(child=child, user_id=user.id, is_principal=False, permissions=granted)


async def get_child_access(db: AsyncSession, user, child_id: str) -> ChildAccess:
    from app.crud.child import crud_child
    from app.models.sharing import SecondaryAccess

    child = await crud_child.get(db, child_id)
    share = None
    if child is not None and child.parent_id != user.id:
        result = await db.execute(
            select(SecondaryAccess).where(
                SecondaryAccess.child_id == child_id,
                SecondaryAccess.user_id == user.id,
                SecondaryAccess.status == "actif",
            )
        )
        share = result.scalars().first()
    return resolve_access(child, user, share)


async def log_secondary_access(db: AsyncSession, access: ChildAccess, info_type: str) -> None:
    """Journal « qui a consulté quoi » côté parent (CDC App §4.5) — secondaires uniquement."""
    if access.is_principal:
        return
    from app.models.sharing import AccessAudit

    db.add(AccessAudit(child_id=access.child.id, user_id=access.user_id, info_type=info_type))
    await db.flush()


def check_secondary_quota(current_shares: Iterable, exclude_id: Optional[str] = None) -> None:
    """Refuse d'aller au-delà de MAX_SECONDARIES_PER_CHILD accès non révoqués."""
    active = [s for s in current_shares if _status_value(s.status) != "revoque" and s.id != exclude_id]
    if len(active) >= MAX_SECONDARIES_PER_CHILD:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Nombre maximal de proches atteint ({MAX_SECONDARIES_PER_CHILD})",
        )


def sanitize_permissions(values) -> list:
    """Ne conserve que les droits connus (moindre privilège)."""
    return sorted({p for p in (values or []) if p in ALL_PERMISSIONS})
