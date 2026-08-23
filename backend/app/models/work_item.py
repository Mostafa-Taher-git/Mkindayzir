from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, text, func, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class WorkItem(Base):
    __tablename__ = "work_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    projectId: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    priority: Mapped[str] = mapped_column(String(50), server_default=text("MEDIUM"), nullable=False)
    assigneeId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reporterId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    initiativeId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("initiatives.id"), nullable=True)
    iterationId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("iterations.id"), nullable=True)
    parentId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("work_items.id"), nullable=True)
    storyPoints: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    dueDate: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolvedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    meta: Mapped[str] = mapped_column("metadata", String, server_default=text("'{}'"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("projectId", "number", name="uq_work_items_project_number"),
        Index("ix_work_items_project_status", "projectId", "status"),
        Index("ix_work_items_assignee_id", "assigneeId"),
        Index("ix_work_items_iteration_id", "iterationId"),
    )

    project: Mapped["Project"] = relationship(back_populates="workItems")
    assignee: Mapped[Optional["User"]] = relationship(back_populates="assigned_items", foreign_keys="WorkItem.assigneeId")
    reporter: Mapped["User"] = relationship(back_populates="reported_items", foreign_keys="WorkItem.reporterId")
    initiative: Mapped[Optional["Initiative"]] = relationship(back_populates="workItems")
    iteration: Mapped[Optional["Iteration"]] = relationship(back_populates="workItems")
    parent: Mapped[Optional["WorkItem"]] = relationship(back_populates="children", remote_side="WorkItem.id", foreign_keys="WorkItem.parentId")
    children: Mapped[list["WorkItem"]] = relationship(back_populates="parent")
    labels: Mapped[list["WorkItemLabel"]] = relationship(back_populates="workItem", cascade="all, delete-orphan")
    links: Mapped[list["WorkItemLink"]] = relationship(back_populates="source", cascade="all, delete-orphan", foreign_keys="WorkItemLink.sourceId")
    linkedBy: Mapped[list["WorkItemLink"]] = relationship(back_populates="target", cascade="all, delete-orphan", foreign_keys="WorkItemLink.targetId")
