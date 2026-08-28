import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class OrgTransition(Base):
    __tablename__ = "org_transitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    orgId: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    fromType: Mapped[str] = mapped_column(String(20), nullable=False)
    toType: Mapped[str] = mapped_column(String(20), nullable=False)
    initiatedBy: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    excludedMembers: Mapped[str] = mapped_column(String, nullable=False, server_default=text("'[]'"))
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
