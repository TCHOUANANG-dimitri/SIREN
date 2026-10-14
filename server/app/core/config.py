from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "SIREN"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "changez-moi-en-production"
    ALLOWED_ORIGINS: str = "http://localhost:8081,http://localhost:3000"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    DATABASE_URL: str = "postgresql+asyncpg://siren:siren_password@localhost:5432/siren"
    DATABASE_URL_SYNC: str = "postgresql://siren:siren_password@localhost:5432/siren"

    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = True
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    JWT_ALGORITHM: str = "HS256"
    JWT_SECRET_KEY: str = "changez-moi-aussi-en-production"

    FCM_CREDENTIALS_PATH: str = "./firebase-credentials.json"
    SENTRY_DSN: str = ""
    CADDY_EMAIL: str = "admin@example.com"
    DOMAIN: str = "siren.example.com"
    OSM_DATA_DIR: str = "./data/osm"
    POSITION_RETENTION_DAYS: int = 90
    # Fuseau des horaires déclarés par les parents (Cameroun : WAT, UTC+1).
    DEFAULT_TIMEZONE: str = "Africa/Douala"
    # Vérification OTP : "dev" (code fixe DEV_OTP_CODE, développement uniquement),
    # "disabled" (étape déclarée non requise — état réel tant qu'aucun fournisseur
    # SMS/email n'est choisi, À VALIDER par l'équipe), "provider" (fournisseur réel, non implémenté).
    OTP_MODE: str = ""
    DEV_OTP_CODE: str = "123456"
    # Écoute audio (étiquettes) : BLOQUÉE tant que le cadre juridique n'est pas validé (CDC App §4.4).
    AUDIO_ENABLED: bool = False

    @property
    def otp_mode(self) -> str:
        if self.OTP_MODE in ("dev", "disabled", "provider"):
            # Le code fixe n'est jamais accepté hors développement.
            return "disabled" if self.OTP_MODE == "dev" and self.ENVIRONMENT != "development" else self.OTP_MODE
        return "dev" if self.ENVIRONMENT == "development" else "disabled"
    # Au-delà, un point de télémétrie est considéré comme hors d'usage (horloge device déréglée).
    TELEMETRY_MAX_FUTURE_SKEW_S: int = 300

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


    def unsafe_production_settings(self) -> List[str]:
        """Réglages par défaut inacceptables hors développement (secrets d'exemple, CORS ouvert)."""
        if self.ENVIRONMENT == "development":
            return []
        problems = []
        for name in ("SECRET_KEY", "JWT_SECRET_KEY"):
            value = getattr(self, name)
            if value.startswith("changez-moi") or len(value) < 32:
                problems.append(f"{name} doit être un secret fort (≥ 32 caractères, non par défaut)")
        if "*" in self.origins:
            problems.append("ALLOWED_ORIGINS ne doit pas contenir *")
        return problems


settings = Settings()
