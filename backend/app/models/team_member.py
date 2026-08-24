from datetime import datetime
from sqlalchemy import String, DateTime, text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    teamId: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), server_default=text("'MEMBER'"), nullable=False)
    joinedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    __table_args__ = (
        UniqueConstraint("userId", "teamId", name="uq_team_members_user_team"),
    )

    user: Mapped["User"] = relationship(back_populates="team_memberships")
    team: Mapped["Team"] = relationship(back_populates="members")
