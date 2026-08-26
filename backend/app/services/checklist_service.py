import uuid
from typing import List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem


class ChecklistService:
    @staticmethod
    def _serialize(checklist: Checklist) -> dict:
        return {
            "id": checklist.id,
            "cardId": checklist.cardId,
            "name": checklist.name,
            "position": checklist.position,
            "createdAt": checklist.createdAt.isoformat() if checklist.createdAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, card_id: str, user: dict) -> List[dict]:
        result = await db.execute(
            select(Checklist).where(Checklist.cardId == card_id).order_by(Checklist.position.asc())
        )
        checklists = result.scalars().all()
        return [ChecklistService._serialize(c) for c in checklists]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        result = await db.execute(select(Checklist).where(Checklist.cardId == data["cardId"]))
        existing = result.scalars().all()
        position = len(existing)
        checklist = Checklist(
            id=uuid.uuid4().hex,
            cardId=data["cardId"],
            # UI sends {title}; accept both spellings at the boundary.
            name=data.get("name") or data.get("title") or "Checklist",
            position=position,
        )
        db.add(checklist)
        await db.commit()
        await db.refresh(checklist)
        return ChecklistService._serialize(checklist)

    @staticmethod
    async def get(db: AsyncSession, checklist_id: str, user: dict) -> dict:
        result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
        checklist = result.scalar_one_or_none()
        if not checklist:
            raise ValueError("Checklist not found")
        return ChecklistService._serialize(checklist)

    @staticmethod
    async def update(db: AsyncSession, checklist_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
        checklist = result.scalar_one_or_none()
        if not checklist:
            raise ValueError("Checklist not found")

        if "name" in data and data["name"] is not None:
            checklist.name = data["name"]

        await db.commit()
        await db.refresh(checklist)
        return ChecklistService._serialize(checklist)

    @staticmethod
    async def delete(db: AsyncSession, checklist_id: str, user: dict) -> dict:
        result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
        checklist = result.scalar_one_or_none()
        if not checklist:
            raise ValueError("Checklist not found")
        await db.delete(checklist)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def create_item(db: AsyncSession, checklist_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(ChecklistItem).where(ChecklistItem.checklistId == checklist_id))
        existing = result.scalars().all()
        position = len(existing)
        item = ChecklistItem(
            id=uuid.uuid4().hex,
            checklistId=checklist_id,
            title=data["title"],
            isCompleted=False,
            position=position,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return ChecklistService._serialize_item(item)

    @staticmethod
    async def get_item(db: AsyncSession, item_id: str, user: dict) -> dict:
        result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Checklist item not found")
        return ChecklistService._serialize_item(item)

    @staticmethod
    async def update_item(db: AsyncSession, item_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Checklist item not found")

        for field in ["title", "position", "isCompleted"]:
            if field in data and data[field] is not None:
                setattr(item, field, data[field])

        await db.commit()
        await db.refresh(item)
        return ChecklistService._serialize_item(item)

    @staticmethod
    async def delete_item(db: AsyncSession, item_id: str, user: dict) -> dict:
        result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Checklist item not found")
        await db.delete(item)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def toggle_item(db: AsyncSession, item_id: str, user: dict) -> dict:
        result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Checklist item not found")
        item.isCompleted = not item.isCompleted
        await db.commit()
        await db.refresh(item)
        return ChecklistService._serialize_item(item)

    @staticmethod
    def _serialize_item(item: ChecklistItem) -> dict:
        return {
            "id": item.id,
            "checklistId": item.checklistId,
            "title": item.title,
            "isCompleted": item.isCompleted,
            "position": item.position,
        }
