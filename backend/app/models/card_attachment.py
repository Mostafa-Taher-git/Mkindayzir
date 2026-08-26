from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, text, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CardAttachment(Base):
    __tablename__ = "card_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    cardId: Mapped[str] = mapped_column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    fileName: Mapped[str] = mapped_column("fileName", String(255), nullable=False)  # stored name on disk
    displayName: Mapped[str] = mapped_column("displayName", String(255), nullable=False)  # original upload name
    mimeType: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sizeBytes: Mapped[int] = mapped_column(Integer, server_default=text("'0'"), nullable=False)
    uploadedById: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    card: Mapped["Card"] = relationship(back_populates="attachments")
    uploader: Mapped["User"] = relationship(foreign_keys=[uploadedById])
