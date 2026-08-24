"""
Per-user board stars.

Trello-style: starring is a per-user flag (a board starred by one user must
not appear starred for another), so it lives in its own table keyed by
(user, board) rather than on the board row.
"""
from datetime import datetime

from sqlalchemy import String, DateTime, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BoardStar(Base):
    __tablename__ = "board_stars"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    boardId: Mapped[str] = mapped_column(String(36), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("userId", "boardId", name="uq_board_stars_user_board"),
    )

    board: Mapped["Board"] = relationship()  # noqa: F821
