from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, text, func, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'OPEN'"), nullable=False)
    priority: Mapped[str] = mapped_column(String(50), server_default=text("'MEDIUM'"), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(50), server_default=text("'GENERAL'"), nullable=True)
    source: Mapped[str] = mapped_column(String(50), server_default=text("'INTERNAL'"), nullable=False)

    customerId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    assigneeId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    createdById: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    projectId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)

    firstResponseAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolvedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    dueDate: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    slaBreached: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)

    tags: Mapped[str] = mapped_column(String, server_default=text("'[]'"), nullable=False)
    meta: Mapped[str] = mapped_column("metadata", String, server_default=text("'{}'"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, server_default=text("'0'"), nullable=False)

    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_tickets_status", "status"),
        Index("ix_tickets_assignee", "assigneeId"),
        Index("ix_tickets_customer", "customerId"),
    )

    assignee: Mapped[Optional["User"]] = relationship(foreign_keys="Ticket.assigneeId")
    creator: Mapped["User"] = relationship(foreign_keys="Ticket.createdById")
    customer: Mapped[Optional["Customer"]] = relationship(back_populates="tickets", foreign_keys="Ticket.customerId")
    project: Mapped[Optional["Project"]] = relationship(foreign_keys="Ticket.projectId")
    replies: Mapped[List["TicketReply"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketReply.createdAt.asc()"
    )
