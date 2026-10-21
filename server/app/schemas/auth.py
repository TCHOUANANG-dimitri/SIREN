import re
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Literal, Optional

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


OtpChannel = Literal["sms", "whatsapp", "email"]


class RegisterRequest(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    # Téléphone OBLIGATOIRE (normalisé E.164 par l'API) ; e-mail FACULTATIF.
    telephone: str = Field(..., min_length=4, max_length=30)
    email: Optional[EmailStr] = None
    password: str = Field(..., max_length=128)
    # Langue de l'interface au moment de l'inscription (emails et push suivants).
    langue: Optional[str] = Field(None, pattern="^(fr|en)$")
    # Versions des documents juridiques acceptées (src/legal/registry.ts côté app).
    acceptedTermsVersion: Optional[str] = Field(None, max_length=20)
    acceptedPrivacyVersion: Optional[str] = Field(None, max_length=20)

    _policy = field_validator("password")(validate_password_policy)


class LoginRequest(BaseModel):
    # Numéro de téléphone (tout format, normalisé) ou adresse e-mail.
    identifier: Optional[str] = Field(None, min_length=3, max_length=255)
    # Compatibilité v1 : ancien champ « email ».
    email: Optional[str] = Field(None, max_length=255)
    password: str = Field(..., max_length=128)

    def login_identifier(self) -> str:
        return (self.identifier or self.email or "").strip()


class TokenResponse(BaseModel):
    accessToken: str
    refreshToken: str
    twofaRequired: Optional[bool] = False


class RefreshRequest(BaseModel):
    refreshToken: str


class ForgotPasswordRequest(BaseModel):
    identifier: Optional[str] = Field(None, min_length=3, max_length=255)
    email: Optional[str] = Field(None, max_length=255)  # compatibilité v1
    channel: OtpChannel = "sms"

    def login_identifier(self) -> str:
        return (self.identifier or self.email or "").strip()


class OtpRequest(BaseModel):
    destination: Optional[str] = None  # ignoré : la destination est toujours celle du compte
    accessToken: Optional[str] = None
    channel: OtpChannel = "sms"
    # phone : vérification du numéro (inscription) ; email : vérification de l'adresse.
    target: Literal["phone", "email"] = "phone"


class OtpVerifyRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=10)
    accessToken: Optional[str] = None
    challengeToken: Optional[str] = Field(None, max_length=128)


class ChallengeRequest(BaseModel):
    challengeToken: str = Field(..., min_length=10, max_length=128)


class TwoFactorSendRequest(BaseModel):
    mfaToken: str = Field(..., min_length=10, max_length=2048)
    channel: OtpChannel = "sms"


class PhoneChangeRequest(BaseModel):
    currentPassword: str = Field(..., min_length=1, max_length=128)
    newPhone: str = Field(..., min_length=4, max_length=30)
    channel: Literal["sms", "whatsapp"] = "sms"


class PhoneConfirmRequest(ChallengeRequest):
    code: str = Field(..., min_length=4, max_length=10)


class TwoFactorVerifyRequest(ChallengeRequest):
    code: str = Field(..., min_length=4, max_length=10)


class ResetPasswordRequest(ChallengeRequest):
    code: str = Field(..., min_length=4, max_length=10)
    newPassword: str = Field(..., max_length=128)

    _policy = field_validator("newPassword")(validate_password_policy)


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(..., max_length=128)
    newPassword: str = Field(..., max_length=128)

    _policy = field_validator("newPassword")(validate_password_policy)


class TwoFactorToggleRequest(BaseModel):
    enabled: bool
    password: str = Field(..., max_length=128)


class UserPatchRequest(BaseModel):
    # Le téléphone ne se modifie PAS ici : POST /users/me/phone (mot de passe + code).
    model_config = ConfigDict(extra="forbid")

    nom: Optional[str] = Field(None, min_length=1, max_length=150)
    langue: Optional[str] = Field(None, pattern="^(fr|en)$")


class PushTokenRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)
    platform: str = Field("fcm", pattern="^(fcm|apns)$")
