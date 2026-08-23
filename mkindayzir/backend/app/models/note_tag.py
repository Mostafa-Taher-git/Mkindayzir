from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NoteTag(Base):
    __tablename__ = "note_tags"

    noteId: Mapped[str] = mapped_column(String(36), ForeignKey("vault_notes.id", ondelete="CASCADE"), primary_key=True)
    tagId: Mapped[str] = mapped_column(String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    note: Mapped["VaultNote"] = relationship(back_populates="tags")
    tag: Mapped["Tag"] = relationship(back_populates="notes")
