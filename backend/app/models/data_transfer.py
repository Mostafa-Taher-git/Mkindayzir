import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DataTransfer(Base):
    __tablename__ = "data_transfers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # to_org | from_org
    orgId: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'completed'"))
    items: Mapped[str] = mapped_column(String, nullable=False, server_default=text("'{}'"))
    startedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
