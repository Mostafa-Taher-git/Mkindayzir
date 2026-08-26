import uuid
from typing import List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func
from sqlalchemy.orm import joinedload, selectinload
from app.models.card import Card
from app.models.column import Column
from app.models.card_member import CardMember
from app.models.card_label import CardLabel
from app.models.board_label import BoardLabel
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.comment import Comment
from app.models.user import User


class CardService:
    @staticmethod
    def _serialize(card: Card) -> dict:
        return {
            "id": card.id,
            "columnId": card.columnId,
            "title": card.title,
            "description": card.description,
            "position": card.position,
            "dueDate": card.dueDate.isoformat() if card.dueDate else None,
            "coverColor": card.coverColor,
            "isComplete": bool(getattr(card, "isComplete", False)),
            "isTemplate": bool(getattr(card, "isTemplate", False)),
            "metadata": card.meta,
            "createdById": card.createdById,
            "createdAt": card.createdAt.isoformat() if card.createdAt else None,
            "updatedAt": card.updatedAt.isoformat() if card.updatedAt else None,
            "deletedAt": card.deletedAt.isoformat() if card.deletedAt else None,
        }

    @staticmethod
    def _serialize_rich(card: Card, labels_by_id: dict | None = None, comment_count: int = 0) -> dict:
        """Card face payload for kanban rendering: badges the board page shows
        (label chips, checklist progress, comment count) plus members."""
        base = CardService._serialize(card)
        labels = []
        for cl in card.cardLabels:
            bl = (labels_by_id or {}).get(cl.labelId)
            if bl is not None:
                labels.append({"id": bl.id, "name": bl.name, "color": bl.color})

        checklist_total = 0
        checklist_done = 0
        for cl in card.checklists:
            for item in cl.items:
                checklist_total += 1
                if item.isCompleted:
                    checklist_done += 1

        return {
            **base,
            "labels": labels,
            "checklistTotal": checklist_total,
            "checklistDone": checklist_done,
            "commentCount": comment_count,
            "members": [
                {"id": m.userId, "userId": m.userId, "displayName": m.user.displayName if m.user else None}
                for m in card.members
            ],
        }

    @staticmethod
    async def list(db: AsyncSession, column_id: str, user: dict) -> List[dict]:
        result = await db.execute(
            select(Card).where(Card.columnId == column_id, Card.deletedAt.is_(None)).order_by(Card.position.asc())
        )
        cards = result.scalars().all()
        return [CardService._serialize(c) for c in cards]

    @staticmethod
    async def list_by_board(db: AsyncSession, board_id: str) -> List[dict]:
        # Board palette map: CardLabel rows only store labelId.
        label_rows = (await db.execute(
            select(BoardLabel).where(BoardLabel.boardId == board_id)
        )).scalars().all()
        labels_by_id = {l.id: l for l in label_rows}

        result = await db.execute(
            select(Card)
            .join(Column)
            .where(Column.boardId == board_id, Card.deletedAt.is_(None))
            .options(
                selectinload(Card.cardLabels),
                selectinload(Card.members).joinedload(CardMember.user),
                selectinload(Card.checklists).selectinload(Checklist.items),
            )
            .order_by(Card.position.asc())
        )
        cards = result.scalars().all()

        # Comments are polymorphic (entityType/entityId), so counts come from
        # one grouped query rather than a relationship. "card" is the stored
        # entityType (see card_comments router).
        comment_counts: dict[str, int] = {}
        if cards:
            ids = [c.id for c in cards]
            rows = await db.execute(
                select(Comment.entityId, func.count())
                .where(
                    Comment.entityType == "card",
                    Comment.entityId.in_(ids),
                    Comment.deletedAt.is_(None),
                )
                .group_by(Comment.entityId)
            )
            comment_counts = {eid: n for eid, n in rows.all()}

        return [
            CardService._serialize_rich(
                c, labels_by_id=labels_by_id, comment_count=comment_counts.get(c.id, 0)
            )
            for c in cards
        ]

    @staticmethod
    async def list_archived(db: AsyncSession, board_id: str, user: dict) -> List[dict]:
        """Cards soft-deleted on any column of this board."""
        result = await db.execute(
            select(Card)
            .join(Column)
            .where(Column.boardId == board_id, Card.deletedAt.is_not(None))
            .order_by(Card.deletedAt.desc())
        )
        cards = result.scalars().all()
        return [CardService._serialize(c) for c in cards]

    @staticmethod
    async def archive(db: AsyncSession, card_id: str, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")
        card.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    async def restore(db: AsyncSession, card_id: str, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id))
        card = result.scalar_one_or_none()
        if not card or card.deletedAt is None:
            raise ValueError("Card is not archived")

        # Restore to the END of its original list so it never lands mid-stack.
        count = await db.execute(
            select(func.count()).where(Card.columnId == card.columnId, Card.deletedAt.is_(None))
        )
        card.position = count.scalar_one()
        card.deletedAt = None
        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    async def move_to_board(
        db: AsyncSession, card_id: str, data: dict, user: dict
    ) -> dict:
        """Cross-board move: re-parents the card to a column of another board,
        appends it at the end of that column. Labels tied to the old board's
        palette are dropped; members and checklists travel with the card."""
        target_column_id = (data or {}).get("columnId")
        if not target_column_id:
            raise ValueError("columnId is required")

        result = await db.execute(select(Column).where(Column.id == target_column_id))
        target_column = result.scalar_one_or_none()
        if not target_column:
            raise ValueError("Target column not found")

        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")

        count = await db.execute(
            select(func.count()).where(Card.columnId == target_column_id, Card.deletedAt.is_(None))
        )
        card.position = count.scalar_one()
        card.columnId = target_column_id
        # Explicit delete — lazy-loading cardLabels here would break async.
        await db.execute(delete(CardLabel).where(CardLabel.cardId == card_id))
        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    def _parse_datetime(value):
        """asyncpg requires real datetimes; clients send ISO strings."""
        if value is None or isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        result = await db.execute(select(func.count()).where(Card.columnId == data["columnId"], Card.deletedAt.is_(None)))
        position = result.scalar_one()
        card = Card(
            id=uuid.uuid4().hex,
            columnId=data["columnId"],
            title=data["title"],
            description=data.get("description"),
            position=position,
            dueDate=CardService._parse_datetime(data.get("dueDate")),
            coverColor=data.get("coverColor"),
            meta=str(data.get("metadata") or {}),
            createdById=user["id"],
        )
        db.add(card)
        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    async def get(db: AsyncSession, card_id: str, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")
        return CardService._serialize(card)

    @staticmethod
    async def update(db: AsyncSession, card_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")

        for field in ["title", "description", "position", "coverColor"]:
            if field in data and data[field] is not None:
                setattr(card, field, data[field])
        if data.get("dueDate") is not None:
            card.dueDate = CardService._parse_datetime(data["dueDate"])
        # boolean flags may be explicitly set false, so check membership only
        if "isComplete" in data:
            card.isComplete = bool(data["isComplete"])
        if "isTemplate" in data:
            card.isTemplate = bool(data["isTemplate"])
        if "metadata" in data and data["metadata"] is not None:
            card.meta = str(data["metadata"])

        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    async def delete(db: AsyncSession, card_id: str, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")
        card.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def move(db: AsyncSession, card_id: str, column_id: str, position: int, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")
        card.columnId = column_id
        card.position = position
        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    async def add_label(db: AsyncSession, card_id: str, label_id: str, user: dict) -> dict:
        result = await db.execute(select(BoardLabel).where(BoardLabel.id == label_id))
        label = result.scalar_one_or_none()
        if not label:
            raise ValueError("Label not found")
        db.add(CardLabel(cardId=card_id, labelId=label_id))
        await db.commit()
        return CardService._serialize_label(label)

    @staticmethod
    async def remove_label(db: AsyncSession, card_id: str, label_id: str, user: dict) -> dict:
        result = await db.execute(
            select(CardLabel).where(CardLabel.cardId == card_id, CardLabel.labelId == label_id)
        )
        cl = result.scalar_one_or_none()
        if cl:
            await db.delete(cl)
            await db.commit()
        return {"ok": True}

    @staticmethod
    async def list_members(db: AsyncSession, card_id: str) -> dict:
        result = await db.execute(
            select(CardMember)
            .where(CardMember.cardId == card_id)
            .options(joinedload(CardMember.user))
        )
        members = result.unique().scalars().all()
        return {
            "members": [
                {
                    "id": m.userId,
                    "userId": m.userId,
                    "user": {
                        "displayName": m.user.displayName if m.user else None,
                        "avatar": m.user.avatar if m.user else None,
                    },
                }
                for m in members
            ]
        }

    @staticmethod
    async def add_member(db: AsyncSession, card_id: str, user_id: str, user: dict) -> dict:
        result = await db.execute(select(User).where(User.id == user_id))
        member_user = result.scalar_one_or_none()
        if not member_user:
            raise ValueError("User not found")
        db.add(CardMember(cardId=card_id, userId=user_id))
        await db.commit()
        return {
            "id": user_id,
            "userId": user_id,
            "displayName": member_user.displayName,
            "email": member_user.email,
        }

    @staticmethod
    async def remove_member(db: AsyncSession, card_id: str, user_id: str, user: dict) -> dict:
        result = await db.execute(
            select(CardMember).where(CardMember.cardId == card_id, CardMember.userId == user_id)
        )
        cm = result.scalar_one_or_none()
        if cm:
            await db.delete(cm)
            await db.commit()
        return {"ok": True}

    @staticmethod
    def _serialize_label(label: BoardLabel) -> dict:
        return {
            "id": label.id,
            "name": label.name,
            "color": label.color,
        }

    @staticmethod
    async def copy(db: AsyncSession, card_id: str, user: dict) -> dict:
        """Duplicate a card into the same list."""
        source = (await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))).scalar_one_or_none()
        if not source:
            raise ValueError("Card not found")

        result = await db.execute(
            select(func.count()).where(Card.columnId == source.columnId, Card.deletedAt.is_(None))
        )
        position = result.scalar_one()

        clone = Card(
            id=uuid.uuid4().hex,
            columnId=source.columnId,
            title=f"{source.title} (copy)",
            description=source.description,
            position=position,
            dueDate=source.dueDate,
            coverColor=source.coverColor,
            isComplete=source.isComplete,
            isTemplate=source.isTemplate,
            meta=source.meta,
            createdById=user["id"],
        )
        db.add(clone)
        await db.commit()
        await db.refresh(clone)
        return CardService._serialize(clone)
