import re
import uuid
from typing import Optional

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization, OrganizationMember
from app.models.user import User


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    s = _SLUG_RE.sub("-", name.lower()).strip("-")
    return s or "team"


def _serialize_org(org: Organization, member_count: int = 0, role: str | None = None) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "type": org.type,
        "ownerId": org.ownerId,
        "avatarUrl": org.avatarUrl,
        "description": org.description,
        "maxMembers": org.maxMembers,
        "settings": org.settings,
        "memberCount": member_count,
        "role": role,
        "createdAt": org.createdAt.isoformat() if org.createdAt else None,
        "updatedAt": org.updatedAt.isoformat() if org.updatedAt else None,
    }


def _member_to_dict(m: OrganizationMember) -> dict:
    return {
        "id": m.id,
        "orgId": m.orgId,
        "userId": m.userId,
        "role": m.role,
        "invitedBy": m.invitedBy,
        "joinedAt": m.joinedAt.isoformat() if m.joinedAt else None,
    }


class OrganizationService:
    @staticmethod
    async def start_organization(
        db: AsyncSession,
        user: dict,
        name: str,
        type_: str,
        slug: Optional[str] = None,
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("name is required")
        if type_ not in ("team", "enterprise"):
            raise ValueError("type must be 'team' or 'enterprise'")

        base_slug = _slugify(slug or name)
        final_slug = base_slug
        i = 1
        while (await db.execute(
            select(Organization).where(Organization.slug == final_slug)
        )).scalar_one_or_none() is not None:
            i += 1
            final_slug = f"{base_slug}-{i}"

        org = Organization(
            id=uuid.uuid4().hex,
            name=name,
            slug=final_slug,
            type=type_,
            ownerId=user["id"],
        )
        db.add(org)
        await db.flush()

        member = OrganizationMember(
            id=uuid.uuid4().hex,
            orgId=org.id,
            userId=user["id"],
            role="admin",
            invitedBy=user["id"],
        )
        db.add(member)
        await db.commit()
        await db.refresh(org)
        return _serialize_org(org, member_count=1, role="admin")

    @staticmethod
    async def get_mine(db: AsyncSession, user: dict) -> dict:
        rows = (await db.execute(
            select(OrganizationMember, Organization)
            .join(Organization, Organization.id == OrganizationMember.orgId)
            .where(OrganizationMember.userId == user["id"])
        )).all()
        orgs = []
        for m, org in rows:
            count = (await db.execute(
                select(func.count(OrganizationMember.id)).where(OrganizationMember.orgId == org.id)
            )).scalar_one() or 0
            orgs.append(_serialize_org(org, member_count=int(count), role=m.role))
        return {"organizations": orgs}

    @staticmethod
    async def get(db: AsyncSession, user: dict, org_id: str) -> dict:
        membership = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if membership is None:
            raise ValueError("not a member")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("not found")
        count = (await db.execute(
            select(func.count(OrganizationMember.id)).where(OrganizationMember.orgId == org.id)
        )).scalar_one() or 0
        return _serialize_org(org, member_count=int(count), role=membership.role)

    @staticmethod
    async def list_members(db: AsyncSession, user: dict, org_id: str) -> list[dict]:
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if m is None:
            raise ValueError("not a member")
        rows = (await db.execute(
            select(OrganizationMember, User)
            .join(User, User.id == OrganizationMember.userId)
            .where(OrganizationMember.orgId == org_id)
            .order_by(OrganizationMember.joinedAt.asc())
        )).all()
        out = []
        for membership, u in rows:
            d = _member_to_dict(membership)
            d["user"] = {
                "id": u.id,
                "displayName": u.displayName,
                "email": u.email,
                "avatar": u.avatar,
            }
            out.append(d)
        return out

    @staticmethod
    async def leave(db: AsyncSession, user: dict, org_id: str) -> dict:
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.userId == user["id"],
                OrganizationMember.orgId == org_id,
            )
        )).scalar_one_or_none()
        if m is None:
            raise ValueError("you are not a member of this organization")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        if org.ownerId == user["id"]:
            raise ValueError("transfer ownership before leaving")
        if m.role == "admin":
            from sqlalchemy import func
            admin_count = (await db.execute(
                select(func.count(OrganizationMember.id)).where(
                    OrganizationMember.orgId == org.id,
                    OrganizationMember.role == "admin",
                )
            )).scalar_one() or 0
            if admin_count <= 1:
                raise ValueError("cannot leave: you are the last admin. promote another admin first.")
        await db.delete(m)
        await db.commit()
        return {"ok": True, "orgId": org.id}

    @staticmethod
    async def transfer_ownership(db: AsyncSession, user: dict, org_id: str, new_owner_id: str) -> dict:
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if m is None:
            raise ValueError("you are not a member of this organization")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        if org.ownerId != user["id"]:
            raise PermissionError("only the current owner can transfer ownership")
        new_owner_m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org.id,
                OrganizationMember.userId == new_owner_id,
            )
        )).scalar_one_or_none()
        if new_owner_m is None:
            raise ValueError("new owner must be a member of the organization")
        if new_owner_m.role != "admin":
            raise ValueError("new owner must already be an admin")
        org.ownerId = new_owner_id
        await db.commit()
        await db.refresh(org)
        count = (await db.execute(
            select(func.count(OrganizationMember.id)).where(OrganizationMember.orgId == org.id)
        )).scalar_one() or 0
        return _serialize_org(org, member_count=int(count), role=new_owner_m.role)

    @staticmethod
    async def remove_member(db: AsyncSession, user: dict, org_id: str, target_user_id: str) -> dict:
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if m is None or m.role != "admin":
            raise PermissionError("not an admin of this organization")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        if target_user_id == org.ownerId:
            raise ValueError("cannot remove the owner. transfer ownership first.")
        target = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == target_user_id,
            )
        )).scalar_one_or_none()
        if target is None:
            raise ValueError("user is not a member")
        await db.delete(target)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def update_member_role(db: AsyncSession, user: dict, org_id: str, target_user_id: str, new_role: str) -> dict:
        if new_role not in ("admin", "manager", "member", "viewer"):
            raise ValueError("invalid role")
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == user["id"],
            )
        )).scalar_one_or_none()
        if m is None or m.role != "admin":
            raise PermissionError("only admins can change roles")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        if target_user_id == org.ownerId:
            raise ValueError("cannot change the owner's role")
        target = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == target_user_id,
            )
        )).scalar_one_or_none()
        if target is None:
            raise ValueError("user is not a member")
        if target.role == "admin" and new_role != "admin":
            from sqlalchemy import func
            admin_count = (await db.execute(
                select(func.count(OrganizationMember.id)).where(
                    OrganizationMember.orgId == org_id,
                    OrganizationMember.role == "admin",
                )
            )).scalar_one() or 0
            if admin_count <= 1:
                raise ValueError("cannot demote the last admin")
        target.role = new_role
        await db.commit()
        return _member_to_dict(target)

    @staticmethod
    async def delete_organization(db: AsyncSession, user: dict, org_id: str) -> dict:
        from app.models.data_transfer import DataTransfer
        from app.models.org_transition import OrgTransition
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        if org.ownerId != user["id"]:
            raise PermissionError("only the owner can delete the organization")
        # Manually cascade child rows because the FKs in production
        # weren't created with ON DELETE CASCADE.
        await db.execute(DataTransfer.__table__.delete().where(DataTransfer.orgId == org_id))
        await db.execute(OrgTransition.__table__.delete().where(OrgTransition.orgId == org_id))
        await db.delete(org)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def transition_type(
        db: AsyncSession,
        admin_user: dict,
        org_id: str,
        new_type: str,
        excluded_member_ids: list[str] | None = None,
    ) -> dict:
        if new_type not in ("team", "enterprise"):
            raise ValueError("new type must be 'team' or 'enterprise'")
        excluded_member_ids = list(excluded_member_ids or [])
        from app.models.org_transition import OrgTransition
        m = (await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.orgId == org_id,
                OrganizationMember.userId == admin_user["id"],
            )
        )).scalar_one_or_none()
        if m is None or m.role != "admin":
            raise PermissionError("only admins can transition organization type")
        org = (await db.execute(
            select(Organization).where(Organization.id == org_id)
        )).scalar_one_or_none()
        if org is None:
            raise ValueError("organization not found")
        if org.type == new_type:
            raise ValueError(f"organization is already of type {new_type}")
        if admin_user["id"] in excluded_member_ids:
            raise ValueError("you cannot exclude yourself from the organization")
        # Remove excluded members (skip the admin)
        if excluded_member_ids:
            await db.execute(
                OrganizationMember.__table__.delete().where(
                    OrganizationMember.orgId == org_id,
                    OrganizationMember.userId.in_(excluded_member_ids),
                    OrganizationMember.userId != admin_user["id"],
                )
            )
        log = OrgTransition(
            id=uuid.uuid4().hex,
            orgId=org_id,
            fromType=org.type,
            toType=new_type,
            initiatedBy=admin_user["id"],
            excludedMembers=__import__("json").dumps(excluded_member_ids),
        )
        db.add(log)
        org.type = new_type
        await db.commit()
        await db.refresh(org)
        return _serialize_org(org)
