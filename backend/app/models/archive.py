from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, text, func, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ArchiveFolder(Base):
    __tablename__ = "archive_folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ownerId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    parentId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("archive_folders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    isDefault: Mapped[bool] = mapped_column(server_default=text("'0'"), nullable=False)
    entityType: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    position: Mapped[int] = mapped_column(Integer, server_default=text("'0'"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_archive_folders_owner", "ownerId"),
        Index("ix_archive_folders_parent", "parentId"),
    )

    parent: Mapped[Optional["ArchiveFolder"]] = relationship(remote_side="ArchiveFolder.id", foreign_keys="ArchiveFolder.parentId")
    items: Mapped[list["ArchiveItem"]] = relationship(back_populates="folder")


class ArchiveItem(Base):
    __tablename__ = "archive_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ownerId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    entityType: Mapped[str] = mapped_column(String(64), nullable=False)
    entityId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    folderId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("archive_folders.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payload: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    archivedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    archivedBy: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    restoredAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    permanentlyDeletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    originalCreatedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_archive_items_owner", "ownerId"),
        Index("ix_archive_items_folder", "folderId"),
        Index("ix_archive_items_entity", "entityType", "entityId"),
    )

    folder: Mapped[Optional["ArchiveFolder"]] = relationship(back_populates="items")
