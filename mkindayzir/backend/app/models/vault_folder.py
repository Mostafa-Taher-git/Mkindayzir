from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, text, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class VaultFolder(Base):
    __tablename__ = "vault_folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    parentId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vault_folders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("parentId", "name", name="uq_vault_folders_parent_name"),
    )

    parent: Mapped[Optional["VaultFolder"]] = relationship(back_populates="children", remote_side="VaultFolder.id", foreign_keys="VaultFolder.parentId")
    children: Mapped[list["VaultFolder"]] = relationship(back_populates="parent")
    notes: Mapped[list["VaultNote"]] = relationship(back_populates="folder", cascade="all, delete-orphan")
