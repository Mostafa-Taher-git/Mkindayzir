import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.storm import Storm
from app.models.storm_link import StormLink
from app.models.organization import OrganizationMember


def _ser(s: Storm) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "ownerType": s.ownerType,
        "ownerUserId": s.ownerUserId,
        "ownerOrgId": s.ownerOrgId,
        "x": s.x,
        "y": s.y,
        "width": s.width,
        "height": s.height,
        "isArchived": s.isArchived,
        "createdAt": s.createdAt.isoformat() if s.createdAt else None,
        "updatedAt": s.updatedAt.isoformat() if s.updatedAt else None,
    }

def _ser_link(l: StormLink) -> dict:
    return {
        "id": l.id,
        "fromStormId": l.fromStormId,
        "fromCorner": l.fromCorner,
        "toStormId": l.toStormId,
        "toCorner": l.toCorner,
        "createdAt": l.createdAt.isoformat() if l.createdAt else None,
    }

def _workspace_where(user: dict, workspace: str | None):
    """Return (where_clauses, ownerType, ownerUserId, ownerOrgId) or raise ValueError"""
    if not workspace or workspace == "personal":
        return ([Storm.ownerType == "personal", Storm.ownerUserId == user["id"]], "personal", user["id"], None)
    # org case handled in async caller (needs membership check) - for sync helper we just return placeholder
    return None

