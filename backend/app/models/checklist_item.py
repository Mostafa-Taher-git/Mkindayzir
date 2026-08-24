from sqlalchemy import String, Boolean, Integer, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    checklistId: Mapped[str] = mapped_column(String(36), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    isCompleted: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, server_default=text("'0'"), nullable=False)

    checklist: Mapped["Checklist"] = relationship(back_populates="items")
