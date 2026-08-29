import uuid
from datetime import datetime, timezone
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.models.board import Board
from app.models.user import User
from app.services.workspace_filter import (
    resolve_workspace, stamp_owner,
    personal_owner_filter, org_owner_filter,
)


class SpaceService:
    @staticmethod
    def _serialize(space: Space) -> dict:
        return {
            "id": space.id,
            "name": space.name,
            "description": space.description,
            "visibility": space.visibility,
            "createdById": space.createdById,
            "ownerType": getattr(space, "ownerType", None),
            "ownerUserId": getattr(space, "ownerUserId", None),
            "ownerOrgId": getattr(space, "ownerOrgId", None),
            "createdAt": space.createdAt.isoformat() if space.createdAt else None,
            "updatedAt": space.updatedAt.isoformat() if space.updatedAt else None,
            "deletedAt": space.deletedAt.isoformat() if space.deletedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, user: dict, workspace: str | None = None) -> List[dict]:
        ws = await resolve_workspace(db, user, workspace)
        if ws["ownerType"] == "personal":
            filt = personal_owner_filter(Space, user["id"])
        else:
            filt = org_owner_filter(Space, ws["orgId"])
        result = await db.execute(
            select(Space).where(Space.deletedAt.is_(None), filt).order_by(Space.createdAt.desc())
        )
        spaces = result.scalars().all()
        return [SpaceService._serialize(s) for s in spaces]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        from app.utils.plan_limits import FREE_MAX_BOARDS_PERSONAL
        from app.services.workspace_filter import resolve_workspace, personal_owner_filter
        ws0 = await resolve_workspace(db, user, data.get("workspace"))
        if ws0["ownerType"] == "personal":
            q = select(func.count()).select_from(Space).where(Space.deletedAt.is_(None)).where(personal_owner_filter(Space, user["id"]))
            total = (await db.execute(q)).scalar_one()
            if total >= FREE_MAX_BOARDS_PERSONAL:
                raise ValueError(f"Personal workspace limit: {FREE_MAX_BOARDS_PERSONAL}/{FREE_MAX_BOARDS_PERSONAL} spaces used. Create or switch to an organization workspace for more.")
        space = Space(
            id=uuid.uuid4().hex,
            name=data["name"],
            description=data.get("description"),
            visibility=data.get("visibility", "PRIVATE"),
            createdById=user["id"],
        )
        ws = await resolve_workspace(db, user, data.get("workspace"))
        await stamp_owner(
            space,
            owner_type=ws["ownerType"],
            owner_user_id=ws["ownerUserId"],
            owner_org_id=ws["orgId"],
        )
        db.add(space)
        await db.commit()
        await db.refresh(space)
        return SpaceService._serialize(space)

    @staticmethod
    async def get(db: AsyncSession, space_id: str, user: dict) -> dict:
        result = await db.execute(select(Space).where(Space.id == space_id, Space.deletedAt.is_(None)))
        space = result.scalar_one_or_none()
        if not space:
            raise ValueError("Space not found")
        return SpaceService._serialize(space)

    @staticmethod
    async def update(db: AsyncSession, space_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Space).where(Space.id == space_id, Space.deletedAt.is_(None)))
        space = result.scalar_one_or_none()
        if not space:
            raise ValueError("Space not found")

        for field in ["name", "description", "visibility"]:
            if field in data and data[field] is not None:
                setattr(space, field, data[field])

        await db.commit()
        await db.refresh(space)
        return SpaceService._serialize(space)

    @staticmethod
    async def delete(db: AsyncSession, space_id: str, user: dict) -> dict:
        result = await db.execute(select(Space).where(Space.id == space_id, Space.deletedAt.is_(None)))
        space = result.scalar_one_or_none()
        if not space:
            raise ValueError("Space not found")
        space.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def update_members(db: AsyncSession, space_id: str, members_data: List[dict], user: dict) -> dict:
        result = await db.execute(select(Space).where(Space.id == space_id, Space.deletedAt.is_(None)))
        space = result.scalar_one_or_none()
        if not space:
            raise ValueError("Space not found")

        existing_result = await db.execute(select(SpaceMember).where(SpaceMember.spaceId == space_id))
        existing = existing_result.scalars().all()
        for m in existing:
            await db.delete(m)

        for member in members_data:
            db.add(SpaceMember(spaceId=space_id, userId=member["userId"], role=member.get("role", "MEMBER")))

        await db.commit()
        return {"ok": True}
