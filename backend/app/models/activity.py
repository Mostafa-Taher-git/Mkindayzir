from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entityType: Mapped[str] = mapped_column(String(50), nullable=False)
    entityId: Mapped[str] = mapped_column(String(36), nullable=False)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    changes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_activities_entity", "entityType", "entityId"),
        Index("ix_activities_user_id", "userId"),
    )

    user: Mapped["User"] = relationship(back_populates="activities")
