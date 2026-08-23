from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    members: Mapped[list["TeamMember"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship(back_populates="team")
