import uuid
import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from app.models.user import User
from app.models.session import Session as DBSession
from app.utils.helpers import generate_secure_token
from app.utils.encryption import get_encryption_key
from app.config import settings
from datetime import datetime, timezone, timedelta


class AuthService:
    @staticmethod
    def _serialize_user(user: User) -> dict:
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

    @staticmethod
    async def login_user(db: AsyncSession, email: str, password: str) -> dict:
        result = await db.execute(select(User).where(User.email == email.lower(), User.status == "ACTIVE"))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("Invalid email or password")

        if not bcrypt.checkpw(password.encode("utf-8"), user.passwordHash.encode("utf-8")):
            raise ValueError("Invalid email or password")

        token = generate_secure_token()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.SESSION_MAX_AGE)
        db.add(DBSession(userId=user.id, token=token, expiresAt=expires_at))
        await db.commit()
        return {"user": AuthService._serialize_user(user), "token": token}

    @staticmethod
    async def register_user(db: AsyncSession, email: str, display_name: str, password: str) -> dict:
        existing = await db.execute(select(User).where(User.email == email.lower()))
        if existing.scalar_one_or_none():
            raise ValueError("Email already registered")

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode("utf-8")
        user = User(
            id=uuid.uuid4().hex,
            email=email.lower(),
            passwordHash=password_hash,
            displayName=display_name,
            role="MEMBER",
            status="ACTIVE",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return {"user": AuthService._serialize_user(user)}

    @staticmethod
    async def check_setup_complete(db: AsyncSession) -> bool:
        # Setup is complete once ANY account exists — not "once an ADMIN
        # exists". The original ADMIN-only check left the setup wizard open
        # whenever the first user chose a non-admin role in team mode,
        # letting a later visitor register themselves as ADMIN.
        result = await db.execute(select(User.id).limit(1))
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def complete_setup(db: AsyncSession, mode: str, email: str, display_name: str, password: str, initial_role: str | None = None) -> dict:
        # Same any-account semantics as check_setup_complete (see above).
        existing = await db.execute(select(User.id).limit(1))
        if existing.scalar_one_or_none() is not None:
            raise ValueError("Setup has already been completed")

        # Server-side role validation (never trust the client): personal mode
        # is always ADMIN; team/enterprise may pick any of the valid roles.
        VALID_ROLES = {"ADMIN", "MANAGER", "AGENT", "MEMBER", "VIEWER"}
        if mode == "personal":
            role = "ADMIN"
        else:
            role = initial_role if initial_role in VALID_ROLES else "ADMIN"

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode("utf-8")
        user = User(
            id=uuid.uuid4().hex,
            email=email.lower(),
            passwordHash=password_hash,
            displayName=display_name,
            role=role,
            status="ACTIVE",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        auto_logged_in = False
        if mode == "personal" and settings.AUTO_LOGIN:
            token = generate_secure_token()
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.SESSION_MAX_AGE)
            db.add(DBSession(userId=user.id, token=token, expiresAt=expires_at))
            await db.commit()
            auto_logged_in = True

        return {"user": AuthService._serialize_user(user), "autoLoggedIn": auto_logged_in}

    @staticmethod
    async def create_session(db: AsyncSession, user_id: str) -> str:
        token = generate_secure_token()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.SESSION_MAX_AGE)
        db.add(DBSession(userId=user_id, token=token, expiresAt=expires_at))
        await db.commit()
        return token
