from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, text, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Column(Base):
    __tablename__ = "columns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    boardId: Mapped[str] = mapped_column(String(36), ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    board: Mapped["Board"] = relationship(back_populates="columns")
    cards: Mapped[list["Card"]] = relationship(back_populates="column", cascade="all, delete-orphan")
