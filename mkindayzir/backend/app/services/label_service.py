import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.label import Label
from app.models.project import Project


class LabelService:
    @staticmethod
    def _serialize(label: Label) -> dict:
        return {
            "id": label.id,
            "projectId": label.projectId,
            "name": label.name,
            "color": label.color,
            "createdAt": label.createdAt.isoformat() if label.createdAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, project_id: str, user: dict) -> list[dict]:
        result = await db.execute(
            select(Label).where(Label.projectId == project_id).order_by(Label.name.asc())
        )
        labels = result.scalars().all()
        return [LabelService._serialize(l) for l in labels]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        label = Label(
            id=uuid.uuid4().hex,
            projectId=data["projectId"],
            name=data["name"],
            color=data.get("color", "#808080"),
        )
        db.add(label)
        await db.commit()
        await db.refresh(label)
        return LabelService._serialize(label)

    @staticmethod
    async def get(db: AsyncSession, label_id: str, user: dict) -> dict:
        result = await db.execute(select(Label).where(Label.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            raise ValueError("Label not found")
        return LabelService._serialize(label)

    @staticmethod
    async def update(db: AsyncSession, label_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Label).where(Label.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            raise ValueError("Label not found")

        for field in ["name", "color"]:
            if field in data and data[field] is not None:
                setattr(label, field, data[field])

        await db.commit()
        await db.refresh(label)
        return LabelService._serialize(label)

    @staticmethod
    async def delete(db: AsyncSession, label_id: str, user: dict) -> dict:
        result = await db.execute(select(Label).where(Label.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            raise ValueError("Label not found")
        await db.delete(label)
        await db.commit()
        return {"ok": True}
