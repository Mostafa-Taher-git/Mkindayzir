from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class WorkItemLabel(Base):
    __tablename__ = "work_item_labels"

    workItemId: Mapped[str] = mapped_column(String(36), ForeignKey("work_items.id", ondelete="CASCADE"), primary_key=True)
    labelId: Mapped[str] = mapped_column(String(36), ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True)

    workItem: Mapped["WorkItem"] = relationship(back_populates="labels")
    label: Mapped["Label"] = relationship(back_populates="workItems")
