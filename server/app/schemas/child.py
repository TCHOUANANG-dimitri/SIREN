from pydantic import BaseModel, Field
from typing import List, Optional


class ScheduleIn(BaseModel):
    jours: List[int] = Field(..., min_length=1, max_length=7)
    heureDebut: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    heureFin: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class ChildCreateRequest(BaseModel):
    prenom: str = Field(..., min_length=1, max_length=100)
    deviceId: str = Field(..., min_length=1, max_length=50)
    photoUrl: Optional[str] = Field(None, max_length=2048)


class ChildPatchRequest(BaseModel):
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    sleepSchedule: Optional[ScheduleIn] = None
