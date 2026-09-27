import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {"sub": subject, "exp": expire, "type": "access", "jti": str(uuid.uuid4())}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    # jti : deux jetons émis dans la même seconde restent distincts (rotation fiable).
    payload = {"sub": subject, "exp": expire, "type": "refresh", "jti": str(uuid.uuid4())}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def hash_token(token: str) -> str:
    """Empreinte déterministe d'un jeton opaque (refresh) pour le retrouver en base.

    bcrypt est salé : deux hachages du même jeton diffèrent, ce qui rendait la
    recherche par empreinte impossible (le rafraîchissement échouait toujours).
    Le jeton étant long et aléatoire, SHA-256 suffit ici.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
