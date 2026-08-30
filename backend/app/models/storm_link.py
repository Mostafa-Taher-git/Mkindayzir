from datetime import datetime
from sqlalchemy import String, DateTime, func, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class StormLink(Base):
    __tablename__ = "storm_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fromStormId: Mapped[str] = mapped_column(String(36), ForeignKey("storms.id", ondelete="CASCADE"), nullable=False, index=True)
    fromCorner: Mapped[int] = mapped_column(Integer, nullable=False)  # 0 NW, 1 NE, 2 SW, 3 SE
    toStormId: Mapped[str] = mapped_column(String(36), ForeignKey("storms.id", ondelete="CASCADE"), nullable=False, index=True)
    toCorner: Mapped[int] = mapped_column(Integer, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
