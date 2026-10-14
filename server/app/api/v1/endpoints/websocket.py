"""
Temps réel : WSS /api/v1/ws?token=<accessToken>&childId=<id>
Messages : {"event": "position_update" | "risk_update" | "alert", "data": {...}}

Codes de fermeture : 4001 jeton invalide/expiré, 4003 accès refusé à cet enfant.
Indisponible derrière Passenger (o2switch mutualisé) : l'app bascule en polling.
"""
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.core.authz import get_child_access
from app.core.database import async_session_factory
from app.core.security import decode_token
from app.crud.user import crud_user
from app.services.websocket_manager import manager

router = APIRouter()


@router.websocket("")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...), childId: str = Query(...)):
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001)
        return

    # Autorisation AVANT d'accepter : sans elle, n'importe quel compte pouvait
    # suivre en direct la position de n'importe quel enfant.
    async with async_session_factory() as db:
        user = await crud_user.get(db, payload.get("sub"))
        if not user or user.deleted_at is not None:
            await websocket.close(code=4001)
            return
        try:
            access = await get_child_access(db, user, childId)
        except HTTPException:
            await websocket.close(code=4003)
            return

    await manager.connect(childId, websocket, permissions=access.permissions, is_principal=access.is_principal)
    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(childId, websocket)
