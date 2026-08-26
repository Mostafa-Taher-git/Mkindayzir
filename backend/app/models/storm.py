"""Storm card — a personal mind-map node.

Each row is a single fixed-size card on the user's Storm canvas. Position is
stored in canvas coordinates (independent of zoom/pan so it persists).
"""
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, DateTime, text, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.storm_link import StormLink


class Storm(Base):
    __tablename__ = "storms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ownerId: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # 1–80 chars, validated at the boundary.
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    # Canvas-space coordinates; the renderer scales these by zoom/pan.
    positionX: Mapped[float] = mapped_column(nullable=False, default=0)
    positionY: Mapped[float] = mapped_column(nullable=False, default=0)

    isArchived: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=text("false"))

    createdAt: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[Optional[DateTime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # outLinks = links where this card is the source; inLinks where it is the target.
    outLinks: Mapped[list["StormLink"]] = relationship(
        back_populates="source",
        foreign_keys="StormLink.sourceId",
        cascade="all, delete-orphan",
    )
    inLinks: Mapped[list["StormLink"]] = relationship(
        back_populates="target",
        foreign_keys="StormLink.targetId",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_storms_owner", "ownerId"),
    )
