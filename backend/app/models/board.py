from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, text, func, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    spaceId: Mapped[str] = mapped_column(String(36), ForeignKey("spaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    background: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Trello-style board visibility: PRIVATE (space members) / WORKSPACE
    # (anyone in the instance) / PUBLIC (anyone with the link).
    visibility: Mapped[str] = mapped_column(String(20), server_default=text("'WORKSPACE'"), nullable=False)
    settings: Mapped[str] = mapped_column(String, server_default=text("'{}'"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, server_default=text("'0'"), nullable=False)
    # Optional project link so a space/board can be tied back to a project.
    projectId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    space: Mapped["Space"] = relationship(back_populates="boards")
    columns: Mapped[list["Column"]] = relationship(back_populates="board", cascade="all, delete-orphan")
    boardLabels: Mapped[list["BoardLabel"]] = relationship(back_populates="board", cascade="all, delete-orphan")
