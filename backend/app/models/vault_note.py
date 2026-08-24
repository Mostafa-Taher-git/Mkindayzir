from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class VaultNote(Base):
    __tablename__ = "vault_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    folderId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vault_folders.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    excerpt: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'DRAFT'"), nullable=False)
    authorId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    meta: Mapped[str] = mapped_column("metadata", String, server_default=text("'{}'"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, server_default=text("'1'"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    publishedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_vault_notes_folder_id", "folderId"),
        Index("ix_vault_notes_author_id", "authorId"),
    )

    folder: Mapped[Optional["VaultFolder"]] = relationship(back_populates="notes")
    author: Mapped["User"] = relationship(back_populates="vault_notes", foreign_keys="VaultNote.authorId")
    tags: Mapped[list["NoteTag"]] = relationship(back_populates="note", cascade="all, delete-orphan")
    outLinks: Mapped[list["InternalLink"]] = relationship(back_populates="source", cascade="all, delete-orphan", foreign_keys="InternalLink.sourceId")
    inLinks: Mapped[list["InternalLink"]] = relationship(back_populates="target", cascade="all, delete-orphan", foreign_keys="InternalLink.targetId")
    versions: Mapped[list["NoteVersion"]] = relationship(back_populates="note", cascade="all, delete-orphan")
    feedback: Mapped[list["NoteFeedback"]] = relationship(back_populates="note", cascade="all, delete-orphan")
