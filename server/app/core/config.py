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
    # "disabled" (étape déclarée non requise, À VALIDER par l'équipe),
    # "live" (code aléatoire à usage unique livré par SMS, WhatsApp ou e-mail vérifié —
    # canaux configurés par SMS_PROVIDER/TWILIO_*/AFRICASTALKING_*, WHATSAPP_*, EMAIL_BACKEND).
    # "email" et "provider" sont d'anciens noms de "live".
    OTP_MODE: str = ""
    DEV_OTP_CODE: str = "123456"
    # Codes à usage unique : alphanumériques (sans caractères ambigus), 6 caractères au plus.
    OTP_LENGTH: int = 6
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_S: int = 60
    OTP_MAX_PER_HOUR: int = 5
    OTP_MAX_PER_DESTINATION_PER_HOUR: int = 5
    OTP_MAX_PER_IP_PER_HOUR: int = 20
    # Région utilisée pour interpréter un numéro saisi sans indicatif international.
    PHONE_DEFAULT_REGION: str = "CM"

    # Livraison des codes par SMS : "" (désactivé) | "twilio" | "africastalking".
    SMS_PROVIDER: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM: str = ""
    AFRICASTALKING_USERNAME: str = ""
    AFRICASTALKING_API_KEY: str = ""
    AFRICASTALKING_SENDER_ID: str = ""
    # Livraison par WhatsApp (API Cloud de Meta, modèle « authentication » approuvé).
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_TEMPLATE_NAME: str = ""
    WHATSAPP_GRAPH_VERSION: str = "v21.0"
    OTP_HTTP_TIMEOUT_S: int = 10

    # Limitation de débit (fenêtres glissantes, table rate_limit_events).
    LOGIN_MAX_FAILURES_PER_ACCOUNT: int = 5
    LOGIN_MAX_FAILURES_PER_IP: int = 30
    LOGIN_FAILURE_WINDOW_S: int = 900
    REGISTER_MAX_PER_IP_PER_HOUR: int = 10
    PAIRING_MAX_FAILURES_PER_USER: int = 5
    PAIRING_FAILURE_WINDOW_S: int = 900
    DEVICE_LOOKUP_MAX_PER_USER_PER_HOUR: int = 30
    # En-tête X-Forwarded-For pris en compte uniquement derrière le reverse proxy (Caddy,
    # Apache/Passenger). Désactivé par défaut : une API joignable directement (port publié)
    # laisserait sinon le client choisir son IP et contourner les limites par IP.
    TRUST_PROXY_HEADERS: bool = False

    # Protocole dispositif (docs/transition-données-serveur.pdf, §7.3-7.4, §11) :
    # clé HMAC-SHA256 partagée avec le firmware pour signer les commandes et vérifier les accusés.
    DEVICE_COMMAND_SIGNING_KEY: str = ""
    # Canal descendant vers le dispositif : "" (aucun — la commande échoue honnêtement) | "mqtt".
    DEVICE_COMMAND_CHANNEL: str = ""
    DEVICE_COMMAND_TIMEOUT_S: int = 120

    # Emails transactionnels (app/services/email) : "disabled" | "console" (dev) | "smtp".
    EMAIL_BACKEND: str = "disabled"
    EMAIL_FROM: str = ""
    EMAIL_FROM_NAME: str = "SIREN"
    EMAIL_REPLY_TO: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_S: int = 15
    # Écoute audio (étiquettes) : BLOQUÉE tant que le cadre juridique n'est pas validé (CDC App §4.4).
    AUDIO_ENABLED: bool = False

    @property
    def otp_mode(self) -> str:
        # « live » : vrais fournisseurs (SMS, WhatsApp, e-mail) ; « email »/« provider » : anciens noms.
        mode = "live" if self.OTP_MODE in ("provider", "email") else self.OTP_MODE
        if mode in ("dev", "disabled", "live"):
            # Le code fixe n'est jamais accepté hors développement.
            return "disabled" if mode == "dev" and self.ENVIRONMENT != "development" else mode
        return "dev" if self.ENVIRONMENT == "development" else "disabled"
    # Au-delà, un point de télémétrie est considéré comme hors d'usage (horloge device déréglée).
    TELEMETRY_MAX_FUTURE_SKEW_S: int = 300

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True
        # Le même .env sert à Docker Compose (POSTGRES_*, SIREN_API_PORT…) : ces clés
        # ne concernent pas l'application et ne doivent pas empêcher son démarrage.
        extra = "ignore"


    def unsafe_production_settings(self) -> List[str]:
        """Réglages par défaut inacceptables hors développement (secrets d'exemple, CORS ouvert)."""
        if self.ENVIRONMENT == "development":
            return []
        problems = []
        for name in ("SECRET_KEY", "JWT_SECRET_KEY"):
            value = getattr(self, name)
            # Valeurs d'exemple des modèles (.env.example, env.prod.example) : jamais en service.
            if value.startswith(("changez-moi", "a-remplacer")) or len(value) < 32:
                problems.append(f"{name} doit être un secret fort (≥ 32 caractères, non par défaut)")
        if "*" in self.origins:
            problems.append("ALLOWED_ORIGINS ne doit pas contenir *")
        if self.DEVICE_COMMAND_CHANNEL and len(self.DEVICE_COMMAND_SIGNING_KEY) < 32:
            problems.append("DEVICE_COMMAND_SIGNING_KEY doit être un secret fort (≥ 32 caractères) si un canal de commande est actif")
        if self.DEV_OTP_CODE and self.OTP_MODE == "dev":
            problems.append("OTP_MODE=dev est interdit hors développement")
        elif self.OTP_MODE not in ("live", "provider", "email", "disabled"):
            # Valeur vide ou inconnue : otp_mode retomberait en silence sur « disabled »
            # (aucune vérification). Désactiver les codes doit être un choix écrit.
            problems.append("OTP_MODE doit valoir live (ou disabled, explicitement) hors développement")
        if self.OTP_LENGTH != 6:
            # L'application attend un code de 6 caractères (src/features/auth/otpCode.ts) :
            # un code plus court ne pourrait jamais être saisi en entier.
            problems.append("OTP_LENGTH doit valoir 6 (longueur attendue par l'application)")
        return problems


settings = Settings()
