from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Space(Base):
    __tablename__ = "spaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    visibility: Mapped[str] = mapped_column(String(50), server_default=text("'PRIVATE'"), nullable=False)
    createdById: Mapped[str] = mapped_column(String(36), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    boards: Mapped[list["Board"]] = relationship(back_populates="space", cascade="all, delete-orphan")
    members: Mapped[list["SpaceMember"]] = relationship(back_populates="space", cascade="all, delete-orphan")
