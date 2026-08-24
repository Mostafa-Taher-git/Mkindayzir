from datetime import datetime
from sqlalchemy import String, Integer, DateTime, text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NoteVersion(Base):
    __tablename__ = "note_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    noteId: Mapped[str] = mapped_column(String(36), ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    editedBy: Mapped[str] = mapped_column(String(36), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    __table_args__ = (
        UniqueConstraint("noteId", "version", name="uq_note_versions_note_version"),
    )

    note: Mapped["VaultNote"] = relationship(back_populates="versions")
