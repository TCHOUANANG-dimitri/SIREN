from datetime import time
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


class ScheduleIn(BaseModel):
    # 0 = dimanche … 6 = samedi (convention de l'app, contrainte ck_*_schedule_jours).
    jours: List[int] = Field(..., min_length=1, max_length=7)
    heureDebut: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    heureFin: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

    @field_validator("jours")
    @classmethod
    def _jours_valides(cls, value: List[int]) -> List[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("jours : entiers de 0 (dimanche) à 6 (samedi)")
        return sorted(set(value))

    def start_time(self) -> time:
        return time.fromisoformat(self.heureDebut)

    def end_time(self) -> time:
        return time.fromisoformat(self.heureFin)


class ChildCreateRequest(BaseModel):
    prenom: str = Field(..., min_length=1, max_length=100)
    deviceId: str = Field(..., min_length=1, max_length=50)
    # Contrainte ck_children_photo_url : adresse http(s) uniquement (pas de fichier local).
    photoUrl: Optional[str] = Field(None, max_length=2048, pattern=r"^https?://")


class ChildPatchRequest(BaseModel):
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    sleepSchedule: Optional[ScheduleIn] = None
