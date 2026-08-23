import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.card import Card
from app.models.column import Column
from app.models.card_member import CardMember
from app.models.card_label import CardLabel
from app.models.board_label import BoardLabel
from app.models.checklist import Checklist
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
            "metadata": card.metadata,
            "createdById": card.createdById,
            "createdAt": card.createdAt.isoformat() if card.createdAt else None,
            "updatedAt": card.updatedAt.isoformat() if card.updatedAt else None,
            "deletedAt": card.deletedAt.isoformat() if card.deletedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, column_id: str, user: dict) -> list[dict]:
        result = await db.execute(
            select(Card).where(Card.columnId == column_id, Card.deletedAt.is_(None)).order_by(Card.position.asc())
        )
        cards = result.scalars().all()
        return [CardService._serialize(c) for c in cards]

    @staticmethod
    async def list_by_board(db: AsyncSession, board_id: str) -> list[dict]:
        result = await db.execute(
            select(Card).join(Column).where(Column.boardId == board_id, Card.deletedAt.is_(None)).order_by(Card.position.asc())
        )
        cards = result.scalars().all()
        return [CardService._serialize(c) for c in cards]

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
            dueDate=data.get("dueDate"),
            coverColor=data.get("coverColor"),
            metadata=str(data.get("metadata") or {}),
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

        for field in ["title", "description", "position", "dueDate", "coverColor"]:
            if field in data and data[field] is not None:
                setattr(card, field, data[field])
        if "metadata" in data and data["metadata"] is not None:
            card.metadata = str(data["metadata"])

        await db.commit()
        await db.refresh(card)
        return CardService._serialize(card)

    @staticmethod
    async def delete(db: AsyncSession, card_id: str, user: dict) -> dict:
        result = await db.execute(select(Card).where(Card.id == card_id, Card.deletedAt.is_(None)))
        card = result.scalar_one_or_none()
        if not card:
            raise ValueError("Card not found")
        card.deletedAt = datetime.utcnow()
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
