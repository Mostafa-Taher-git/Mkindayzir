from datetime import datetime
from sqlalchemy import String, Integer, DateTime, text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entityType: Mapped[str] = mapped_column(String(50), nullable=False)
    entityId: Mapped[str] = mapped_column(String(36), nullable=False)
    fileName: Mapped[str] = mapped_column(String(255), nullable=False)
    fileSize: Mapped[int] = mapped_column(Integer, nullable=False)
    mimeType: Mapped[str] = mapped_column(String(255), nullable=False)
    storagePath: Mapped[str] = mapped_column(String, nullable=False)
    uploadedBy: Mapped[str] = mapped_column(String(36), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    __table_args__ = (
        Index("ix_attachments_entity", "entityType", "entityId"),
    )
