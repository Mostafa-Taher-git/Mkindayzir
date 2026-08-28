import uuid
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User


security = HTTPBearer(auto_error=False)


def verify_clerk_jwt(token: str) -> dict:
    """Verify a Clerk-issued RS256 JWT and return its claims."""
    public_key = settings.CLERK_JWT_PUBLIC_KEY.strip()
    if not public_key:
        raise HTTPException(status_code=503, detail="Clerk JWT verification is not configured")
    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False, "verify_iss": True},
            issuer=settings.CLERK_FRONTEND_API,
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid Clerk token") from exc


async def _any_user_exists(db: AsyncSession) -> bool:
    count = await db.scalar(select(func.count()).select_from(User))
    return (count or 0) > 0


def _claim_email(claims: dict, clerk_id: str) -> str:
    return str(claims.get("email") or claims.get("email_address") or f"{clerk_id}@clerk.local")


async def get_or_create_clerk_user(db: AsyncSession, claims: dict) -> User:
    """Synchronize a local application user from a verified Clerk identity."""
    clerk_id = claims.get("sub")
    if not clerk_id:
        raise HTTPException(status_code=401, detail="Clerk token has no subject")

    user = await db.scalar(
        select(User).where(User.clerkId == clerk_id, User.status == "ACTIVE")
    )
    if user:
        user.lastActiveAt = datetime.now(timezone.utc)
        await db.commit()
        return user

    email = _claim_email(claims, clerk_id)
    first_name = str(claims.get("first_name") or "")
    last_name = str(claims.get("last_name") or "")
    display_name = f"{first_name} {last_name}".strip() or email.split("@", 1)[0]
    user = User(
        id=uuid.uuid4().hex,
        clerkId=clerk_id,
        email=email,
        passwordHash="CLERK_MANAGED",
        displayName=display_name,
        avatar=claims.get("image_url"),
        role="ADMIN" if not await _any_user_exists(db) else "MEMBER",
        status="ACTIVE",
        lastActiveAt=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Unable to synchronize Clerk user") from exc
    await db.refresh(user)
    return user


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "clerkId": user.clerkId,
        "email": user.email,
        "displayName": user.displayName,
        "role": user.role,
        "status": user.status,
        "avatar": user.avatar,
        "timezone": user.timezone,
        "aiProvider": user.aiProvider,
        "aiModel": user.aiModel,
    }


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    token = credentials.credentials if credentials else request.cookies.get("__session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return serialize_user(await get_or_create_clerk_user(db, verify_clerk_jwt(token)))


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_current_user(request, credentials, db)
    except HTTPException:
        return None
