from typing import Optional
from sqlalchemy import String, DateTime, text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class InternalLink(Base):
    __tablename__ = "internal_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sourceId: Mapped[str] = mapped_column(String(36), ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False)
    targetId: Mapped[str] = mapped_column(String(36), ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False)
    context: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("sourceId", "targetId", name="uq_internal_links_source_target"),
    )

    source: Mapped["VaultNote"] = relationship(back_populates="outLinks", foreign_keys="InternalLink.sourceId")
    target: Mapped["VaultNote"] = relationship(back_populates="inLinks", foreign_keys="InternalLink.targetId")
