"""
Diffusion temps réel par enfant, filtrée selon les droits de chaque abonné.

Avec Redis (multi-processus), la diffusion passe UNIQUEMENT par Redis : chaque
processus relaie à ses propres sockets. Sans Redis, diffusion directe. (Avant :
les deux chemins s'ajoutaient et chaque message arrivait en double.)
"""

import json
from dataclasses import dataclass
from typing import Dict, Optional

from fastapi import WebSocket

from app.core.config import settings

CHANNEL = "siren:realtime"

# Droit requis pour recevoir chaque type d'événement (None = tout accès à l'enfant).
EVENT_PERMISSION = {
    "position_update": "position_precise",
    "risk_update": None,
    "alert": None,  # filtré plus finement selon le niveau
}

_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        from redis.asyncio import Redis

        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


@dataclass
class Subscriber:
    socket: WebSocket
    permissions: frozenset
    is_principal: bool

    def may_receive(self, event: str, data: dict) -> bool:
        if self.is_principal:
            return True
        if event == "alert":
            needed = "alertes_urgence" if data.get("level") == "urgence" else "alertes_prealerte"
            return needed in self.permissions
        needed = EVENT_PERMISSION.get(event)
        return needed is None or needed in self.permissions


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, Dict[int, Subscriber]] = {}

    async def connect(self, child_id: str, ws: WebSocket, permissions=frozenset(), is_principal: bool = False):
        await ws.accept()
        self.active.setdefault(child_id, {})[id(ws)] = Subscriber(ws, frozenset(permissions), is_principal)

    def disconnect(self, child_id: str, ws: WebSocket):
        subs = self.active.get(child_id)
        if subs is not None:
            subs.pop(id(ws), None)
            if not subs:
                del self.active[child_id]

    async def broadcast_to_child(self, child_id: str, event: str, data: dict):
        message = json.dumps({"event": event, "data": data})
        for sub in list(self.active.get(child_id, {}).values()):
            if not sub.may_receive(event, data):
                continue
            try:
                await sub.socket.send_text(message)
            except Exception:
                self.disconnect(child_id, sub.socket)


manager = ConnectionManager()


async def _publish(child_id: str, event: str, data: dict):
    if settings.REDIS_ENABLED:
        await _get_redis().publish(CHANNEL, json.dumps({"child_id": child_id, "event": event, "data": data}))
    else:
        await manager.broadcast_to_child(child_id, event, data)


async def publish_position(child_id: str, data: dict):
    await _publish(child_id, "position_update", data)


async def publish_risk(child_id: str, data: dict):
    await _publish(child_id, "risk_update", data)


async def publish_alert(child_id: str, data: dict):
    await _publish(child_id, "alert", data)


async def redis_listener():
    pubsub = _get_redis().pubsub()
    await pubsub.subscribe(CHANNEL)
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            payload = json.loads(message["data"])
        except (TypeError, ValueError):
            continue
        child_id: Optional[str] = payload.get("child_id")
        if child_id and payload.get("event"):
            await manager.broadcast_to_child(child_id, payload["event"], payload.get("data") or {})
