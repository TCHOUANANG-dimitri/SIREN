from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.child import crud_child

router = APIRouter()


@router.get("/{child_id}/search-zone")
async def get_search_zone(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    return {
        "childId": child_id,
        "lastPoint": {"lat": 0, "lon": 0},
        "generatedAt": None,
        "confidence": 0,
        "cells": [],
        "topZones": [],
    }


@router.post("/{child_id}/disappearance", status_code=status.HTTP_202_ACCEPTED)
async def post_disappearance(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return {"accepted": True}