import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_transfer import DataTransfer
from app.models.organization import OrganizationMember
from app.models.project import Project
from app.models.space import Space
from app.models.ticket import Ticket
from app.models.vault_note import VaultNote
from app.models.label import Label
from app.models.initiative import Initiative
from app.models.iteration import Iteration
from app.models.workflow import Workflow
from app.models.work_item import WorkItem
from app.models.work_item_label import WorkItemLabel
from app.models.work_item_link import WorkItemLink
from app.models.ticket_reply import TicketReply
from app.models.space_member import SpaceMember
from app.models.board import Board
from app.models.board_label import BoardLabel
from app.models.board_star import BoardStar
from app.models.column import Column
from app.models.card import Card
from app.models.card_member import CardMember
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.card_label import CardLabel
from app.models.card_attachment import CardAttachment
from app.models.comment import Comment
from app.models.note_version import NoteVersion
from app.models.note_tag import NoteTag
from app.models.note_feedback import NoteFeedback
from app.models.internal_link import InternalLink
from app.models.vault_folder import VaultFolder


def _now():
    return datetime.now(timezone.utc)


# Column name → id_map key for FK resolution during copy
# labelId intentionally omitted — handled explicitly below (CardLabel→board_labels, WorkItemLabel→labels)
_FK_TO_MAP = {
    'projectId': 'projects',
    'initiativeId': 'initiatives',
    'iterationId': 'iterations',
    'parentId': 'work_items',
    'ticketId': 'tickets',
    'spaceId': 'spaces',
    'boardId': 'boards',
    'columnId': 'columns',
    'cardId': 'cards',
    'checklistId': 'checklists',
    'noteId': 'notes',
    'sourceId': 'notes',
    'targetId': 'notes',
    'workItemId': 'work_items',
    # Preserve these (don't remap)
    'createdById': None,
    'userId': None,
    'tagId': None,
}


