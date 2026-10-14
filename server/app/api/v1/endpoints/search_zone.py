from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/{child_id}/search-zone")
async def get_search_zone(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_any("mobilisation", "position_precise")
    # BLOQUANT (IA) : le module « zone de recherche » (CDC IA §2, IA-06) n'est pas
    # encore branché. Réponse vide explicite : `generatedAt` nul = pas encore calculée.
    return {
        "childId": child_id,
        "lastPoint": None,
        "generatedAt": None,
        "confidence": 0,
        "cells": [],
        "topZones": [],
    }


@router.post("/{child_id}/disappearance", status_code=status.HTTP_202_ACCEPTED)
async def post_disappearance(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    # BLOQUANT : ni passage de l'état en « disparition », ni notification des
    # secondaires, ni fiche autorités ne sont encore implémentés côté serveur.
    return {"accepted": True}
