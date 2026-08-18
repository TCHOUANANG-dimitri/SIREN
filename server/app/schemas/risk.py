from pydantic import BaseModel
from typing import Optional, List


class RiskSubScores(BaseModel):
    geo: float = 0
    mouvement: float = 0
    universel: float = 0
    declaratif: float = 0


class RiskScoreResponse(BaseModel):
    child_id: str
    score: int
    state: str
    confidence: int
    reasons: list
    sub_scores: Optional[RiskSubScores] = None
    timestamp: str


class RiskHistoryResponse(BaseModel):
    scores: list
