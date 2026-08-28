import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, Text, ForeignKey, UniqueConstraint, text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def _id() -> str:
    return uuid.uuid4().hex


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    ownerId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    avatarUrl: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    maxMembers: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    settings: Mapped[str] = mapped_column(Text, server_default=text("'{}'"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("orgId", "userId", name="uq_org_member_org_user"),
        UniqueConstraint("userId", name="uq_org_member_one_org_per_user"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    orgId: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'member'"))
    invitedBy: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    joinedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    organization: Mapped["Organization"] = relationship(back_populates="members")
