from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    columnId: Mapped[str] = mapped_column(String(36), ForeignKey("columns.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    position: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    dueDate: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    coverColor: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Trello-style card states
    isComplete: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    isTemplate: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    meta: Mapped[str] = mapped_column("metadata", String, server_default=text("'{}'"), nullable=False)
    createdById: Mapped[str] = mapped_column(String(36), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_cards_column_id", "columnId", "position"),
    )

    column: Mapped["Column"] = relationship(back_populates="cards")
    members: Mapped[list["CardMember"]] = relationship(back_populates="card", cascade="all, delete-orphan")
    checklists: Mapped[list["Checklist"]] = relationship(back_populates="card", cascade="all, delete-orphan")
    cardLabels: Mapped[list["CardLabel"]] = relationship(back_populates="card", cascade="all, delete-orphan")
