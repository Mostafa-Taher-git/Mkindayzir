from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CardLabel(Base):
    __tablename__ = "card_labels"

    cardId: Mapped[str] = mapped_column(String(36), ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True)
    labelId: Mapped[str] = mapped_column(String(36), ForeignKey("board_labels.id", ondelete="CASCADE"), primary_key=True)

    card: Mapped["Card"] = relationship(back_populates="cardLabels")
    label: Mapped["BoardLabel"] = relationship(back_populates="cardLabels")
