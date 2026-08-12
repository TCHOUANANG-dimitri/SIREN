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

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
