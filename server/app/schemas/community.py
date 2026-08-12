from pydantic import BaseModel, Field
from typing import Optional


class CommunityReportCreateRequest(BaseModel):
    description: str = Field(..., min_length=10)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class CommunityReportResponse(BaseModel):
    id: str
    description: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    secteur: Optional[str] = None
    created_at: str
    author_nom: Optional[str] = None
