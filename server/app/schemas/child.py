from pydantic import BaseModel, Field
from typing import Optional


class ChildCreateRequest(BaseModel):
    prenom: str = Field(..., min_length=1, max_length=100)
    deviceId: str = Field(..., min_length=1, max_length=50)
    photoUrl: Optional[str] = None


class ChildPatchRequest(BaseModel):
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    sleepSchedule: Optional[dict] = None