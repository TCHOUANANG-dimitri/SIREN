import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional

# Politique CDC App §4.1 — identique à src/features/auth/passwordPolicy.ts côté app.
PASSWORD_MIN_LENGTH = 10


def validate_password_policy(value: str) -> str:
    checks = [
        (len(value) >= PASSWORD_MIN_LENGTH, f"{PASSWORD_MIN_LENGTH} caractères minimum"),
        (re.search(r"[a-z]", value) is not None, "une minuscule"),
        (re.search(r"[A-Z]", value) is not None, "une majuscule"),
        (re.search(r"[0-9]", value) is not None, "un chiffre"),
        (re.search(r"[^A-Za-z0-9]", value) is not None, "un symbole"),
    ]
    missing = [label for ok, label in checks if not ok]
    if missing:
        raise ValueError("Mot de passe trop faible : " + ", ".join(missing))
    return value


class RegisterRequest(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    telephone: Optional[str] = Field(None, max_length=30)
    password: str = Field(..., max_length=128)

    _policy = field_validator("password")(validate_password_policy)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)


class TokenResponse(BaseModel):
    accessToken: str
    refreshToken: str
    twofaRequired: Optional[bool] = False


class RefreshRequest(BaseModel):
    refreshToken: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class OtpRequest(BaseModel):
    destination: Optional[str] = None


class OtpVerifyRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=10)
    accessToken: Optional[str] = None


class TFACodeRequest(BaseModel):
    tempToken: str
    code: str


class UserPatchRequest(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=150)
    langue: Optional[str] = Field(None, pattern="^(fr|en)$")
    telephone: Optional[str] = Field(None, max_length=30)


class PushTokenRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)
    platform: str = Field("fcm", pattern="^(fcm|apns)$")
