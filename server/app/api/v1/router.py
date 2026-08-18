from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, users, children, places, geofences,
    risk, alerts, sharing, community, device_ingestion,
    search_zone, emergency_contacts, audio, websocket,
    tracking, device_settings
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router, prefix="/auth", tags=["Authentification"])
api_router.include_router(users.router, prefix="/users", tags=["Utilisateurs"])
api_router.include_router(children.router, prefix="/children", tags=["Enfants"])
api_router.include_router(places.router, prefix="/children", tags=["Lieux"])
api_router.include_router(geofences.router, prefix="/children", tags=["Périmètres"])
api_router.include_router(risk.router, prefix="/children", tags=["Risque"])
api_router.include_router(alerts.router, prefix="/children", tags=["Alertes"])
api_router.include_router(sharing.router, prefix="/children", tags=["Partage"])
api_router.include_router(community.router, prefix="/community", tags=["Communauté"])
api_router.include_router(search_zone.router, prefix="/children", tags=["Zone de recherche"])
api_router.include_router(emergency_contacts.router, prefix="/children", tags=["Contacts d'urgence"])
api_router.include_router(audio.router, prefix="/children", tags=["Audio"])
api_router.include_router(tracking.router, prefix="/children", tags=["Tracking"])
api_router.include_router(device_settings.router, prefix="/children", tags=["Device Settings"])
api_router.include_router(device_ingestion.router, prefix="/device", tags=["Ingestion dispositif"])
api_router.include_router(websocket.router, prefix="/ws", tags=["Temps réel WebSocket"])