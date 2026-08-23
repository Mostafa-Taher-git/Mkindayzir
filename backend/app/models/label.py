from datetime import datetime
from sqlalchemy import String, DateTime, text, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    projectId: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("projectId", "name", name="uq_labels_project_name"),
    )

    project: Mapped["Project"] = relationship(back_populates="labels")
    workItems: Mapped[list["WorkItemLabel"]] = relationship(back_populates="label", cascade="all, delete-orphan")
