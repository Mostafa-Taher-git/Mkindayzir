"""Storm service — owns all storm/link business rules.

Personal scope (one user's canvas, see reference/storm-canvas.md). Link caps
(3/circle, 12/card) are enforced here so the router stays thin.
"""
from __future__ import annotations

import uuid
from collections import deque

from sqlalchemy import select, delete, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storm import Storm
from app.models.storm_link import StormLink


# Caps per reference/storm-canvas.md
MAX_LINKS_PER_CORNER = 3
MAX_LINKS_PER_STORM = 12  # 4 corners * 3
MAX_NAME_LEN = 80


class StormError(Exception):
    """Domain error with an HTTP-friendly code."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _serialize_storm(s: Storm) -> dict:
    return {
        "id": s.id,
        "ownerId": s.ownerId,
        "name": s.name,
        "positionX": s.positionX,
        "positionY": s.positionY,
        "isArchived": s.isArchived,
        "createdAt": s.createdAt.isoformat() if s.createdAt else None,
        "updatedAt": s.updatedAt.isoformat() if s.updatedAt else None,
    }


def _serialize_link(l: StormLink) -> dict:
    return {
        "id": l.id,
        "sourceId": l.sourceId,
        "sourceCorner": l.sourceCorner,
        "targetId": l.targetId,
        "targetCorner": l.targetCorner,
    }


class StormService:
    """Stateless service. Each method takes an open AsyncSession."""

    @staticmethod
    async def list_for_user(db: AsyncSession, user_id: str) -> dict:
        """Return the user's full canvas: all non-archived storms + every link
        that touches them. One round trip so the canvas can render in one go."""
        storms = (await db.execute(
            select(Storm).where(Storm.ownerId == user_id, Storm.isArchived.is_(False))
        )).scalars().all()

        storm_ids = [s.id for s in storms]
        links: list[StormLink] = []
        if storm_ids:
            links = (await db.execute(
                select(StormLink).where(
                    or_(
                        StormLink.sourceId.in_(storm_ids),
                        StormLink.targetId.in_(storm_ids),
                    )
                )
            )).scalars().all()

        return {
            "storms": [_serialize_storm(s) for s in storms],
            "links": [_serialize_link(l) for l in links],
        }

    @staticmethod
    async def create(db: AsyncSession, user_id: str, data: dict) -> dict:
        name = (data or {}).get("name", "").strip()
        if not name:
            raise StormError("VALIDATION", "name is required", 422)
        if len(name) > MAX_NAME_LEN:
            raise StormError("VALIDATION", f"name must be {MAX_NAME_LEN} chars or fewer", 422)

        # Place at the visual center of the canvas (zoom-independent).
        storm = Storm(
            id=uuid.uuid4().hex,
            ownerId=user_id,
            name=name,
            positionX=0.0,
            positionY=0.0,
        )
        db.add(storm)
        await db.commit()
        await db.refresh(storm)
        return _serialize_storm(storm)

    @staticmethod
    async def update(db: AsyncSession, user_id: str, storm_id: str, data: dict) -> dict:
        storm = await _owned_storm(db, user_id, storm_id)
        if "name" in data:
            new_name = (data["name"] or "").strip()
            if not new_name:
                raise StormError("VALIDATION", "name cannot be empty", 422)
            if len(new_name) > MAX_NAME_LEN:
                raise StormError("VALIDATION", f"name must be {MAX_NAME_LEN} chars or fewer", 422)
            storm.name = new_name
        if "positionX" in data:
            storm.positionX = float(data["positionX"])
        if "positionY" in data:
            storm.positionY = float(data["positionY"])
        await db.commit()
        await db.refresh(storm)
        return _serialize_storm(storm)

    @staticmethod
    async def delete(db: AsyncSession, user_id: str, storm_id: str) -> None:
        storm = await _owned_storm(db, user_id, storm_id)
        await db.delete(storm)  # cascade drops links too
        await db.commit()

    # --- Links ---

    @staticmethod
    async def create_link(
        db: AsyncSession,
        user_id: str,
        source_id: str,
        target_id: str,
        source_corner: int,
        target_corner: int,
    ) -> dict:
        if source_id == target_id:
            raise StormError("VALIDATION", "cannot link a card to itself", 422)
        _validate_corner(source_corner, "sourceCorner")
        _validate_corner(target_corner, "targetCorner")

        # Ownership check on BOTH endpoints (and they must exist).
        source = await _owned_storm(db, user_id, source_id)
        target = await _owned_storm(db, user_id, target_id)

        # Reject exact duplicate of the same (src, srcCorner, tgt, tgtCorner)
        # triple without burning a corner cap. The DB unique index is the
        # safety net; this early return avoids a needless cap error on retry.
        existing = (await db.execute(
            select(StormLink).where(
                StormLink.sourceId == source_id,
                StormLink.sourceCorner == source_corner,
                StormLink.targetId == target_id,
                StormLink.targetCorner == target_corner,
            )
        )).scalar_one_or_none()
        if existing:
            return _serialize_link(existing)

        # Cap checks: both endpoints each enforce 3/corner and 12/card.
        await _check_link_caps(db, source_id, source_corner)
        await _check_link_caps(db, target_id, target_corner)

        link = StormLink(
            id=uuid.uuid4().hex,
            sourceId=source_id,
            sourceCorner=source_corner,
            targetId=target_id,
            targetCorner=target_corner,
        )
        db.add(link)
        try:
            await db.commit()
        except Exception:
            # UniqueConstraint race-fallback.
            await db.rollback()
            raise StormError("CONFLICT", "link already exists", 409)
        await db.refresh(link)
        return _serialize_link(link)

    @staticmethod
    async def delete_link(db: AsyncSession, user_id: str, link_id: str) -> None:
        # Ownership via the source storm (target is always on the same canvas
        # because we only list links the user owns).
        link = (await db.execute(
            select(StormLink).where(StormLink.id == link_id)
        )).scalar_one_or_none()
        if not link:
            raise StormError("NOT_FOUND", "link not found", 404)
        await _owned_storm(db, user_id, link.sourceId)
        await db.delete(link)
        await db.commit()

    # --- Subtree drag ---

    @staticmethod
    async def move_subtree(
        db: AsyncSession, user_id: str, storm_id: str, dx: float, dy: float
    ) -> list[dict]:
        """Move `storm_id` AND every storm transitively reachable through the
        link graph by (dx, dy). Returns the updated storms.

        Reaches the whole connected component (BFS). That's the "everything
        linked to it moves with it" behavior the user asked for.
        """
        root = await _owned_storm(db, user_id, storm_id)

        user_storm_rows = (await db.execute(
            select(Storm.id).where(Storm.ownerId == user_id, Storm.isArchived.is_(False))
        )).all()
        user_storm_ids = [row[0] for row in user_storm_rows]

        # Load only this user's links, then BFS from root.
        user_links = (await db.execute(
            select(StormLink.sourceId, StormLink.targetId).where(
                or_(StormLink.sourceId.in_(user_storm_ids), StormLink.targetId.in_(user_storm_ids))
            )
        )).all()

        adj: dict[str, set[str]] = {}
        for s, t in user_links:
            adj.setdefault(s, set()).add(t)
            adj.setdefault(t, set()).add(s)

        seen: set[str] = {root.id}
        queue: deque[str] = deque([root.id])
        while queue:
            cur = queue.popleft()
            for nbr in adj.get(cur, ()):  # type: ignore[arg-type]
                if nbr not in seen:
                    seen.add(nbr)
                    queue.append(nbr)

        # Ownership filter — never move storms that don't belong to the user.
        owned = (await db.execute(
            select(Storm).where(Storm.id.in_(seen), Storm.ownerId == user_id)
        )).scalars().all()
        for s in owned:
            s.positionX = (s.positionX or 0) + dx
            s.positionY = (s.positionY or 0) + dy
        await db.commit()
        for s in owned:
            await db.refresh(s)
        return [_serialize_storm(s) for s in owned]


# --- helpers ---


def _validate_corner(value: int, name: str) -> None:
    if not isinstance(value, int) or value not in (0, 1, 2, 3):
        raise StormError("VALIDATION", f"{name} must be 0..3", 422)


async def _owned_storm(db: AsyncSession, user_id: str, storm_id: str) -> Storm:
    storm = (await db.execute(
        select(Storm).where(Storm.id == storm_id)
    )).scalar_one_or_none()
    if not storm or storm.ownerId != user_id or storm.isArchived:
        raise StormError("NOT_FOUND", "storm not found", 404)
    return storm


async def _check_link_caps(db: AsyncSession, storm_id: str, corner: int) -> None:
    """Reject if this corner or the whole storm would exceed the caps."""
    corner_count = (await db.execute(
        select(func.count()).where(
            or_(
                and_(StormLink.sourceId == storm_id, StormLink.sourceCorner == corner),
                and_(StormLink.targetId == storm_id, StormLink.targetCorner == corner),
            )
        )
    )).scalar_one()
    if corner_count >= MAX_LINKS_PER_CORNER:
        raise StormError(
            "CAP_CORNER",
            f"a single corner already has {MAX_LINKS_PER_CORNER} links",
            422,
        )

    storm_count = (await db.execute(
        select(func.count()).where(
            or_(StormLink.sourceId == storm_id, StormLink.targetId == storm_id)
        )
    )).scalar_one()
    if storm_count >= MAX_LINKS_PER_STORM:
        raise StormError(
            "CAP_STORM",
            f"a storm is already at {MAX_LINKS_PER_STORM} links",
            422,
        )