class TransferService:
    @staticmethod
    async def _require_member(db: AsyncSession, user: dict, org_id: str) -> None:
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if m is None:
            raise ValueError("not a member of this organization")

    @staticmethod
    async def preview_personal(db: AsyncSession, user: dict) -> dict:
        out: dict = {"projects": [], "spaces": [], "notes": [], "tickets": []}
        projects = (await db.execute(
            select(Project).where(
                Project.ownerType == "personal",
                Project.ownerUserId == user["id"],
                Project.deletedAt.is_(None),
            )
        )).scalars().all()
        out["projects"] = [{"id": p.id, "name": p.name, "key": p.key} for p in projects]

        spaces = (await db.execute(
            select(Space).where(
                Space.ownerType == "personal",
                Space.ownerUserId == user["id"],
                Space.deletedAt.is_(None),
            )
        )).scalars().all()
        out["spaces"] = [{"id": s.id, "name": s.name} for s in spaces]

        notes = (await db.execute(
            select(VaultNote).where(
                VaultNote.ownerType == "personal",
                VaultNote.ownerUserId == user["id"],
                VaultNote.deletedAt.is_(None),
            )
        )).scalars().all()
        out["notes"] = [{"id": n.id, "title": n.title or "(untitled)"} for n in notes]

        tickets = (await db.execute(
            select(Ticket).where(
                Ticket.ownerType == "personal",
                Ticket.ownerUserId == user["id"],
                Ticket.deletedAt.is_(None),
            )
        )).scalars().all()
        out["tickets"] = [{"id": t.id, "number": t.number, "subject": t.subject} for t in tickets]
        return out

    @staticmethod
    async def preview_org(db: AsyncSession, user: dict, org_id: str) -> dict:
        await TransferService._require_member(db, user, org_id)
        out: dict = {"projects": [], "spaces": [], "notes": [], "tickets": []}
        projects = (await db.execute(
            select(Project).where(
                Project.ownerType == "org",
                Project.ownerOrgId == org_id,
                Project.deletedAt.is_(None),
            )
        )).scalars().all()
        out["projects"] = [{"id": p.id, "name": p.name, "key": p.key} for p in projects]
        spaces = (await db.execute(
            select(Space).where(
                Space.ownerType == "org",
                Space.ownerOrgId == org_id,
                Space.deletedAt.is_(None),
            )
        )).scalars().all()
        out["spaces"] = [{"id": s.id, "name": s.name} for s in spaces]
        notes = (await db.execute(
            select(VaultNote).where(
                VaultNote.ownerType == "org",
                VaultNote.ownerOrgId == org_id,
                VaultNote.deletedAt.is_(None),
            )
        )).scalars().all()
        out["notes"] = [{"id": n.id, "title": n.title or "(untitled)"} for n in notes]
        tickets = (await db.execute(
            select(Ticket).where(
                Ticket.ownerType == "org",
                Ticket.ownerOrgId == org_id,
                Ticket.deletedAt.is_(None),
            )
        )).scalars().all()
        out["tickets"] = [{"id": t.id, "number": t.number, "subject": t.subject} for t in tickets]
        return out

    # ------------------------------------------------------------------
    # Recursive copy helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def transfer_to_org(
        db: AsyncSession,
        user: dict,
        org_id: str,
        project_ids: list[str] | None = None,
        space_ids: list[str] | None = None,
        note_ids: list[str] | None = None,
        ticket_ids: list[str] | None = None,
    ) -> dict:
        await TransferService._require_member(db, user, org_id)
        project_ids = list(project_ids or [])
        space_ids = list(space_ids or [])
        note_ids = list(note_ids or [])
        ticket_ids = list(ticket_ids or [])

        now = _now()
        id_maps: dict[str, dict[str, str]] = {}  # type_key → {old_id: new_id}

        def _new_id():
            return str(uuid.uuid4())

        def _track(key, old_id, new_id):
            id_maps.setdefault(key, {})[old_id] = new_id

        def _resolve(col_name, old_val):
            mk = _FK_TO_MAP.get(col_name)
            if mk and old_val and mk in id_maps and old_val in id_maps[mk]:
                return id_maps[mk][old_val]
            return old_val

        def _build(model_cls, old, new_id, owner_type, owner_org_id, fk_cols):
            values = {}
            for col in model_cls.__table__.columns:
                n = col.name
                if n == "id":
                    values[n] = new_id
                elif n == "createdAt":
                    values[n] = old.createdAt
                elif n == "updatedAt":
                    values[n] = now
                elif n == "deletedAt":
                    values[n] = None
                elif n == "ownerType" and owner_type:
                    values[n] = owner_type
                elif n == "ownerUserId" and owner_type:
                    values[n] = None
                elif n == "ownerOrgId" and owner_type:
                    values[n] = owner_org_id
                elif n == "createdById":
                    values[n] = getattr(old, "createdById", None)
                elif n in fk_cols:
                    values[n] = _resolve(n, getattr(old, n))
                else:
                    values[n] = getattr(old, n)
            return model_cls(**values)

        # ================================================================
        # COPY PROJECTS + children
        # ================================================================
        if project_ids:
            proj_rows = (await db.execute(
                select(Project).where(Project.id.in_(project_ids))
            )).scalars().all()
            for old in proj_rows:
                new = _build(Project, old, _new_id(), "org", org_id, [])
                db.add(new)
                _track("projects", old.id, new.id)

            # Labels
            for old in (await db.execute(
                select(Label).where(Label.projectId.in_(project_ids))
            )).scalars().all():
                new = _build(Label, old, _new_id(), None, None, ["projectId"])
                db.add(new)
                _track("labels", old.id, new.id)

            # Initiatives
            for old in (await db.execute(
                select(Initiative).where(Initiative.projectId.in_(project_ids))
            )).scalars().all():
                new = _build(Initiative, old, _new_id(), None, None, ["projectId"])
                db.add(new)
                _track("initiatives", old.id, new.id)

            # Iterations
            for old in (await db.execute(
                select(Iteration).where(Iteration.projectId.in_(project_ids))
            )).scalars().all():
                new = _build(Iteration, old, _new_id(), None, None, ["projectId"])
                db.add(new)
                _track("iterations", old.id, new.id)

            # Workflows
            for old in (await db.execute(
                select(Workflow).where(Workflow.projectId.in_(project_ids))
            )).scalars().all():
                new = _build(Workflow, old, _new_id(), None, None, ["projectId"])
                db.add(new)
                _track("workflows", old.id, new.id)

            # WorkItems
            for old in (await db.execute(
                select(WorkItem).where(WorkItem.projectId.in_(project_ids))
            )).scalars().all():
                new = _build(WorkItem, old, _new_id(), None, None, [
                    "projectId", "initiativeId", "iterationId", "parentId",
                ])
                db.add(new)
                _track("work_items", old.id, new.id)

            # WorkItemLabels
            wi_ids = [w.id for w in (await db.execute(
                select(WorkItem).where(WorkItem.projectId.in_(project_ids))
            )).scalars().all()]
            if wi_ids:
                label_map = id_maps.get("labels", {})
                for old in (await db.execute(
                    select(WorkItemLabel).where(WorkItemLabel.workItemId.in_(wi_ids))
                )).scalars().all():
                    new = _build(WorkItemLabel, old, _new_id(), None, None, ["workItemId"])
                    new.labelId = label_map.get(old.labelId, old.labelId)
                    db.add(new)
                    _track("work_item_labels", old.id, new.id)

            # WorkItemLinks
            if wi_ids:
                for old in (await db.execute(
                    select(WorkItemLink).where(
                        or_(
                            WorkItemLink.sourceId.in_(wi_ids),
                            WorkItemLink.targetId.in_(wi_ids),
                        )
                    )
                )).scalars().all():
                    new = _build(WorkItemLink, old, _new_id(), None, None, ["sourceId", "targetId"])
                    db.add(new)
                    _track("work_item_links", old.id, new.id)

            # Tickets under projects
            proj_tickets = (await db.execute(
                select(Ticket).where(Ticket.projectId.in_(project_ids))
            )).scalars().all()
            for old in proj_tickets:
                new = _build(Ticket, old, _new_id(), "org", org_id, ["projectId"])
                db.add(new)
                _track("tickets", old.id, new.id)

            # TicketReplies (under project tickets)
            proj_ticket_ids = [t.id for t in proj_tickets]
            if proj_ticket_ids:
                for old in (await db.execute(
                    select(TicketReply).where(TicketReply.ticketId.in_(proj_ticket_ids))
                )).scalars().all():
                    new = _build(TicketReply, old, _new_id(), None, None, ["ticketId"])
                    db.add(new)
                    _track("ticket_replies", old.id, new.id)

        # ================================================================
        # COPY SPACES + children
        # ================================================================
        if space_ids:
            space_rows = (await db.execute(
                select(Space).where(Space.id.in_(space_ids))
            )).scalars().all()
            for old in space_rows:
                new = _build(Space, old, _new_id(), "org", org_id, [])
                db.add(new)
                _track("spaces", old.id, new.id)

            # SpaceMembers
            for old in (await db.execute(
                select(SpaceMember).where(SpaceMember.spaceId.in_(space_ids))
            )).scalars().all():
                new = _build(SpaceMember, old, _new_id(), None, None, ["spaceId"])
                db.add(new)
                _track("space_members", old.id, new.id)

            # Boards
            board_rows = (await db.execute(
                select(Board).where(Board.spaceId.in_(space_ids))
            )).scalars().all()
            for old in board_rows:
                new = _build(Board, old, _new_id(), "org", org_id, ["spaceId"])
                db.add(new)
                _track("boards", old.id, new.id)

            board_ids = [b.id for b in board_rows]

            # BoardLabels
            for old in (await db.execute(
                select(BoardLabel).where(BoardLabel.boardId.in_(board_ids))
            )).scalars().all():
                new = _build(BoardLabel, old, _new_id(), None, None, ["boardId"])
                db.add(new)
                _track("board_labels", old.id, new.id)

            # BoardStars
            for old in (await db.execute(
                select(BoardStar).where(BoardStar.boardId.in_(board_ids))
            )).scalars().all():
                new = _build(BoardStar, old, _new_id(), None, None, ["boardId"])
                db.add(new)
                _track("board_stars", old.id, new.id)

            # Columns
            col_rows = (await db.execute(
                select(Column).where(Column.boardId.in_(board_ids))
            )).scalars().all()
            for old in col_rows:
                new = _build(Column, old, _new_id(), "org", org_id, ["boardId"])
                db.add(new)
                _track("columns", old.id, new.id)

            col_ids = [c.id for c in col_rows]

            # Cards
            card_rows = (await db.execute(
                select(Card).where(Card.columnId.in_(col_ids))
            )).scalars().all()
            for old in card_rows:
                new = _build(Card, old, _new_id(), "org", org_id, ["columnId"])
                db.add(new)
                _track("cards", old.id, new.id)

            card_ids = [c.id for c in card_rows]

            # CardMembers
            for old in (await db.execute(
                select(CardMember).where(CardMember.cardId.in_(card_ids))
            )).scalars().all():
                new = _build(CardMember, old, _new_id(), None, None, ["cardId"])
                db.add(new)
                _track("card_members", old.id, new.id)

            # Checklists
            cl_rows = (await db.execute(
                select(Checklist).where(Checklist.cardId.in_(card_ids))
            )).scalars().all()
            for old in cl_rows:
                new = _build(Checklist, old, _new_id(), None, None, ["cardId"])
                db.add(new)
                _track("checklists", old.id, new.id)

            cl_ids = [c.id for c in cl_rows]

            # ChecklistItems
            for old in (await db.execute(
                select(ChecklistItem).where(ChecklistItem.checklistId.in_(cl_ids))
            )).scalars().all():
                new = _build(ChecklistItem, old, _new_id(), None, None, ["checklistId"])
                db.add(new)
                _track("checklist_items", old.id, new.id)

            # CardLabels  (labelId → board_labels, handled explicitly)
            bl_map = id_maps.get("board_labels", {})
            for old in (await db.execute(
                select(CardLabel).where(CardLabel.cardId.in_(card_ids))
            )).scalars().all():
                new = _build(CardLabel, old, _new_id(), None, None, ["cardId"])
                new.labelId = bl_map.get(old.labelId, old.labelId)
                db.add(new)
                _track("card_labels", old.id, new.id)

            # CardAttachments
            for old in (await db.execute(
                select(CardAttachment).where(CardAttachment.cardId.in_(card_ids))
            )).scalars().all():
                new = _build(CardAttachment, old, _new_id(), None, None, ["cardId"])
                db.add(new)
                _track("card_attachments", old.id, new.id)

            # Comments on cards
            for old in (await db.execute(
                select(Comment).where(
                    Comment.entityType == "card",
                    Comment.entityId.in_(card_ids),
                )
            )).scalars().all():
                values = {}
                for col in old.__table__.columns:
                    n = col.name
                    if n == "id":
                        values[n] = _new_id()
                    elif n == "createdAt":
                        values[n] = old.createdAt
                    elif n == "updatedAt":
                        values[n] = now
                    elif n == "deletedAt":
                        values[n] = None
                    elif n == "entityId":
                        values[n] = id_maps.get("cards", {}).get(old.entityId, old.entityId)
                    elif n == "createdById":
                        values[n] = getattr(old, "createdById", None)
                    else:
                        values[n] = getattr(old, n)
                new = Comment(**values)
                db.add(new)
                _track("comments", old.id, new.id)

        # ================================================================
        # COPY VAULT NOTES + children
        # ================================================================
        if note_ids:
            note_rows = (await db.execute(
                select(VaultNote).where(VaultNote.id.in_(note_ids))
            )).scalars().all()
            for old in note_rows:
                new = _build(VaultNote, old, _new_id(), "org", org_id, [])
                db.add(new)
                _track("notes", old.id, new.id)

            # NoteVersions
            for old in (await db.execute(
                select(NoteVersion).where(NoteVersion.noteId.in_(note_ids))
            )).scalars().all():
                new = _build(NoteVersion, old, _new_id(), None, None, ["noteId"])
                db.add(new)
                _track("note_versions", old.id, new.id)

            # NoteTags
            for old in (await db.execute(
                select(NoteTag).where(NoteTag.noteId.in_(note_ids))
            )).scalars().all():
                new = _build(NoteTag, old, _new_id(), None, None, ["noteId", "tagId"])
                db.add(new)
                _track("note_tags", old.id, new.id)

            # NoteFeedbacks
            for old in (await db.execute(
                select(NoteFeedback).where(NoteFeedback.noteId.in_(note_ids))
            )).scalars().all():
                new = _build(NoteFeedback, old, _new_id(), None, None, ["noteId"])
                db.add(new)
                _track("note_feedbacks", old.id, new.id)

            # InternalLinks
            for old in (await db.execute(
                select(InternalLink).where(
                    or_(
                        InternalLink.sourceId.in_(note_ids),
                        InternalLink.targetId.in_(note_ids),
                    )
                )
            )).scalars().all():
                new = _build(InternalLink, old, _new_id(), None, None, ["sourceId", "targetId"])
                db.add(new)
                _track("internal_links", old.id, new.id)

            # VaultFolders
            for old in (await db.execute(
                select(VaultFolder).where(VaultFolder.noteId.in_(note_ids))
            )).scalars().all():
                new = _build(VaultFolder, old, _new_id(), None, None, ["parentId", "noteId"])
                db.add(new)
                _track("vault_folders", old.id, new.id)

        # ================================================================
        # COPY TICKETS (standalone) + children
        # ================================================================
        if ticket_ids:
            ticket_rows = (await db.execute(
                select(Ticket).where(Ticket.id.in_(ticket_ids))
            )).scalars().all()
            for old in ticket_rows:
                new = _build(Ticket, old, _new_id(), "org", org_id, ["projectId"])
                db.add(new)
                _track("tickets", old.id, new.id)

            # TicketReplies
            for old in (await db.execute(
                select(TicketReply).where(TicketReply.ticketId.in_(ticket_ids))
            )).scalars().all():
                new = _build(TicketReply, old, _new_id(), None, None, ["ticketId"])
                db.add(new)
                _track("ticket_replies", old.id, new.id)

            # Comments on tickets
            for old in (await db.execute(
                select(Comment).where(
                    Comment.entityType == "ticket",
                    Comment.entityId.in_(ticket_ids),
                )
            )).scalars().all():
                values = {}
                for col in old.__table__.columns:
                    n = col.name
                    if n == "id":
                        values[n] = _new_id()
                    elif n == "createdAt":
                        values[n] = old.createdAt
                    elif n == "updatedAt":
                        values[n] = now
                    elif n == "deletedAt":
                        values[n] = None
                    elif n == "entityId":
                        values[n] = id_maps.get("tickets", {}).get(old.entityId, old.entityId)
                    elif n == "createdById":
                        values[n] = getattr(old, "createdById", None)
                    else:
                        values[n] = getattr(old, n)
                new = Comment(**values)
                db.add(new)
                _track("comments", old.id, new.id)

        # ================================================================
        # COMMIT
        # ================================================================
        transfer = DataTransfer(
            id=uuid.uuid4().hex,
            userId=user["id"],
            direction="to_org",
            orgId=org_id,
            status="completed",
            items=json.dumps({
                "projects": project_ids,
                "spaces": space_ids,
                "notes": note_ids,
                "tickets": ticket_ids,
            }),
            startedAt=now,
            completedAt=now,
        )
        db.add(transfer)
        await db.commit()

        return {
            "ok": True,
            "transferId": transfer.id,
            "moved": {
                "projects": len(project_ids),
                "spaces": len(space_ids),
                "notes": len(note_ids),
                "tickets": len(ticket_ids),
            },
        }

    @staticmethod
    async def transfer_from_org(
        db: AsyncSession,
        user: dict,
        org_id: str,
        project_ids: list[str] | None = None,
        space_ids: list[str] | None = None,
        note_ids: list[str] | None = None,
        ticket_ids: list[str] | None = None,
    ) -> dict:
        # No-op: backend no longer supports moving data from org to personal.
        # Frontend has been updated to hide this option.
        return {"ok": True, "transferId": uuid.uuid4().hex, "moved": {
            "projects": 0, "spaces": 0, "notes": 0, "tickets": 0,
        }}

    @staticmethod
    async def history(db: AsyncSession, user: dict) -> list[dict]:
        rows = (await db.execute(
            select(DataTransfer)
            .where(DataTransfer.userId == user["id"])
            .order_by(DataTransfer.createdAt.desc())
            .limit(50)
        )).scalars().all()
        return [
            {
                "id": t.id,
                "direction": t.direction,
                "orgId": t.orgId,
                "status": t.status,
                "items": json.loads(t.items) if t.items else {},
                "startedAt": t.startedAt.isoformat() if t.startedAt else None,
                "completedAt": t.completedAt.isoformat() if t.completedAt else None,
                "createdAt": t.createdAt.isoformat() if t.createdAt else None,
            }
            for t in rows
        ]
