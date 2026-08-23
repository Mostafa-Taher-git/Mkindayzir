from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    passwordHash: Mapped[str] = mapped_column("passwordHash", String(255), nullable=False)
    displayName: Mapped[str] = mapped_column("displayName", String(255), nullable=False)
    avatar: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    role: Mapped[str] = mapped_column(String(50), server_default=text("MEMBER"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), server_default=text("ACTIVE"), nullable=False)
    timezone: Mapped[str] = mapped_column(String(100), server_default=text("UTC"), nullable=False)
    locale: Mapped[str] = mapped_column(String(10), server_default=text("en"), nullable=False)
    preferences: Mapped[str] = mapped_column(String, server_default=text("'{}'"), nullable=False)
    aiApiKey: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    aiProvider: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    aiModel: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    lastActiveAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    team_memberships: Mapped[list["TeamMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    assigned_items: Mapped[list["WorkItem"]] = relationship(back_populates="assignee", foreign_keys="WorkItem.assigneeId")
    reported_items: Mapped[list["WorkItem"]] = relationship(back_populates="reporter", foreign_keys="WorkItem.reporterId")
    created_projects: Mapped[list["Project"]] = relationship(back_populates="creator", foreign_keys="Project.createdById")
    cards: Mapped[list["CardMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author", cascade="all, delete-orphan")
    activities: Mapped[list["Activity"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    vault_notes: Mapped[list["VaultNote"]] = relationship(back_populates="author", foreign_keys="VaultNote.authorId")
