from pydantic import BaseModel
from typing import List, Optional


class SearchZoneCell(BaseModel):
    lat: float
    lon: float
    weight: float


class SearchZoneTop(BaseModel):
    lat: float
    lon: float
    label: str
    rank: int


class SearchZoneResponse(BaseModel):
    child_id: str
    last_point: dict
    generated_at: str
    confidence: float
    cells: List[SearchZoneCell]
    top_zones: List[SearchZoneTop]
