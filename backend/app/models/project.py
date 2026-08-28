from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, text, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default=text("'ACTIVE'"), nullable=False)
    leadId: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    teamId: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("teams.id"), nullable=True)
    settings: Mapped[str] = mapped_column(String, server_default=text("'{}'"), nullable=False)
    createdById: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deletedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    creator: Mapped["User"] = relationship(back_populates="created_projects", foreign_keys="Project.createdById")
    team: Mapped[Optional["Team"]] = relationship(back_populates="projects")
    workItems: Mapped[list["WorkItem"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    iterations: Mapped[list["Iteration"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    initiatives: Mapped[list["Initiative"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    workflows: Mapped[list["Workflow"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    labels: Mapped[list["Label"]] = relationship(back_populates="project", cascade="all, delete-orphan")

    ownerType: Mapped[str] = mapped_column("ownerType", String(10), server_default=text("'personal'"), nullable=False)
    ownerUserId: Mapped[Optional[str]] = mapped_column("ownerUserId", String(36), ForeignKey("users.id"), nullable=True)
    ownerOrgId: Mapped[Optional[str]] = mapped_column("ownerOrgId", String(36), ForeignKey("organizations.id"), nullable=True)
