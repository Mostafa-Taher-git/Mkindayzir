from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expiresAt: Mapped[datetime] = mapped_column("expiresAt", DateTime, nullable=False)
    ipAddress: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    userAgent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="sessions")
