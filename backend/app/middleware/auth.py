from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User, Session as DBSession
from app.config import settings

security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    token = None
    if credentials:
        token = credentials.credentials
    else:
        cookie = request.cookies.get("mkindayzir_session")
        if cookie:
            token = cookie

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(
        select(DBSession).where(
            DBSession.token == token,
            DBSession.expiresAt > __import__("datetime").datetime.utcnow(),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    result = await db.execute(select(User).where(User.id == session.userId, User.status == "ACTIVE"))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return {
        "id": user.id,
        "email": user.email,
        "displayName": user.displayName,
        "role": user.role,
        "status": user.status,
        "avatar": user.avatar,
        "timezone": user.timezone,
        "aiProvider": user.aiProvider,
        "aiModel": user.aiModel,
    }


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_current_user(request, credentials, db)
    except HTTPException:
        return None
