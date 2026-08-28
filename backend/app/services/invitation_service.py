import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization, OrganizationMember
from app.models.invitation import Invitation
from app.models.user import User


INVITE_TTL_DAYS = 7
VALID_ROLES = ("admin", "manager", "member", "viewer")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(inv: Invitation, org: Organization | None = None, inviter: User | None = None) -> dict:
    return {
        "id": inv.id,
        "orgId": inv.orgId,
        "invitedEmail": inv.invitedEmail,
        "invitedBy": inv.invitedBy,
        "role": inv.role,
        "token": inv.token,
        "status": inv.status,
        "expiresAt": inv.expiresAt.isoformat() if inv.expiresAt else None,
        "acceptedAt": inv.acceptedAt.isoformat() if inv.acceptedAt else None,
        "createdAt": inv.createdAt.isoformat() if inv.createdAt else None,
        "org": {
            "id": org.id,
            "name": org.name,
            "type": org.type,
        } if org else None,
        "inviter": {
            "id": inviter.id,
            "displayName": inviter.displayName,
            "email": inviter.email,
        } if inviter else None,
    }


class InvitationService:
    @staticmethod
    async def _require_admin(db: AsyncSession, user: dict, org_id: str) -> Organization:
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if m is None or m.role != "admin":
            raise PermissionError("only admins can manage invitations")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        return org

    @staticmethod
    async def invite(db: AsyncSession, admin_user: dict, org_id: str, email: str, role: str) -> dict:
        email = (email or "").strip().lower()
        if not email:
            raise ValueError("email is required")
        if role not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")

        org = await InvitationService._require_admin(db, admin_user, org_id)

        # Revoke any existing pending invite for this email
        existing = (await db.execute(
            select(Invitation).where(
                Invitation.orgId == org_id,
                Invitation.invitedEmail == email,
                Invitation.status == "pending",
            )
        )).scalars().all()
        for inv in existing:
            inv.status = "revoked"
        if existing:
            await db.flush()

        inv = Invitation(
            id=secrets.token_hex(18),
            orgId=org_id,
            invitedEmail=email,
            invitedBy=admin_user["id"],
            role=role,
            token=secrets.token_urlsafe(32),
            status="pending",
            expiresAt=_now() + timedelta(days=INVITE_TTL_DAYS),
        )
        db.add(inv)
        await db.commit()
        await db.refresh(inv)
        return _serialize(inv, org=org)

    @staticmethod
    async def list_org_invitations(db: AsyncSession, user: dict, org_id: str) -> list[dict]:
        org = await InvitationService._require_admin(db, user, org_id)
        rows = (await db.execute(
            select(Invitation, User)
            .outerjoin(User, User.id == Invitation.invitedBy)
            .where(Invitation.orgId == org_id)
            .order_by(Invitation.createdAt.desc())
        )).all()
        out = []
        for inv, inviter in rows:
            out.append(_serialize(inv, org=org, inviter=inviter))
        return out

    @staticmethod
    async def list_my_pending(db: AsyncSession, user: dict) -> list[dict]:
        user_email = (user.get("email") or "").strip().lower()
        if not user_email:
            return []
        rows = (await db.execute(
            select(Invitation, Organization, User)
            .join(Organization, Organization.id == Invitation.orgId)
            .outerjoin(User, User.id == Invitation.invitedBy)
            .where(
                Invitation.invitedEmail == user_email,
                Invitation.status == "pending",
                Invitation.expiresAt > _now(),
            )
            .order_by(Invitation.createdAt.desc())
        )).all()
        out = []
        for inv, org, inviter in rows:
            # Auto-expire stale ones
            if inv.expiresAt < _now():
                inv.status = "expired"
                continue
            out.append(_serialize(inv, org=org, inviter=inviter))
        await db.commit()
        return out

    @staticmethod
    async def accept(db: AsyncSession, user: dict, token: str) -> dict:
        inv = (await db.execute(
            select(Invitation).where(Invitation.token == token)
        )).scalar_one_or_none()
        if inv is None:
            raise ValueError("invitation not found")
        if inv.status != "pending":
            raise ValueError(f"invitation is {inv.status}")
        if inv.expiresAt < _now():
            inv.status = "expired"
            await db.commit()
            raise ValueError("invitation expired")

        user_email = (user.get("email") or "").strip().lower()
        if inv.invitedEmail.lower() != user_email:
            raise PermissionError("this invitation is for a different email")

        # Check user isn't already in an org
        existing = (await db.execute(
            select(OrganizationMember).where(OrganizationMember.userId == user["id"])
        )).scalar_one_or_none()
        if existing is not None:
            raise ValueError("you must leave your current organization first")

        inv.status = "accepted"
        inv.acceptedAt = _now()
        m = OrganizationMember(
            orgId=inv.orgId,
            userId=user["id"],
            role=inv.role,
            invitedBy=inv.invitedBy,
        )
        db.add(m)
        await db.commit()
        return {"invitation": _serialize(inv), "orgId": inv.orgId}

    @staticmethod
    async def decline(db: AsyncSession, user: dict, token: str) -> dict:
        inv = (await db.execute(
            select(Invitation).where(Invitation.token == token)
        )).scalar_one_or_none()
        if inv is None:
            raise ValueError("invitation not found")
        user_email = (user.get("email") or "").strip().lower()
        if inv.invitedEmail.lower() != user_email:
            raise PermissionError("this invitation is for a different email")
        if inv.status != "pending":
            raise ValueError(f"invitation is {inv.status}")
        inv.status = "declined"
        await db.commit()
        return _serialize(inv)

    @staticmethod
    async def revoke(db: AsyncSession, admin_user: dict, invitation_id: str) -> dict:
        inv = (await db.execute(
            select(Invitation).where(Invitation.id == invitation_id)
        )).scalar_one_or_none()
        if inv is None:
            raise ValueError("invitation not found")
        await InvitationService._require_admin(db, admin_user, inv.orgId)
        if inv.status != "pending":
            raise ValueError(f"invitation is {inv.status}")
        inv.status = "revoked"
        await db.commit()
        return _serialize(inv)
