from datetime import datetime
from sqlalchemy import String, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class WorkItemLink(Base):
    __tablename__ = "work_item_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sourceId: Mapped[str] = mapped_column(String(36), ForeignKey("work_items.id"), nullable=False)
    targetId: Mapped[str] = mapped_column(String(36), ForeignKey("work_items.id"), nullable=False)
    linkType: Mapped[str] = mapped_column(String(50), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    source: Mapped["WorkItem"] = relationship(back_populates="links", foreign_keys="WorkItemLink.sourceId")
    target: Mapped["WorkItem"] = relationship(back_populates="linkedBy", foreign_keys="WorkItemLink.targetId")
