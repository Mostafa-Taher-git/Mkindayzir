from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CardMember(Base):
    __tablename__ = "card_members"

    cardId: Mapped[str] = mapped_column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    card: Mapped["Card"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="cards")
