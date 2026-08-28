"""
Realtime WebSocket endpoint: /ws

Serves two features the frontend ships but that never worked because this
endpoint did not exist (every connect attempt was answered 403 by FastAPI's
default WebSocket handler):

1. ConnectionStatus pill in the dashboard header ("connected" / "reconnecting"
   / "disconnected").
2. usePresence() on boards and vault notes: who is viewing the same entity.

Protocol (JSON text frames):
    client -> server: {"type": "join",  "entityType", "entityId", "userId"}
                      {"type": "leave", "entityType", "entityId", "userId"}
                      {"type": "ping"}
    server -> client: {"type": "presence:update", action: join|leave,
                       entityType, entityId, userId, displayName?, avatar?}
                      {"type": "pong"}

Auth: a Clerk JWT is read from the optional ``?token=`` parameter or the
``__session`` cookie. Connections without a valid JWT are closed with 4401.
"""
import asyncio
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.database import async_session
from app.middleware.auth import get_or_create_clerk_user, verify_clerk_jwt

router = APIRouter()


class PresenceHub:
    """In-process presence registry + connection pool.

    The supported deployment is single-process uvicorn, so an in-memory hub
    is correct; multi-worker would need Redis pub/sub (deferred).
    """

    def __init__(self) -> None:
        # userId -> set[WebSocket]
        self._clients: dict[str, set[WebSocket]] = {}
        # userId -> {displayName, avatar}
        self._profiles: dict[str, dict] = {}
        # (entityType, entityId) -> set[userId]
        self._rooms: dict[tuple[str, str], set[str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, display_name: str | None, avatar: str | None, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.setdefault(user_id, set()).add(ws)
            self._profiles[user_id] = {"displayName": display_name or "User", "avatar": avatar}

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            sockets = self._clients.get(user_id)
            if sockets and ws in sockets:
                sockets.discard(ws)
            if sockets is not None and not sockets:
                self._clients.pop(user_id, None)
                self._profiles.pop(user_id, None)
            # remove from all rooms; collect for broadcast outside the lock
            left_rooms = [
                key for key, members in self._rooms.items() if user_id in members
            ]
            for key in left_rooms:
                members = self._rooms[key]
                members.discard(user_id)
                if not members:
                    self._rooms.pop(key, None)

    def join_room(self, entity_type: str, entity_id: str, user_id: str) -> bool:
        """Returns True if this is a NEW membership (should announce)."""
        key = (entity_type, entity_id)
        members = self._rooms.setdefault(key, set())
        if user_id in members:
            return False
        members.add(user_id)
        return True

    def leave_room(self, entity_type: str, entity_id: str, user_id: str) -> bool:
        """Returns True if they were a member (announce the leave)."""
        key = (entity_type, entity_id)
        members = self._rooms.get(key)
        if not members or user_id not in members:
            return False
        members.discard(user_id)
        if not members:
            self._rooms.pop(key, None)
        return True

    @property
    def profile(self) -> dict:
        return self._profiles

    async def broadcast(self, payload: dict) -> None:
        """Send a JSON frame to every connected socket of every user."""
        data = json.dumps(payload)
        for sockets in list(self._clients.values()):
            for ws in list(sockets):
                try:
                    await ws.send_text(data)
                except (RuntimeError, WebSocketDisconnect):
                    # dead socket; its disconnect handler will clean it up
                    pass


hub = PresenceHub()


async def _authenticate(token: str | None, cookies: dict | None = None):
    """Validate a Clerk JWT and return (userId, displayName, avatar)."""
    candidate = token or (cookies or {}).get("__session")
    if not candidate:
        return None
    try:
        async with async_session() as db:
            user = await get_or_create_clerk_user(db, verify_clerk_jwt(candidate))
            return user.id, user.displayName, user.avatar
    except Exception:
        return None


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str | None = Query(None)):
    identity = await _authenticate(token, dict(ws.cookies))

    if identity is None:
        # Reject before accepting: close with policy code 4401.
        await ws.close(code=4401)
        return

    user_id, display_name, avatar = identity
    await hub.connect(user_id, display_name, avatar, ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                message = json.loads(raw)
            except ValueError:
                continue  # malformed frame from a client; ignore

            mtype = message.get("type")
            if mtype == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
                continue

            if mtype in ("join", "leave"):
                entity_type = str(message.get("entityType") or "")[:64]
                entity_id = str(message.get("entityId") or "")[:64]
                if not entity_type or not entity_id:
                    continue

                if mtype == "join":
                    if hub.join_room(entity_type, entity_id, user_id):
                        await hub.broadcast({
                            "type": "presence:update",
                            "action": "join",
                            "entityType": entity_type,
                            "entityId": entity_id,
                            "userId": user_id,
                            "displayName": display_name,
                            "avatar": avatar,
                        })
                else:
                    if hub.leave_room(entity_type, entity_id, user_id):
                        await hub.broadcast({
                            "type": "presence:update",
                            "action": "leave",
                            "entityType": entity_type,
                            "entityId": entity_id,
                            "userId": user_id,
                        })
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(user_id, ws)

