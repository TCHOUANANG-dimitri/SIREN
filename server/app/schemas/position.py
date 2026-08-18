from pydantic import BaseModel, Field
from typing import Optional


class PositionResponse(BaseModel):
    lat: float
    lon: float
    speed_kmh: Optional[float] = None
    accuracy_m: Optional[float] = None
    heading: Optional[float] = None
    fix_quality: str
    battery: Optional[int] = None
    ts: str


class HistoryQuery(BaseModel):
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[str] = None
