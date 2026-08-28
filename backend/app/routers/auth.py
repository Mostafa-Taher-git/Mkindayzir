import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.audit_log import AuditLog
from app.models.organization import OrganizationMember
from app.models.user import User
from app.schemas.auth import ChangeRoleRequest


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/session", response_model=dict)
async def session(user: dict = Depends(get_current_user)):
    """Return the Clerk-authenticated local application user."""
    return {"data": user}


@router.patch("/role")
async def change_own_role(
    req: ChangeRoleRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    membership = await db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.userId == user["id"],
            OrganizationMember.role == "admin",
        )
    )
    if membership is None:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only organization admins can change their account role"}})
    if req.confirmation != "DEMOTE":
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_CONFIRMATION", "message": "Confirmation text 'DEMOTE' is required"}})
    if req.newRole not in ["ADMIN", "MANAGER", "MEMBER", "VIEWER"]:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ROLE", "message": "Invalid role specified"}})
    if user.get("role") == "ADMIN" and req.newRole != "ADMIN":
        admin_count = await db.scalar(
            select(func.count()).select_from(User).where(
                User.role == "ADMIN",
                User.status == "ACTIVE",
                User.id != user["id"],
                User.deletedAt.is_(None),
            )
        )
        if (admin_count or 0) == 0:
            raise HTTPException(status_code=400, detail={"error": {"code": "LAST_ADMIN", "message": "Cannot demote: you are the last admin"}})
    await db.execute(
        update(User).where(User.id == user["id"]).values(
            role=req.newRole, updatedAt=datetime.now(timezone.utc)
        )
    )
    db.add(AuditLog(
        id=uuid.uuid4().hex,
        userId=user["id"],
        action="USER_DEMOTION",
        resource="User",
        resourceId=user["id"],
        details=f"User changed role from {user.get('role')} to {req.newRole}",
    ))
    await db.commit()
    return {"data": {"role": req.newRole}}
