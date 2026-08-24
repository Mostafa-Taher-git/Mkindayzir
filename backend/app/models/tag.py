from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    notes: Mapped[list["NoteTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")