class StormService:
    @staticmethod
    async def _resolve_workspace(db: AsyncSession, user: dict, workspace: str | None):
        if not workspace or workspace == "personal":
            return {
                "where": [Storm.ownerType == "personal", Storm.ownerUserId == user["id"]],
                "ownerType": "personal",
                "ownerUserId": user["id"],
                "ownerOrgId": None,
            }
        m = (await db.execute(select(OrganizationMember).where(
            OrganizationMember.orgId == workspace,
            OrganizationMember.userId == user["id"],
        ))).scalar_one_or_none()
        if m is None:
            raise ValueError("not a member of this organization")
        return {
            "where": [Storm.ownerType == "org", Storm.ownerOrgId == workspace],
            "ownerType": "org",
            "ownerUserId": None,
            "ownerOrgId": workspace,
        }

    @staticmethod
    async def list_storms(db: AsyncSession, user: dict, workspace: str | None = None, include_archived: bool = False, search: str | None = None):
        ctx = await StormService._resolve_workspace(db, user, workspace)
        q = select(Storm).where(Storm.deletedAt.is_(None), *ctx["where"])
        if not include_archived:
            q = q.where(Storm.isArchived == False)  # noqa
        if search:
            q = q.where(Storm.name.ilike(f"%{search}%"))
        q = q.order_by(Storm.updatedAt.desc())
        rows = (await db.execute(q)).scalars().all()
        return [_ser(s) for s in rows]

    @staticmethod
    async def search_storms(db: AsyncSession, user: dict, qstr: str, workspace: str | None = None, limit: int = 10):
        ctx = await StormService._resolve_workspace(db, user, workspace)
        q = select(Storm).where(Storm.deletedAt.is_(None), *ctx["where"])  # include archived for # refs
        if qstr:
            q = q.where(Storm.name.ilike(f"%{qstr}%"))
        q = q.order_by(Storm.name.asc()).limit(limit)
        rows = (await db.execute(q)).scalars().all()
        return [_ser(s) for s in rows]

    @staticmethod
    async def create_storm(db: AsyncSession, user: dict, data: dict):
        name = (data.get("name") or "").strip()
        if not name or len(name) > 80:
            raise ValueError("Name required (1-80 chars)")
        workspace = data.get("workspace") or data.get("organizationId") or "personal"
        ctx = await StormService._resolve_workspace(db, user, workspace)
        # place near center if not provided; slight jitter to avoid overlap
        x = float(data.get("x", 0))
        y = float(data.get("y", 0))
        # if both 0, auto-offset by count to avoid stacking
        if x == 0 and y == 0:
            cnt = await db.scalar(select(func.count()).select_from(Storm).where(Storm.deletedAt.is_(None), *ctx["where"]))
            cnt = cnt or 0
            x = 100 + (cnt % 5) * 40
            y = 100 + (cnt // 5) * 40
        storm = Storm(
            id=uuid.uuid4().hex,
            name=name,
            ownerType=ctx["ownerType"],
            ownerUserId=ctx["ownerUserId"],
            ownerOrgId=ctx["ownerOrgId"],
            x=x, y=y,
            width=200, height=88,
            isArchived=False,
            whiteboardData=json.dumps({"elements": [], "appState": {}, "files": {}}),
        )
        db.add(storm)
        await db.commit()
        await db.refresh(storm)
        return _ser(storm)

    @staticmethod
    async def get_storm(db: AsyncSession, user: dict, storm_id: str, include_whiteboard: bool = False):
        s = (await db.execute(select(Storm).where(Storm.id == storm_id, Storm.deletedAt.is_(None)))).scalar_one_or_none()
        if not s:
            raise ValueError("Storm not found")
        # ownership check
        if s.ownerType == "personal" and s.ownerUserId != user["id"]:
            raise ValueError("Storm not found")
        if s.ownerType == "org":
            m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
            if not m:
                raise ValueError("Storm not found")
        data = _ser(s)
        if include_whiteboard:
            try:
                data["whiteboardData"] = json.loads(s.whiteboardData) if s.whiteboardData else {"elements": [], "appState": {}, "files": {}}
            except Exception:
                data["whiteboardData"] = {"elements": [], "appState": {}, "files": {}}
        return data

    @staticmethod
    async def update_storm(db: AsyncSession, user: dict, storm_id: str, data: dict):
        s = (await db.execute(select(Storm).where(Storm.id == storm_id, Storm.deletedAt.is_(None)))).scalar_one_or_none()
        if not s:
            raise ValueError("Storm not found")
        if s.ownerType == "personal" and s.ownerUserId != user["id"]:
            raise ValueError("Storm not found")
        if s.ownerType == "org":
            m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
            if not m:
                raise ValueError("Storm not found")
        if "name" in data and data["name"] is not None:
            name = str(data["name"]).strip()
            if not name or len(name) > 80:
                raise ValueError("Name required (1-80 chars)")
            s.name = name
        if "x" in data and data["x"] is not None:
            s.x = float(data["x"])
        if "y" in data and data["y"] is not None:
            s.y = float(data["y"])
        if "isArchived" in data and data["isArchived"] is not None:
            s.isArchived = bool(data["isArchived"])
        s.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(s)
        return _ser(s)

    @staticmethod
    async def delete_storm(db: AsyncSession, user: dict, storm_id: str):
        s = (await db.execute(select(Storm).where(Storm.id == storm_id, Storm.deletedAt.is_(None)))).scalar_one_or_none()
        if not s:
            raise ValueError("Storm not found")
        if s.ownerType == "personal" and s.ownerUserId != user["id"]:
            raise ValueError("Storm not found")
        if s.ownerType == "org":
            m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
            if not m:
                raise ValueError("Storm not found")
        # delete its links first
        await db.execute(select(StormLink).where(or_(StormLink.fromStormId == storm_id, StormLink.toStormId == storm_id)))
        # bulk delete links
        links = (await db.execute(select(StormLink).where(or_(StormLink.fromStormId == storm_id, StormLink.toStormId == storm_id)))).scalars().all()
        for l in links:
            await db.delete(l)
        s.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def get_whiteboard(db: AsyncSession, user: dict, storm_id: str):
        s = (await db.execute(select(Storm).where(Storm.id == storm_id, Storm.deletedAt.is_(None)))).scalar_one_or_none()
        if not s:
            raise ValueError("Storm not found")
        if s.ownerType == "personal" and s.ownerUserId != user["id"]:
            raise ValueError("Storm not found")
        if s.ownerType == "org":
            m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
            if not m:
                raise ValueError("Storm not found")
        try:
            return json.loads(s.whiteboardData) if s.whiteboardData else {"elements": [], "appState": {}, "files": {}}
        except Exception:
            return {"elements": [], "appState": {}, "files": {}}

    @staticmethod
    async def save_whiteboard(db: AsyncSession, user: dict, storm_id: str, payload: dict):
        s = (await db.execute(select(Storm).where(Storm.id == storm_id, Storm.deletedAt.is_(None)))).scalar_one_or_none()
        if not s:
            raise ValueError("Storm not found")
        if s.ownerType == "personal" and s.ownerUserId != user["id"]:
            raise ValueError("Storm not found")
        if s.ownerType == "org":
            m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
            if not m:
                raise ValueError("Storm not found")
        # store as json, limit size 5MB
        raw = json.dumps(payload or {"elements": [], "appState": {}, "files": {}})
        if len(raw) > 5 * 1024 * 1024:
            raise ValueError("Whiteboard too large (5MB limit)")
        s.whiteboardData = raw
        s.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    # --- links ---
    @staticmethod
    async def list_links(db: AsyncSession, user: dict, workspace: str | None = None, storm_ids: list[str] | None = None):
        ctx = await StormService._resolve_workspace(db, user, workspace)
        # get storm ids in workspace
        storm_rows = (await db.execute(select(Storm.id).where(Storm.deletedAt.is_(None), *ctx["where"]))).scalars().all()
        allowed = set(storm_rows)
        q = select(StormLink)
        if storm_ids:
            # filter to links touching these storms, but only if storms are allowed
            touching = [sid for sid in storm_ids if sid in allowed]
            if not touching:
                return []
            q = q.where(or_(StormLink.fromStormId.in_(touching), StormLink.toStormId.in_(touching)))
        else:
            # all links where both ends are in allowed set
            if not allowed:
                return []
            q = q.where(StormLink.fromStormId.in_(list(allowed)), StormLink.toStormId.in_(list(allowed)))
        # ensure both ends still exist and not deleted/archived? allow archived but not deleted
        rows = (await db.execute(q)).scalars().all()
        # filter to ensure both ends in allowed (covers deleted storms that slipped)
        filtered = [r for r in rows if r.fromStormId in allowed and r.toStormId in allowed]
        return [_ser_link(l) for l in filtered]

    @staticmethod
    async def create_link(db: AsyncSession, user: dict, data: dict):
        fromStormId = data.get("fromStormId")
        toStormId = data.get("toStormId")
        fromCorner = int(data.get("fromCorner", -1))
        toCorner = int(data.get("toCorner", -1))
        if not fromStormId or not toStormId or fromStormId == toStormId:
            raise ValueError("Need two different storms")
        if fromCorner not in (0,1,2,3) or toCorner not in (0,1,2,3):
            raise ValueError("Corner must be 0-3")
        # verify both storms exist and belong to same workspace & user has access
        for sid in (fromStormId, toStormId):
            s = (await db.execute(select(Storm).where(Storm.id == sid, Storm.deletedAt.is_(None)))).scalar_one_or_none()
            if not s:
                raise ValueError("Storm not found")
            if s.ownerType == "personal" and s.ownerUserId != user["id"]:
                raise ValueError("Storm not found")
            if s.ownerType == "org":
                m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
                if not m:
                    raise ValueError("Storm not found")
        # ensure same workspace context (both same owner)
        a = (await db.execute(select(Storm).where(Storm.id == fromStormId))).scalar_one()
        b = (await db.execute(select(Storm).where(Storm.id == toStormId))).scalar_one()
        if a.ownerType != b.ownerType or a.ownerUserId != b.ownerUserId or a.ownerOrgId != b.ownerOrgId:
            raise ValueError("Storms are in different workspaces")
        # check duplicate (either direction)
        existing = (await db.execute(select(StormLink).where(
            or_(
                and_(StormLink.fromStormId == fromStormId, StormLink.fromCorner == fromCorner, StormLink.toStormId == toStormId, StormLink.toCorner == toCorner),
                and_(StormLink.fromStormId == toStormId, StormLink.fromCorner == toCorner, StormLink.toStormId == fromStormId, StormLink.toCorner == fromCorner),
            )
        ))).scalars().all()
        if existing:
            raise ValueError("Link already exists")
        # check caps: 3 per circle, 12 per storm
        for sid, corner in ((fromStormId, fromCorner), (toStormId, toCorner)):
            # count per circle
            cnt_circle = await db.scalar(select(func.count()).select_from(StormLink).where(
                or_(
                    and_(StormLink.fromStormId == sid, StormLink.fromCorner == corner),
                    and_(StormLink.toStormId == sid, StormLink.toCorner == corner),
                )
            ))
            if (cnt_circle or 0) >= 3:
                raise ValueError("Max 3 lines per circle")
            cnt_storm = await db.scalar(select(func.count()).select_from(StormLink).where(
                or_(StormLink.fromStormId == sid, StormLink.toStormId == sid)
            ))
            if (cnt_storm or 0) >= 12:
                raise ValueError("Max 12 lines per storm")
        link = StormLink(id=uuid.uuid4().hex, fromStormId=fromStormId, fromCorner=fromCorner, toStormId=toStormId, toCorner=toCorner)
        db.add(link)
        await db.commit()
        await db.refresh(link)
        return _ser_link(link)

    @staticmethod
    async def delete_link(db: AsyncSession, user: dict, link_id: str):
        l = (await db.execute(select(StormLink).where(StormLink.id == link_id))).scalar_one_or_none()
        if not l:
            raise ValueError("Link not found")
        # verify user has access to at least one end's storm
        s = (await db.execute(select(Storm).where(Storm.id == l.fromStormId, Storm.deletedAt.is_(None)))).scalar_one_or_none()
        if s:
            if s.ownerType == "personal" and s.ownerUserId != user["id"]:
                raise ValueError("Link not found")
            if s.ownerType == "org":
                m = (await db.execute(select(OrganizationMember).where(OrganizationMember.orgId == s.ownerOrgId, OrganizationMember.userId == user["id"]))).scalar_one_or_none()
                if not m:
                    raise ValueError("Link not found")
        await db.delete(l)
        await db.commit()
        return {"ok": True}
