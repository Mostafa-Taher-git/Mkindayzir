import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_transfer import DataTransfer
from app.models.organization import OrganizationMember
from app.models.project import Project
from app.models.space import Space
from app.models.ticket import Ticket
from app.models.vault_note import VaultNote


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
        if project_ids:
            await db.execute(
                Project.__table__.update().where(
                    Project.id.in_(project_ids),
                    Project.ownerType == "personal",
                    Project.ownerUserId == user["id"],
                ).values(ownerType="org", ownerOrgId=org_id, ownerUserId=None)
            )
        if space_ids:
            await db.execute(
                Space.__table__.update().where(
                    Space.id.in_(space_ids),
                    Space.ownerType == "personal",
                    Space.ownerUserId == user["id"],
                ).values(ownerType="org", ownerOrgId=org_id, ownerUserId=None)
            )
        if note_ids:
            await db.execute(
                VaultNote.__table__.update().where(
                    VaultNote.id.in_(note_ids),
                    VaultNote.ownerType == "personal",
                    VaultNote.ownerUserId == user["id"],
                ).values(ownerType="org", ownerOrgId=org_id, ownerUserId=None)
            )
        if ticket_ids:
            await db.execute(
                Ticket.__table__.update().where(
                    Ticket.id.in_(ticket_ids),
                    Ticket.ownerType == "personal",
                    Ticket.ownerUserId == user["id"],
                ).values(ownerType="org", ownerOrgId=org_id, ownerUserId=None)
            )

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
        await TransferService._require_member(db, user, org_id)
        project_ids = list(project_ids or [])
        space_ids = list(space_ids or [])
        note_ids = list(note_ids or [])
        ticket_ids = list(ticket_ids or [])

        now = _now()
        if project_ids:
            await db.execute(
                Project.__table__.update().where(
                    Project.id.in_(project_ids),
                    Project.ownerType == "org",
                    Project.ownerOrgId == org_id,
                ).values(ownerType="personal", ownerUserId=user["id"], ownerOrgId=None)
            )
        if space_ids:
            await db.execute(
                Space.__table__.update().where(
                    Space.id.in_(space_ids),
                    Space.ownerType == "org",
                    Space.ownerOrgId == org_id,
                ).values(ownerType="personal", ownerUserId=user["id"], ownerOrgId=None)
            )
        if note_ids:
            await db.execute(
                VaultNote.__table__.update().where(
                    VaultNote.id.in_(note_ids),
                    VaultNote.ownerType == "org",
                    VaultNote.ownerOrgId == org_id,
                ).values(ownerType="personal", ownerUserId=user["id"], ownerOrgId=None)
            )
        if ticket_ids:
            await db.execute(
                Ticket.__table__.update().where(
                    Ticket.id.in_(ticket_ids),
                    Ticket.ownerType == "org",
                    Ticket.ownerOrgId == org_id,
                ).values(ownerType="personal", ownerUserId=user["id"], ownerOrgId=None)
            )

        transfer = DataTransfer(
            id=uuid.uuid4().hex,
            userId=user["id"],
            direction="from_org",
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
