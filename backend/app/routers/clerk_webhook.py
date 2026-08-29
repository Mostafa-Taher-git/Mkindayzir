import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User


router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _verify_svix_signature(request: Request, body: bytes) -> None:
    """Verify Clerk's Svix signature whenever a signing secret is configured."""
    secret = settings.CLERK_WEBHOOK_SIGNING_SECRET
    if not secret:
        if settings.ENV == "production":
            raise HTTPException(status_code=503, detail="Clerk webhook verification is not configured")
        return
    message_id = request.headers.get("svix-id")
    timestamp = request.headers.get("svix-timestamp")
    signatures = request.headers.get("svix-signature", "")
    if not message_id or not timestamp or not signatures:
        raise HTTPException(status_code=401, detail="Missing Clerk webhook signature")
    try:
        if abs(time.time() - int(timestamp)) > 300:
            raise ValueError("expired timestamp")
        key = base64.b64decode(secret.removeprefix("whsec_"))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Clerk webhook timestamp") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Invalid Clerk webhook signing secret") from exc
    signed = f"{message_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    supplied = [part.strip().removeprefix("v1,") for part in signatures.split(" ") if part.strip().startswith("v1,")]
    if not any(hmac.compare_digest(expected, signature) for signature in supplied):
        raise HTTPException(status_code=401, detail="Invalid Clerk webhook signature")


def _get_primary_email(data: dict) -> str:
    primary_id = data.get("primary_email_address_id")
    for address in data.get("email_addresses", []):
        if address.get("id") == primary_id:
            return address.get("email_address", "")
    addresses = data.get("email_addresses", [])
    if addresses:
        return addresses[0].get("email_address", "")
    return f"{data.get('id', 'unknown')}@clerk.local"


def _profile(data: dict) -> tuple[str, str, str, str | None]:
    clerk_id = data.get("id", "")
    email = _get_primary_email(data)
    display_name = f"{data.get('first_name') or ''} {data.get('last_name') or ''}".strip()
    return clerk_id, email, display_name or email.split("@", 1)[0], data.get("image_url")


async def _handle_user_created(db: AsyncSession, data: dict) -> None:
    clerk_id, email, display_name, avatar = _profile(data)
    if not clerk_id or await db.scalar(select(User.id).where(User.clerkId == clerk_id)):
        return
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        existing.clerkId = clerk_id
        if display_name:
            existing.displayName = display_name
        if avatar:
            existing.avatar = avatar
        await db.commit()
        return
    db.add(User(
        id=uuid.uuid4().hex,
        clerkId=clerk_id,
        email=email,
        passwordHash="CLERK_MANAGED",
        displayName=display_name,
        avatar=avatar,
        role="MEMBER",
        status="ACTIVE",
    ))
    await db.commit()


async def _handle_user_updated(db: AsyncSession, data: dict) -> None:
    clerk_id, email, display_name, avatar = _profile(data)
    if not clerk_id:
        return
    await db.execute(update(User).where(User.clerkId == clerk_id).values(
        email=email, displayName=display_name, avatar=avatar,
    ))
    await db.commit()


async def _handle_user_deleted(db: AsyncSession, data: dict) -> None:
    clerk_id = data.get("id")
    if not clerk_id:
        return
    await db.execute(update(User).where(User.clerkId == clerk_id).values(
        status="INACTIVE", deletedAt=datetime.now(timezone.utc),
    ))
    await db.commit()


@router.post("/clerk")
async def clerk_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    _verify_svix_signature(request, body)
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid Clerk webhook payload") from exc
    event_type = payload.get("type")
    data = payload.get("data") or {}
    if event_type == "user.created":
        await _handle_user_created(db, data)
    elif event_type == "user.updated":
        await _handle_user_updated(db, data)
    elif event_type == "user.deleted":
        await _handle_user_deleted(db, data)
    return {"received": True}
