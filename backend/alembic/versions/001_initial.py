"""
initial

Revision ID: 001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite


revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("passwordHash", sa.String(255), nullable=False),
        sa.Column("displayName", sa.String(255), nullable=False),
        sa.Column("avatar", sa.String(1024), nullable=True),
        sa.Column("role", sa.String(50), server_default="MEMBER", nullable=False),
        sa.Column("status", sa.String(50), server_default="ACTIVE", nullable=False),
        sa.Column("timezone", sa.String(100), server_default="UTC", nullable=False),
        sa.Column("locale", sa.String(10), server_default="en", nullable=False),
        sa.Column("preferences", sa.String, server_default="'{}'", nullable=False),
        sa.Column("aiApiKey", sa.String, nullable=True),
        sa.Column("aiProvider", sa.String(100), nullable=True),
        sa.Column("aiModel", sa.String(255), nullable=True),
        sa.Column("lastActiveAt", sa.DateTime, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False, unique=True),
        sa.Column("expiresAt", sa.DateTime, nullable=False),
        sa.Column("ipAddress", sa.String(45), nullable=True),
        sa.Column("userAgent", sa.String(255), nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_sessions_token", "sessions", ["token"], unique=True)

    op.create_table(
        "teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )

    op.create_table(
        "team_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("teamId", sa.String(36), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("role", sa.String(50), server_default="MEMBER", nullable=False),
        sa.Column("joinedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("userId", "teamId", name="uq_team_members_user_team"),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("status", sa.String(50), server_default="ACTIVE", nullable=False),
        sa.Column("leadId", sa.String(36), nullable=True),
        sa.Column("teamId", sa.String(36), nullable=True),
        sa.Column("settings", sa.String, server_default="'{}'", nullable=False),
        sa.Column("createdById", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_projects_key", "projects", ["key"], unique=True)

    op.create_table(
        "iterations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("projectId", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("goal", sa.String, nullable=True),
        sa.Column("status", sa.String(50), server_default="PLANNING", nullable=False),
        sa.Column("startDate", sa.DateTime, nullable=True),
        sa.Column("endDate", sa.DateTime, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_iterations_project_id", "iterations", ["projectId"])

    op.create_table(
        "initiatives",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("projectId", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("status", sa.String(50), server_default="OPEN", nullable=False),
        sa.Column("progress", sa.Float, server_default="0", nullable=False),
        sa.Column("startDate", sa.DateTime, nullable=True),
        sa.Column("targetDate", sa.DateTime, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_initiatives_project_id", "initiatives", ["projectId"])

    op.create_table(
        "workflows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("projectId", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("statuses", sa.String, nullable=False),
        sa.Column("transitions", sa.String, nullable=False),
        sa.Column("isDefault", sa.Boolean, server_default="false", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_workflows_project_id", "workflows", ["projectId"])

    op.create_table(
        "labels",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("projectId", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(50), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("projectId", "name", name="uq_labels_project_name"),
    )

    op.create_table(
        "work_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("projectId", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("priority", sa.String(50), server_default="MEDIUM", nullable=False),
        sa.Column("assigneeId", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reporterId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("initiativeId", sa.String(36), sa.ForeignKey("initiatives.id"), nullable=True),
        sa.Column("iterationId", sa.String(36), sa.ForeignKey("iterations.id"), nullable=True),
        sa.Column("parentId", sa.String(36), sa.ForeignKey("work_items.id"), nullable=True),
        sa.Column("storyPoints", sa.Integer, nullable=True),
        sa.Column("dueDate", sa.DateTime, nullable=True),
        sa.Column("resolvedAt", sa.DateTime, nullable=True),
        sa.Column("metadata", sa.String, server_default="'{}'", nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
        sa.UniqueConstraint("projectId", "number", name="uq_work_items_project_number"),
    )
    op.create_index("ix_work_items_project_status", "work_items", ["projectId", "status"])
    op.create_index("ix_work_items_assignee_id", "work_items", ["assigneeId"])
    op.create_index("ix_work_items_iteration_id", "work_items", ["iterationId"])

    op.create_table(
        "work_item_labels",
        sa.Column("workItemId", sa.String(36), sa.ForeignKey("work_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("labelId", sa.String(36), sa.ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "work_item_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sourceId", sa.String(36), sa.ForeignKey("work_items.id"), nullable=False),
        sa.Column("targetId", sa.String(36), sa.ForeignKey("work_items.id"), nullable=False),
        sa.Column("linkType", sa.String(50), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_work_item_links_source_id", "work_item_links", ["sourceId"])
    op.create_index("ix_work_item_links_target_id", "work_item_links", ["targetId"])

    op.create_table(
        "spaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("visibility", sa.String(50), server_default="PRIVATE", nullable=False),
        sa.Column("createdById", sa.String(36), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )

    op.create_table(
        "space_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("spaceId", sa.String(36), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(50), server_default="MEMBER", nullable=False),
        sa.UniqueConstraint("spaceId", "userId", name="uq_space_members_space_user"),
    )

    op.create_table(
        "boards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("spaceId", sa.String(36), sa.ForeignKey("spaces.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("background", sa.String, nullable=True),
        sa.Column("settings", sa.String, server_default="'{}'", nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_boards_space_id", "boards", ["spaceId"])

    op.create_table(
        "board_labels",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("boardId", sa.String(36), sa.ForeignKey("boards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(50), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("boardId", "name", name="uq_board_labels_board_name"),
    )

    op.create_table(
        "columns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("boardId", sa.String(36), sa.ForeignKey("boards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("limit", sa.Integer, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_columns_board_id", "columns", ["boardId", "position"])

    op.create_table(
        "cards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("columnId", sa.String(36), sa.ForeignKey("columns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("dueDate", sa.DateTime, nullable=True),
        sa.Column("coverColor", sa.String(50), nullable=True),
        sa.Column("metadata", sa.String, server_default="'{}'", nullable=False),
        sa.Column("createdById", sa.String(36), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_cards_column_id", "cards", ["columnId", "position"])

    op.create_table(
        "card_labels",
        sa.Column("cardId", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("labelId", sa.String(36), sa.ForeignKey("board_labels.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "card_members",
        sa.Column("cardId", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "checklists",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cardId", sa.String(36), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_table(
        "checklist_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("checklistId", sa.String(36), sa.ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("isCompleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
    )

    op.create_table(
        "vault_folders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("parentId", sa.String(36), sa.ForeignKey("vault_folders.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("path", sa.String, nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
        sa.UniqueConstraint("parentId", "name", name="uq_vault_folders_parent_name"),
    )

    op.create_table(
        "vault_notes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("folderId", sa.String(36), sa.ForeignKey("vault_folders.id"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("content", sa.String, nullable=False),
        sa.Column("excerpt", sa.String, nullable=True),
        sa.Column("status", sa.String(50), server_default="DRAFT", nullable=False),
        sa.Column("authorId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("metadata", sa.String, server_default="'{}'", nullable=False),
        sa.Column("version", sa.Integer, server_default="1", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
        sa.Column("publishedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_vault_notes_folder_id", "vault_notes", ["folderId"])
    op.create_index("ix_vault_notes_author_id", "vault_notes", ["authorId"])

    op.create_table(
        "note_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("noteId", sa.String(36), sa.ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.String, nullable=False),
        sa.Column("editedBy", sa.String(36), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("noteId", "version", name="uq_note_versions_note_version"),
    )

    op.create_table(
        "internal_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sourceId", sa.String(36), sa.ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("targetId", sa.String(36), sa.ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("context", sa.String, nullable=True),
        sa.UniqueConstraint("sourceId", "targetId", name="uq_internal_links_source_target"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("color", sa.String(50), nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_table(
        "note_tags",
        sa.Column("noteId", sa.String(36), sa.ForeignKey("vault_notes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tagId", sa.String(36), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "note_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("noteId", sa.String(36), sa.ForeignKey("vault_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("helpful", sa.Boolean, nullable=False),
        sa.Column("comment", sa.String, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("noteId", "userId", name="uq_note_feedback_note_user"),
    )

    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_conversations_user_id", "conversations", ["userId"])

    op.create_table(
        "messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversationId", sa.String(36), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("content", sa.String, nullable=False),
        sa.Column("toolCalls", sa.String, nullable=True),
        sa.Column("toolResults", sa.String, nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("tokens", sa.Integer, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversationId"])

    op.create_table(
        "comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entityType", sa.String(50), nullable=False),
        sa.Column("entityId", sa.String(36), nullable=False),
        sa.Column("authorId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.String, nullable=False),
        sa.Column("parentId", sa.String(36), sa.ForeignKey("comments.id"), nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deletedAt", sa.DateTime, nullable=True),
    )
    op.create_index("ix_comments_entity", "comments", ["entityType", "entityId"])

    op.create_table(
        "attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entityType", sa.String(50), nullable=False),
        sa.Column("entityId", sa.String(36), nullable=False),
        sa.Column("fileName", sa.String(255), nullable=False),
        sa.Column("fileSize", sa.Integer, nullable=False),
        sa.Column("mimeType", sa.String(255), nullable=False),
        sa.Column("storagePath", sa.String, nullable=False),
        sa.Column("uploadedBy", sa.String(36), nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_attachments_entity", "attachments", ["entityType", "entityId"])

    op.create_table(
        "activities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entityType", sa.String(50), nullable=False),
        sa.Column("entityId", sa.String(36), nullable=False),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("changes", sa.String, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_activities_entity", "activities", ["entityType", "entityId"])
    op.create_index("ix_activities_user_id", "activities", ["userId"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.String, nullable=True),
        sa.Column("entityType", sa.String(50), nullable=True),
        sa.Column("entityId", sa.String(36), nullable=True),
        sa.Column("isRead", sa.Boolean, server_default="false", nullable=False),
        sa.Column("readAt", sa.DateTime, nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["userId", "isRead"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), nullable=True),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("resource", sa.String(255), nullable=False),
        sa.Column("resourceId", sa.String(36), nullable=True),
        sa.Column("details", sa.String, nullable=True),
        sa.Column("ipAddress", sa.String(45), nullable=True),
        sa.Column("userAgent", sa.String(255), nullable=True),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["userId"])
    op.create_index("ix_audit_logs_resource", "audit_logs", ["resource", "resourceId"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["createdAt"])

    op.create_table(
        "guides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("content", sa.String, nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("order", sa.Integer, server_default="0", nullable=False),
        sa.Column("status", sa.String(50), server_default="PUBLISHED", nullable=False),
        sa.Column("createdAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_guides_slug", "guides", ["slug"], unique=True)

    op.create_table(
        "system_config",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(255), nullable=False, unique=True),
        sa.Column("value", sa.String, nullable=False),
        sa.Column("updatedAt", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("system_config")
    op.drop_table("guides")
    op.drop_index("ix_guides_slug", table_name="guides")
    op.drop_table("audit_logs")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_resource", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("activities")
    op.drop_index("ix_activities_user_id", table_name="activities")
    op.drop_index("ix_activities_entity", table_name="activities")
    op.drop_table("attachments")
    op.drop_index("ix_attachments_entity", table_name="attachments")
    op.drop_table("comments")
    op.drop_index("ix_comments_entity", table_name="comments")
    op.drop_table("messages")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("conversations")
    op.drop_index("ix_conversations_user_id", table_name="conversations")
    op.drop_table("note_feedback")
    op.drop_table("note_tags")
    op.drop_table("tags")
    op.drop_table("internal_links")
    op.drop_table("note_versions")
    op.drop_table("vault_notes")
    op.drop_index("ix_vault_notes_author_id", table_name="vault_notes")
    op.drop_index("ix_vault_notes_folder_id", table_name="vault_notes")
    op.drop_table("vault_folders")
    op.drop_table("checklist_items")
    op.drop_table("checklists")
    op.drop_table("card_members")
    op.drop_table("card_labels")
    op.drop_table("cards")
    op.drop_index("ix_cards_column_id", table_name="cards")
    op.drop_table("columns")
    op.drop_index("ix_columns_board_id", table_name="columns")
    op.drop_table("board_labels")
    op.drop_table("boards")
    op.drop_index("ix_boards_space_id", table_name="boards")
    op.drop_table("space_members")
    op.drop_table("spaces")
    op.drop_table("work_item_links")
    op.drop_index("ix_work_item_links_target_id", table_name="work_item_links")
    op.drop_index("ix_work_item_links_source_id", table_name="work_item_links")
    op.drop_table("work_item_labels")
    op.drop_table("work_items")
    op.drop_index("ix_work_items_iteration_id", table_name="work_items")
    op.drop_index("ix_work_items_assignee_id", table_name="work_items")
    op.drop_index("ix_work_items_project_status", table_name="work_items")
    op.drop_table("labels")
    op.drop_table("workflows")
    op.drop_index("ix_workflows_project_id", table_name="workflows")
    op.drop_table("initiatives")
    op.drop_index("ix_initiatives_project_id", table_name="initiatives")
    op.drop_table("iterations")
    op.drop_index("ix_iterations_project_id", table_name="iterations")
    op.drop_table("projects")
    op.drop_index("ix_projects_key", table_name="projects")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("sessions")
    op.drop_index("ix_sessions_token", table_name="sessions")
    op.drop_table("users")
    op.drop_index("ix_users_email", table_name="users")
