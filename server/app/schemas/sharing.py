from pydantic import BaseModel, Field
from typing import Optional, List


class ShareCreateRequest(BaseModel):
    userIdentifier: str = Field(..., description="Email ou ID de l'utilisateur à inviter")
    permissions: List[str] = Field(..., min_length=1)


class ShareResponse(BaseModel):
    id: str
    child_id: str
    user_id: str
    nom: str
    permissions: list
    status: str
    invited_at: str


class SharePatchRequest(BaseModel):
    permissions: Optional[List[str]] = None
    status: Optional[str] = None


class AuditEntryResponse(BaseModel):
    id: int
    child_id: str
    user_id: str
    info_type: str
    ts: str
