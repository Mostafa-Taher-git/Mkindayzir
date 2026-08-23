import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, ChangeRoleRequest
from app.services.auth_service import AuthService
from app.middleware.auth import get_current_user
from app.config import settings
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await AuthService.login_user(db, req.email, req.password)
        resp = JSONResponse({"data": result["user"]})
        resp.set_cookie(
            "mkindayzir_session",
            result["token"],
            httponly=True,
            secure=settings.ENV == "production",
            max_age=settings.SESSION_MAX_AGE,
            samesite="lax",
        )
        return resp
    except ValueError as e:
        raise HTTPException(status_code=401, detail={"error": {"code": "INVALID_CREDENTIALS", "message": str(e)}})


@router.get("/session", response_model=dict)
async def session(user: dict = Depends(get_current_user)):
    return {"data": user}


@router.delete("/session")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("mkindayzir_session")
    if token:
        from app.models.session import Session as DBSession
        from sqlalchemy import delete
        await db.execute(delete(DBSession).where(DBSession.token == token))
        await db.commit()
    resp = JSONResponse({"data": True})
    resp.delete_cookie("mkindayzir_session")
    return resp


@router.get("/auto-login")
async def auto_login(db: AsyncSession = Depends(get_db)):
    if not settings.AUTO_LOGIN:
        raise HTTPException(status_code=302, detail="Not in personal mode")
    complete = await AuthService.check_setup_complete(db)
    if not complete:
        raise HTTPException(status_code=302, detail="Setup not complete")
    from app.models.user import User
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.role == "ADMIN", User.status == "ACTIVE"))
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=302, detail="No admin user")
    token = await AuthService.create_session(db, admin.id)
    resp = JSONResponse({"user": AuthService._serialize_user(admin)})
    resp.set_cookie(
        "mkindayzir_session",
        token,
        httponly=True,
        secure=settings.ENV == "production",
        max_age=settings.SESSION_MAX_AGE,
        samesite="lax",
    )
    return resp


@router.post("/register", status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if not settings.REGISTRATION_ENABLED:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Registration is disabled"}})
    result = await AuthService.register_user(db, req.email, req.displayName, req.password)
    return {"user": {
        "id": result["user"]["id"],
        "email": result["user"]["email"],
        "displayName": result["user"]["displayName"],
        "role": result["user"]["role"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }}


@router.patch("/role")
async def change_own_role(
    req: ChangeRoleRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if settings.MKINDAYZIR_MODE == "personal":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Cannot change role in personal mode"}})

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
                User.deletedAt.is_(None)
            )
        )
        if (admin_count or 0) == 0:
            raise HTTPException(status_code=400, detail={"error": {"code": "LAST_ADMIN", "message": "Cannot demote: you are the last admin"}})

    await db.execute(
        update(User)
        .where(User.id == user["id"])
        .values(role=req.newRole, updatedAt=datetime.now(timezone.utc))
    )

    audit = AuditLog(
        id=uuid.uuid4().hex,
        userId=user["id"],
        action="USER_DEMOTION",
        resource="User",
        resourceId=user["id"],
        details=f"User changed role from {user.get('role')} to {req.newRole}",
    )
    db.add(audit)
    await db.commit()

    return {"data": {"role": req.newRole}}
