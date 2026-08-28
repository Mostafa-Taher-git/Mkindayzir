from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization, OrganizationMember


async def resolve_workspace(
    db: AsyncSession,
    user: dict,
    workspace: Optional[str],
) -> dict:
    """Resolve the `?workspace=` query param into a SQL filter spec.

    Returns a dict with:
      - "where": list of SQLAlchemy column expressions to AND into the query
      - "orgId": the resolved orgId (or None)
      - "ownerType": "personal" or "org" (or None if rejected)
      - "ownerUserId": the resolved user id (or None)

    Raises ValueError on a permission failure (membership check) or
    on a missing org.
    """
    if not workspace or workspace == "personal":
        return {
            "where": [],  # caller will apply its own personal filter
            "orgId": None,
            "ownerType": "personal",
            "ownerUserId": user["id"],
        }
    # Org context: verify membership
    m = (await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.orgId == workspace,
            OrganizationMember.userId == user["id"],
        )
    )).scalar_one_or_none()
    if m is None:
        raise ValueError("not a member of this organization")
    return {
        "where": [],
        "orgId": workspace,
        "ownerType": "org",
        "ownerUserId": None,
        "role": m.role,
    }


async def stamp_owner(
    model_obj,
    owner_type: str,
    owner_user_id: Optional[str],
    owner_org_id: Optional[str],
) -> None:
    """Set the three owner columns on a model instance before commit."""
    model_obj.ownerType = owner_type
    model_obj.ownerUserId = owner_user_id
    model_obj.ownerOrgId = owner_org_id


def personal_owner_filter(model_cls, user_id: str):
    """Return SQLAlchemy where clause for the user's own personal data."""
    from sqlalchemy import and_
    return and_(
        model_cls.ownerType == "personal",
        model_cls.ownerUserId == user_id,
    )


def org_owner_filter(model_cls, org_id: str):
    """Return SQLAlchemy where clause for an org's data."""
    from sqlalchemy import and_
    return and_(
        model_cls.ownerType == "org",
        model_cls.ownerOrgId == org_id,
    )
