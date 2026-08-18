from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class RegisterRequest(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    telephone: Optional[str] = None
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    accessToken: str
    refreshToken: str
    twofaRequired: Optional[bool] = False


class RefreshRequest(BaseModel):
    refreshToken: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class TFACodeRequest(BaseModel):
    tempToken: str
    code: str


class UserPatchRequest(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=150)
    langue: Optional[str] = None
    telephone: Optional[str] = None