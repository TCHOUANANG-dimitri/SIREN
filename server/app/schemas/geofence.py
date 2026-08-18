from pydantic import BaseModel, Field
from typing import Optional


class GeofenceCreateRequest(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    type: str = Field(default="interdit", pattern="^(autorise|interdit)$")
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radiusM: float = Field(default=100, ge=10)
    notifyOnEnter: bool = True
    notifyOnExit: bool = True


class GeofencePatchRequest(BaseModel):
    nom: Optional[str] = None
    type: Optional[str] = None
    radiusM: Optional[float] = None
    notifyOnEnter: Optional[bool] = None
    notifyOnExit: Optional[bool] = None