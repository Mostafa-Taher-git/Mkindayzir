from datetime import datetime
from sqlalchemy import String, DateTime, text, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BoardLabel(Base):
    __tablename__ = "board_labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    boardId: Mapped[str] = mapped_column(String(36), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("boardId", "name", name="uq_board_labels_board_name"),
    )

    board: Mapped["Board"] = relationship(back_populates="boardLabels")
    cardLabels: Mapped[list["CardLabel"]] = relationship(back_populates="label", cascade="all, delete-orphan")
