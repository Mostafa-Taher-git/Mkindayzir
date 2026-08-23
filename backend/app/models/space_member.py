from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SpaceMember(Base):
    __tablename__ = "space_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    spaceId: Mapped[str] = mapped_column(String(36), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), server_default=text("MEMBER"), nullable=False)

    __table_args__ = (
        UniqueConstraint("spaceId", "userId", name="uq_space_members_space_user"),
    )

    space: Mapped["Space"] = relationship(back_populates="members")
