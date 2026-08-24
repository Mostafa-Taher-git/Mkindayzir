from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    userId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    resource: Mapped[str] = mapped_column(String(255), nullable=False)
    resourceId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ipAddress: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    userAgent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_audit_logs_user_id", "userId"),
        Index("ix_audit_logs_resource", "resource", "resourceId"),
        Index("ix_audit_logs_created_at", "createdAt"),
    )
