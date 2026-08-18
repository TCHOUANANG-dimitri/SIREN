from pydantic import BaseModel, Field
from typing import Optional, List


class ScheduleInput(BaseModel):
    jours: List[int] = Field(..., min_length=1, max_length=7)
    heureDebut: str
    heureFin: str


class PlaceCreateRequest(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radiusM: float = Field(default=50, ge=10)
    schedule: Optional[ScheduleInput] = None


class PlacePatchRequest(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=150)
    radiusM: Optional[float] = Field(None, ge=10)