import json
import uuid
from typing import List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.board import Board
from app.models.board_star import BoardStar
from app.models.space import Space
from app.models.space_member import SpaceMember
from app.models.column import Column
from app.models.card import Card
from app.models.user import User

# Provisioned on every new board so the label picker/filter are useful
# immediately. Single source of truth; routers import from here.
DEFAULT_LABEL_PALETTE = [
    ("Green", "#7adba8"),
    ("Yellow", "#ffd75e"),
    ("Orange", "#ff9f43"),
    ("Red", "#ff5449"),
    ("Purple", "#b678f0"),
    ("Blue", "#96ccff"),
]


class BoardService:
    @staticmethod
    def _parse_settings(raw) -> dict:
        import json as _json
        if isinstance(raw, dict):
            return raw
        try:
            parsed = _json.loads(raw or "{}")
        except (ValueError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _serialize(board: Board, starred: bool = False, space_name: str | None = None) -> dict:
        return {
            "id": board.id,
            "spaceId": board.spaceId,
            "name": board.name,
            "description": board.description,
            "background": board.background,
            "visibility": getattr(board, "visibility", "WORKSPACE") or "WORKSPACE",
            "projectId": getattr(board, "projectId", None),
            "settings": BoardService._parse_settings(board.settings),
            "position": board.position,
            "starred": starred,
            "spaceName": space_name,
            "createdAt": board.createdAt.isoformat() if board.createdAt else None,
            "updatedAt": board.updatedAt.isoformat() if board.updatedAt else None,
            "deletedAt": board.deletedAt.isoformat() if board.deletedAt else None,
        }

    @staticmethod
    async def _starred_ids(db: AsyncSession, user_id: str) -> set[str]:
        result = await db.execute(
            select(BoardStar.boardId).where(BoardStar.userId == user_id)
        )
        return {row[0] for row in result.all()}

    @staticmethod
    async def list(db: AsyncSession, space_id: str, user: dict) -> List[dict]:
        boards = (await db.execute(
            select(Board).where(Board.spaceId == space_id, Board.deletedAt.is_(None)).order_by(Board.position.asc())
        )).scalars().all()
        stars = await BoardService._starred_ids(db, user["id"])
        return [BoardService._serialize(b, starred=b.id in stars) for b in boards]

    @staticmethod
    async def list_all(db: AsyncSession, user: dict) -> List[dict]:
        boards = (await db.execute(
            select(Board).where(Board.deletedAt.is_(None)).order_by(Board.position.asc())
        )).scalars().all()
        stars = await BoardService._starred_ids(db, user["id"])
        # space names for the switcher / workspace grid
        space_ids = {b.spaceId for b in boards}
        names: dict[str, str] = {}
        if space_ids:
            rows = await db.execute(select(Space.id, Space.name).where(Space.id.in_(space_ids)))
            names = {row[0]: row[1] for row in rows.all()}
        return [BoardService._serialize(b, starred=b.id in stars, space_name=names.get(b.spaceId)) for b in boards]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        board = Board(
            id=uuid.uuid4().hex,
            spaceId=data["spaceId"],
            name=data["name"],
            description=data.get("description"),
            background=data.get("background"),
            visibility=data.get("visibility") or "WORKSPACE",
            projectId=data.get("projectId"),
            settings=str(data.get("settings") or {}),
        )
        db.add(board)
        # Provision the default label palette so pickers/filters work instantly.
        from app.models.board_label import BoardLabel
        for name, color in DEFAULT_LABEL_PALETTE:
            db.add(BoardLabel(id=uuid.uuid4().hex, boardId=board.id, name=name, color=color))
        await db.commit()
        await db.refresh(board)
        return BoardService._serialize(board)

    @staticmethod
    async def get_by_id(db: AsyncSession, board_id: str, user: dict) -> dict:
        board = (await db.execute(
            select(Board).where(Board.id == board_id, Board.deletedAt.is_(None))
        )).scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")
        stars = await BoardService._starred_ids(db, user["id"])
        return BoardService._serialize(board, starred=board.id in stars)

    @staticmethod
    async def update(db: AsyncSession, board_id: str, data: dict, user: dict) -> dict:
        board = (await db.execute(
            select(Board).where(Board.id == board_id, Board.deletedAt.is_(None))
        )).scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")

        for field in ["name", "description", "background", "visibility", "projectId"]:
            if field in data and data[field] is not None:
                setattr(board, field, data[field])
        if "settings" in data and data["settings"] is not None:
            # store real JSON (str(dict) yields single quotes -> unparseable)
            import json as _json
            board.settings = _json.dumps(data["settings"]) if isinstance(data["settings"], (dict, list)) else str(data["settings"])

        await db.commit()
        await db.refresh(board)
        stars = await BoardService._starred_ids(db, user["id"])
        return BoardService._serialize(board, starred=board.id in stars)

    @staticmethod
    async def delete(db: AsyncSession, board_id: str, user: dict) -> dict:
        board = (await db.execute(
            select(Board).where(Board.id == board_id, Board.deletedAt.is_(None))
        )).scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")
        board.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    # ------------------------------------------------------------------ #
    # Star / unstar (per-user)
    # ------------------------------------------------------------------ #
    @staticmethod
    async def set_star(db: AsyncSession, board_id: str, user_id: str, starred: bool) -> dict:
        board = (await db.execute(
            select(Board).where(Board.id == board_id, Board.deletedAt.is_(None))
        )).scalar_one_or_none()
        if not board:
            raise ValueError("Board not found")

        existing = (await db.execute(
            select(BoardStar).where(BoardStar.userId == user_id, BoardStar.boardId == board_id)
        )).scalar_one_or_none()

        if starred and not existing:
            db.add(BoardStar(id=uuid.uuid4().hex, userId=user_id, boardId=board_id))
            await db.commit()
        elif not starred and existing:
            await db.delete(existing)
            await db.commit()
        return {"ok": True, "starred": starred}

    # ------------------------------------------------------------------ #
    # Duplicate a board (used by "create card/board from template")
    # ------------------------------------------------------------------ #
    @staticmethod
    async def duplicate(db: AsyncSession, board_id: str, data: dict, user: dict) -> dict:
        source = (await db.execute(
            select(Board).where(Board.id == board_id, Board.deletedAt.is_(None))
        )).scalar_one_or_none()
        if not source:
            raise ValueError("Board not found")

        new_board = Board(
            id=uuid.uuid4().hex,
            spaceId=data.get("spaceId") or source.spaceId,
            name=data.get("name") or f"{source.name} (copy)",
            description=source.description,
            background=source.background,
            visibility=getattr(source, "visibility", "WORKSPACE") or "WORKSPACE",
            projectId=getattr(source, "projectId", None),
            settings=source.settings,
        )
        db.add(new_board)
        await db.flush()

        # copy columns with their cards
        cols = (await db.execute(
            select(Column).where(Column.boardId == source.id).order_by(Column.position.asc())
        )).scalars().all()
        col_map: dict[str, str] = {}
        for col in cols:
            new_col = Column(
                id=uuid.uuid4().hex,
                boardId=new_board.id,
                name=col.name,
                position=col.position,
                limit=col.limit,
            )
            db.add(new_col)
            await db.flush()
            col_map[col.id] = new_col.id

        cards = (await db.execute(
            select(Card).where(Card.deletedAt.is_(None)).where(Card.columnId.in_([c.id for c in cols] or ["-"]))
        )).scalars().all()
        for card in cards:
            db.add(Card(
                id=uuid.uuid4().hex,
                columnId=col_map[card.columnId],
                title=card.title,
                description=card.description,
                position=card.position,
                dueDate=card.dueDate,
                coverColor=card.coverColor,
                meta=card.meta,
                createdById=user["id"],
            ))

        await db.commit()
        await db.refresh(new_board)
        return BoardService._serialize(new_board)
