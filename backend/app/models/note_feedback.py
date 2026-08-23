from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NoteFeedback(Base):
    __tablename__ = "note_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    noteId: Mapped[str] = mapped_column(String(36), ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    helpful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    __table_args__ = (
        UniqueConstraint("noteId", "userId", name="uq_note_feedback_note_user"),
    )

    note: Mapped["VaultNote"] = relationship(back_populates="feedback")
