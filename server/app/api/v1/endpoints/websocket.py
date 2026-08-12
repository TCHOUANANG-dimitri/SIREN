"""
Point d'entrée WebSocket pour le temps réel.
Connexion : WSS /ws?token=<accessToken>&childId=<child_id>
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.security import decode_token
from app.services.websocket_manager import manager

router = APIRouter()


@router.websocket("")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...), childId: str = Query(None)):
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")
    target_child_id = childId or "global"

    await manager.connect(target_child_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo or handle incoming messages
    except WebSocketDisconnect:
        manager.disconnect(target_child_id, websocket)