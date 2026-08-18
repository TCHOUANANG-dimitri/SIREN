"""
Gestionnaire de connexions WebSocket avec Redis pub/sub.
Permet la diffusion en temps réel des positions, scores et alertes.
"""

import json
import asyncio
from typing import Set, Dict
from fastapi import WebSocket
from redis.asyncio import Redis
from app.core.config import settings

redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)

CHANNEL_POSITION = "siren:position"
CHANNEL_RISK = "siren:risk"
CHANNEL_ALERT = "siren:alert"


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, Set[WebSocket]] = {}

    async def connect(self, child_id: str, ws: WebSocket):
        await ws.accept()
        if child_id not in self.active:
            self.active[child_id] = set()
        self.active[child_id].add(ws)

    def disconnect(self, child_id: str, ws: WebSocket):
        if child_id in self.active:
            self.active[child_id].discard(ws)
            if not self.active[child_id]:
                del self.active[child_id]

    async def broadcast_to_child(self, child_id: str, event: str, data: dict):
        if child_id not in self.active:
            return
        message = json.dumps({"event": event, "data": data})
        for ws in self.active[child_id]:
            try:
                await ws.send_text(message)
            except Exception:
                pass

    async def broadcast_to_children(self, child_ids: list, event: str, data: dict):
        for cid in child_ids:
            await self.broadcast_to_child(cid, event, data)


manager = ConnectionManager()


async def publish_position(child_id: str, data: dict):
    await redis.publish(CHANNEL_POSITION, json.dumps({"child_id": child_id, **data}))
    await manager.broadcast_to_child(child_id, "position_update", data)


async def publish_risk(child_id: str, data: dict):
    await redis.publish(CHANNEL_RISK, json.dumps({"child_id": child_id, **data}))
    await manager.broadcast_to_child(child_id, "risk_update", data)


async def publish_alert(child_id: str, data: dict):
    await redis.publish(CHANNEL_ALERT, json.dumps({"child_id": child_id, **data}))
    await manager.broadcast_to_child(child_id, "alert", data)


async def redis_listener():
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL_POSITION, CHANNEL_RISK, CHANNEL_ALERT)
    async for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            cid = data.get("child_id")
            if cid:
                channel = message["channel"]
                event = channel.split(":")[1]
                await manager.broadcast_to_child(cid, f"{event}_update", data)
