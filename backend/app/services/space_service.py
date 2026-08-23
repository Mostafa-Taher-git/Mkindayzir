import uuid
from datetime import datetime
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.models.board import Board
from app.models.user import User


class SpaceService:
    @staticmethod
    def _serialize(space: Space) -> dict:
        return {
            "id": space.id,
            "name": space.name,
            "description": space.description,
            "visibility": space.visibility,
            "createdById": space.createdById,
            "createdAt": space.createdAt.isoformat() if space.createdAt else None,
            "updatedAt": space.updatedAt.isoformat() if space.updatedAt else None,
            "deletedAt": space.deletedAt.isoformat() if space.deletedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, user: dict) -> List[dict]:
        result = await db.execute(
            select(Space).where(Space.deletedAt.is_(None)).order_by(Space.createdAt.desc())
        )
        spaces = result.scalars().all()
        return [SpaceService._serialize(s) for s in spaces]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        space = Space(
            id=uuid.uuid4().hex,
            name=data["name"],
            description=data.get("description"),
            visibility=data.get("visibility", "PRIVATE"),
            createdById=user["id"],
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
        space.deletedAt = datetime.utcnow()
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
