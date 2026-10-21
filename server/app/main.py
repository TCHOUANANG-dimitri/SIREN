"""
SIREN — Point d'entrée du serveur FastAPI
Démarrage : uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.security_headers import SecurityHeadersMiddleware
from app.api.v1.router import api_router
from app.services.websocket_manager import redis_listener

# Exécuté à l'import (y compris sous Passenger, qui ne déclenche pas le lifespan) :
# un serveur de staging/production ne démarre jamais avec les secrets d'exemple.
_unsafe = settings.unsafe_production_settings()
if _unsafe:
    raise RuntimeError("Configuration dangereuse : " + " ; ".join(_unsafe))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.SENTRY_DSN:
        import sentry_sdk
        sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENVIRONMENT)
    task = None
    # Le relais Redis est indispensable dès que Redis est actif : sans lui, plus rien
    # n'atteindrait les sockets (publication exclusivement via Redis).
    if settings.REDIS_ENABLED:
        import asyncio
        task = asyncio.create_task(redis_listener())
    yield
    if task:
        task.cancel()


_docs = settings.ENVIRONMENT == "development"
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    # La documentation interactive n'est exposée qu'en développement.
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.VERSION, "environment": settings.ENVIRONMENT}


@app.get("/health/ready")
async def readiness():
    """Prêt à servir : la base répond AVEC les identifiants de l'application (contrôle du déploiement)."""
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.core.database import async_session_factory

    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable", "version": settings.VERSION})
    return {"status": "ok", "version": settings.VERSION}
