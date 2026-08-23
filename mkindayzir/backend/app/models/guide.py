from datetime import datetime
from sqlalchemy import String, Integer, DateTime, text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Guide(Base):
    __tablename__ = "guides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    order: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), server_default=text("PUBLISHED"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
