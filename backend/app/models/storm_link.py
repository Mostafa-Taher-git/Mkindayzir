"""Storm link — a connection drawn from one corner circle to another.

Corner numbers are 0..3 (top-left, top-right, bottom-left, bottom-right).
Caps (3/circle, 12/card) are enforced in the service layer.
"""
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, DateTime, Integer, text, func, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.storm import Storm


class StormLink(Base):
    __tablename__ = "storm_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    sourceId: Mapped[str] = mapped_column(String(36), ForeignKey("storms.id", ondelete="CASCADE"), nullable=False)
    sourceCorner: Mapped[int] = mapped_column(Integer, nullable=False)

    targetId: Mapped[str] = mapped_column(String(36), ForeignKey("storms.id", ondelete="CASCADE"), nullable=False)
    targetCorner: Mapped[int] = mapped_column(Integer, nullable=False)

    createdAt: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    source: Mapped["Storm"] = relationship(back_populates="outLinks", foreign_keys=[sourceId])
    target: Mapped["Storm"] = relationship(back_populates="inLinks", foreign_keys=[targetId])

    __table_args__ = (
        # The exact same (source, sourceCorner) -> (target, targetCorner) triple
        # can't be created twice. Same physical line dragged to the other end
        # of the same circle = a different row.
        UniqueConstraint("sourceId", "sourceCorner", "targetId", name="uq_storm_link_triple"),
        Index("ix_storm_links_source", "sourceId"),
        Index("ix_storm_links_target", "targetId"),
    )
