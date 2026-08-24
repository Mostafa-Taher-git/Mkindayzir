from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    entityType: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entityId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    isRead: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    readAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_notifications_user_id", "userId", "isRead"),
    )

    user: Mapped["User"] = relationship(back_populates="notifications")
