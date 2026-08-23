from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class TicketReply(Base):
    __tablename__ = "ticket_replies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ticketId: Mapped[str] = mapped_column(String(36), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    authorId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    customerId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    content: Mapped[str] = mapped_column(String, nullable=False)
    isInternal: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), server_default=text("REPLY"), nullable=False)

    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_ticket_replies_ticket_id", "ticketId"),
        Index("ix_ticket_replies_author_id", "authorId"),
    )

    ticket: Mapped["Ticket"] = relationship(back_populates="replies")
    author: Mapped[Optional["User"]] = relationship(foreign_keys="TicketReply.authorId")
    customer: Mapped[Optional["Customer"]] = relationship(back_populates="replies", foreign_keys="TicketReply.customerId")
