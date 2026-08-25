from datetime import datetime
from typing import Optional
from sqlalchemy import String, Float, DateTime, text, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Initiative(Base):
    __tablename__ = "initiatives"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    projectId: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'OPEN'"), nullable=False)
    progress: Mapped[float] = mapped_column(Float, server_default=text("'0'"), nullable=False)
    startDate: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    targetDate: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    project: Mapped["Project"] = relationship(back_populates="initiatives")
    workItems: Mapped[list["WorkItem"]] = relationship(back_populates="initiative")
