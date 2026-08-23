import uuid
from typing import List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.conversation import Conversation
from app.models.message import Message


class ConversationService:
    @staticmethod
    def _serialize(conv: Conversation) -> dict:
        return {
            "id": conv.id,
            "userId": conv.userId,
            "title": conv.title,
            "model": conv.model,
            "createdAt": conv.createdAt.isoformat() if conv.createdAt else None,
            "updatedAt": conv.updatedAt.isoformat() if conv.updatedAt else None,
            "deletedAt": conv.deletedAt.isoformat() if conv.deletedAt else None,
            "messages": [],
        }

    @staticmethod
    async def list(db: AsyncSession, user: dict) -> List[dict]:
        result = await db.execute(
            select(Conversation).where(Conversation.userId == user["id"], Conversation.deletedAt.is_(None)).order_by(Conversation.updatedAt.desc())
        )
        convs = result.scalars().all()
        return [ConversationService._serialize(c) for c in convs]

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        conv = Conversation(
            id=uuid.uuid4().hex,
            userId=user["id"],
            title=data.get("title"),
            model=data.get("model"),
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        return ConversationService._serialize(conv)

    @staticmethod
    async def get_conversation(db: AsyncSession, conv_id: str, user: dict) -> dict:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conv_id, Conversation.deletedAt.is_(None))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")
        if conv.userId != user["id"]:
            raise ValueError("Forbidden")

        msg_result = await db.execute(
            select(Message).where(Message.conversationId == conv_id).order_by(Message.createdAt.asc())
        )
        messages = msg_result.scalars().all()
        serialized = ConversationService._serialize(conv)
        serialized["messages"] = [
            {
                "id": m.id,
                "conversationId": m.conversationId,
                "role": m.role,
                "content": m.content,
                "toolCalls": m.toolCalls,
                "toolResults": m.toolResults,
                "model": m.model,
                "tokens": m.tokens,
                "createdAt": m.createdAt.isoformat() if m.createdAt else None,
            }
            for m in messages
        ]
        return serialized

    @staticmethod
    async def update_conversation(db: AsyncSession, conv_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conv_id, Conversation.deletedAt.is_(None))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")
        if conv.userId != user["id"]:
            raise ValueError("Forbidden")

        for field in ["title", "model"]:
            if field in data and data[field] is not None:
                setattr(conv, field, data[field])

        await db.commit()
        await db.refresh(conv)
        return ConversationService._serialize(conv)

    @staticmethod
    async def delete(db: AsyncSession, conv_id: str, user: dict) -> dict:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conv_id, Conversation.deletedAt.is_(None))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")
        if conv.userId != user["id"]:
            raise ValueError("Forbidden")
        conv.deletedAt = datetime.utcnow()
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def add_message(db: AsyncSession, conv_id: str, content: str, role: str, user: dict, extra: dict | None = None) -> dict:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conv_id, Conversation.deletedAt.is_(None))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")
        if conv.userId != user["id"]:
            raise ValueError("Forbidden")

        message = Message(
            id=uuid.uuid4().hex,
            conversationId=conv_id,
            role=role,
            content=content,
            toolCalls=str(extra.get("toolCalls")) if extra and extra.get("toolCalls") else None,
            toolResults=str(extra.get("toolResults")) if extra and extra.get("toolResults") else None,
            model=extra.get("model") if extra else None,
            tokens=extra.get("tokens") if extra else None,
        )
        db.add(message)
        conv.updatedAt = datetime.utcnow()
        await db.commit()
        await db.refresh(message)
        return {
            "id": message.id,
            "conversationId": message.conversationId,
            "role": message.role,
            "content": message.content,
            "toolCalls": message.toolCalls,
            "toolResults": message.toolResults,
            "model": message.model,
            "tokens": message.tokens,
            "createdAt": message.createdAt.isoformat() if message.createdAt else None,
        }
