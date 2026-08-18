from pydantic import BaseModel
from typing import Optional


class AlertResponse(BaseModel):
    id: str
    child_id: str
    level: str
    score: int
    reasons: Optional[list] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    status: str
    created_at: str
    resolved_at: Optional[str] = None


class AlertPatchRequest(BaseModel):
    status: str
