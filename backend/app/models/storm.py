from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func, Float, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Storm(Base):
    __tablename__ = "storms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # ownership: personal (private to user) or org (shared with org members)
    ownerType: Mapped[str] = mapped_column(String(10), server_default=text("'personal'"), nullable=False)
    ownerUserId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    ownerOrgId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    # graph position
    x: Mapped[float] = mapped_column(Float, server_default=text("0"), nullable=False)
    y: Mapped[float] = mapped_column(Float, server_default=text("0"), nullable=False)
    width: Mapped[int] = mapped_column(Integer, server_default=text("200"), nullable=False)
    height: Mapped[int] = mapped_column(Integer, server_default=text("88"), nullable=False)

    isArchived: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    # hand-drawn whiteboard data: JSON string {elements, appState, files}
    whiteboardData: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
