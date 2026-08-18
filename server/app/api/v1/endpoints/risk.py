from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.risk import crud_risk
from app.crud.child import crud_child

router = APIRouter()


@router.get("/{child_id}/risk")
async def get_risk(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    latest = await crud_risk.get_latest(db, child_id)
    if not latest:
        return {
            "childId": child_id,
            "score": 0,
            "state": "veille",
            "confidence": child.model_confidence,
            "reasons": [],
            "subScores": {"geo": 0, "mouvement": 0, "universel": 0, "declaratif": 0},
            "timestamp": None,
        }

    return {
        "childId": child_id,
        "score": latest.score,
        "state": latest.state,
        "confidence": latest.confidence,
        "reasons": (latest.reasons or {}).get("reasons", []),
        "subScores": latest.sub_scores or {},
        "timestamp": latest.ts.isoformat(),
    }


@router.get("/{child_id}/risk/history")
async def get_risk_history(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    history = await crud_risk.get_history(db, child_id, hours=24)
    return {
        "scores": [
            {
                "childId": r.child_id,
                "score": r.score,
                "state": r.state,
                "confidence": r.confidence,
                "reasons": (r.reasons or {}).get("reasons", []),
                "subScores": r.sub_scores or {},
                "timestamp": r.ts.isoformat(),
            }
            for r in history
        ]
    }