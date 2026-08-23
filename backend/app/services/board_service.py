import uuid
from typing import List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.board import Board
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.models.column import Column
from app.models.card import Card


class BoardService:
    @staticmethod
    def _serialize(board: Board) -> dict:
        return {
            "id": board.id,
            "spaceId": board.spaceId,
            "name": board.name,
            "description": board.description,
            "background": board.background,
            "settings": board.settings,
            "position": board.position,
            "createdAt": board.createdAt.isoformat() if board.createdAt else None,
            "updatedAt": board.updatedAt.isoformat() if board.updatedAt else None,
            "deletedAt": board.deletedAt.isoformat() if board.deletedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, space_id: str, user: dict) -> List[dict]:
        result = await db.execute(
            select(Board).where(Board.spaceId == space_id, Board.deletedAt.is_(None)).order_by(Board.position.asc())
        )
        boards = result.scalars().all()
        return [BoardService._serialize(b) for b in boards]

    @staticmethod
    async def list_all(db: AsyncSession, user: dict) -> List[dict]:
        result = await db.execute(select(Board).where(Board.deletedAt.is_(None)).order_by(Board.position.asc()))
        boards = result.scalars().all()
        return [BoardService._serialize(b) for b in boards]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        board = Board(
            id=uuid.uuid4().hex,
            spaceId=data["spaceId"],
            name=data["name"],
            description=data.get("description"),
            background=data.get("background"),
            settings=str(data.get("settings") or {}),
        )
        db.add(board)
        await db.commit()
        await db.refresh(board)
        return BoardService._serialize(board)

    @staticmethod
    async def get_by_id(db: AsyncSession, board_id: str, user: dict) -> dict:
        result = await db.execute(select(Board).where(Board.id == board_id, Board.deletedAt.is_(None)))
        board = result.scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")
        return BoardService._serialize(board)

    @staticmethod
    async def update(db: AsyncSession, board_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Board).where(Board.id == board_id, Board.deletedAt.is_(None)))
        board = result.scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")

        for field in ["name", "description", "background"]:
            if field in data and data[field] is not None:
                setattr(board, field, data[field])
        if "settings" in data and data["settings"] is not None:
            board.settings = str(data["settings"])

        await db.commit()
        await db.refresh(board)
        return BoardService._serialize(board)

    @staticmethod
    async def delete(db: AsyncSession, board_id: str, user: dict) -> dict:
        result = await db.execute(select(Board).where(Board.id == board_id, Board.deletedAt.is_(None)))
        board = result.scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")
        board.deletedAt = datetime.utcnow()
        await db.commit()
        return {"ok": True}
