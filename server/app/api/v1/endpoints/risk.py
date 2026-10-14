from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.risk import crud_risk
from app.models.user import User
from app.services.fusion_score import THRESHOLD_PREALERTE, THRESHOLD_URGENCE

router = APIRouter()


def risk_dict(child_id, r):
    return {
        "childId": child_id,
        "score": r.score,
        "state": r.state,
        "confidence": r.confidence,
        "reasons": (r.reasons or {}).get("reasons", []),
        "subScores": r.sub_scores or {},
        "timestamp": r.ts.isoformat(),
    }


@router.get("/{child_id}/risk")
async def get_risk(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    latest = await crud_risk.get_latest(db, child_id)
    if not latest:
        return {
            "childId": child_id,
            "score": 0,
            "state": "veille",
            "confidence": access.child.model_confidence,
            "reasons": [],
            "subScores": {"geo": 0, "mouvement": 0, "universel": 0, "declaratif": 0},
            "timestamp": None,
        }
    return risk_dict(child_id, latest)


@router.get("/{child_id}/risk/history")
async def get_risk_history(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await get_child_access(db, current_user, child_id)
    history = await crud_risk.get_history(db, child_id, hours=24)
    return {"scores": [risk_dict(child_id, r) for r in history]}


@router.get("/{child_id}/risk/config")
async def get_risk_config(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Seuils en vigueur (source unique : le moteur de fusion) — l'app ne les code plus en dur."""
    await get_child_access(db, current_user, child_id)
    return {"thresholds": {"prealerte": THRESHOLD_PREALERTE, "urgence": THRESHOLD_URGENCE}}
