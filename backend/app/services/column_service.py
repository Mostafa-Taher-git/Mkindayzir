import uuid
from typing import List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.column import Column
from app.models.board import Board


class ColumnService:
    @staticmethod
    def _serialize(column: Column) -> dict:
        return {
            "id": column.id,
            "boardId": column.boardId,
            "name": column.name,
            "position": column.position,
            "limit": column.limit,
            "createdAt": column.createdAt.isoformat() if column.createdAt else None,
            "updatedAt": column.updatedAt.isoformat() if column.updatedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, board_id: str, user: dict) -> List[dict]:
        result = await db.execute(
            select(Column).where(Column.boardId == board_id).order_by(Column.position.asc())
        )
        columns = result.scalars().all()
        return [ColumnService._serialize(c) for c in columns]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        column = Column(
            id=uuid.uuid4().hex,
            boardId=data["boardId"],
            name=data["name"],
            position=data.get("position", 0),
            limit=data.get("limit"),
        )
        db.add(column)
        await db.commit()
        await db.refresh(column)
        return ColumnService._serialize(column)

    @staticmethod
    async def get(db: AsyncSession, column_id: str, user: dict) -> dict:
        result = await db.execute(select(Column).where(Column.id == column_id))
        column = result.scalar_one_or_none()
        if not column:
            raise ValueError("Column not found")
        return ColumnService._serialize(column)

    @staticmethod
    async def update(db: AsyncSession, column_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Column).where(Column.id == column_id))
        column = result.scalar_one_or_none()
        if not column:
            raise ValueError("Column not found")

        for field in ["name", "limit"]:
            if field in data and data[field] is not None:
                setattr(column, field, data[field])

        await db.commit()
        await db.refresh(column)
        return ColumnService._serialize(column)

    @staticmethod
    async def delete(db: AsyncSession, column_id: str, user: dict) -> dict:
        result = await db.execute(select(Column).where(Column.id == column_id))
        column = result.scalar_one_or_none()
        if not column:
            raise ValueError("Column not found")
        await db.delete(column)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def reorder(db: AsyncSession, board_id: str, ordered_ids: List[str], user: dict) -> dict:
        for idx, column_id in enumerate(ordered_ids):
            result = await db.execute(select(Column).where(Column.id == column_id))
            column = result.scalar_one_or_none()
            if column:
                column.position = idx
        await db.commit()
        return {"ok": True}
