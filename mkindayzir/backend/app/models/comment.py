from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entityType: Mapped[str] = mapped_column(String(50), nullable=False)
    entityId: Mapped[str] = mapped_column(String(36), nullable=False)
    authorId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    parentId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("comments.id"), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_comments_entity", "entityType", "entityId"),
    )

    author: Mapped["User"] = relationship(back_populates="comments")
    parent: Mapped[Optional["Comment"]] = relationship(back_populates="replies", remote_side="Comment.id", foreign_keys="Comment.parentId")
    replies: Mapped[list["Comment"]] = relationship(back_populates="parent")
