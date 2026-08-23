from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    passwordHash: Mapped[str] = mapped_column("passwordHash", String(255), nullable=False)
    displayName: Mapped[str] = mapped_column("displayName", String(255), nullable=False)
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("ACTIVE"), nullable=False)
    meta: Mapped[str] = mapped_column("metadata", String, server_default=text("'{}'"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    tickets: Mapped[List["Ticket"]] = relationship(back_populates="customer")
    replies: Mapped[List["TicketReply"]] = relationship(back_populates="customer")
