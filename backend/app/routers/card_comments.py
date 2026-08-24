"""
Card comments — powers the "Comments and activity" column of the card modal.

Comments are stored in the generic polymorphic comments table
(entityType="card", entityId=<cardId>) which already exists for other modules.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.comment import Comment
from app.models.user import User

router = APIRouter(prefix="/api/cards/{card_id}/comments", tags=["card-comments"])


def _serialize(c: Comment, author: User | None) -> dict:
    return {
        "id": c.id,
        "cardId": c.entityId,
        "content": c.content,
        "createdAt": c.createdAt.isoformat() if c.createdAt else None,
        "author": {
            "id": author.id,
            "displayName": author.displayName,
            "avatar": author.avatar,
        } if author else None,
    }


@router.get("")
async def list_comments(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Comment, User)
        .join(User, Comment.authorId == User.id, isouter=True)
        .where(
            Comment.entityType == "card",
            Comment.entityId == card_id,
            Comment.deletedAt.is_(None),
            Comment.parentId.is_(None),
        )
        .order_by(Comment.createdAt.asc())
    )).all()
    return {"comments": [_serialize(c, u) for c, u in rows]}


@router.post("", status_code=201)
async def add_comment(card_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "VALIDATION_ERROR", "message": "Comment content is required"}
        })
    comment = Comment(
        id=uuid.uuid4().hex,
        entityType="card",
        entityId=card_id,
        authorId=user["id"],
        content=content,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    author = (await db.execute(select(User).where(User.id == user["id"]))).scalar_one_or_none()
    return {"comment": _serialize(comment, author)}


@router.delete("/{comment_id}")
async def delete_comment(card_id: str, comment_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    comment = (await db.execute(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.entityType == "card",
            Comment.entityId == card_id,
            Comment.deletedAt.is_(None),
        )
    )).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Comment not found"}})
    if comment.authorId != user["id"] and user.get("role") not in ("ADMIN", "MANAGER"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Not your comment"}})
    from datetime import datetime, timezone
    comment.deletedAt = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
