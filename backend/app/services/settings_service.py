from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.utils.encryption import get_encryption_key, encrypt


class SettingsService:
    @staticmethod
    def _serialize_profile(user: User) -> dict:
        return {
            "id": user.id,
            "displayName": user.displayName,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "avatar": user.avatar,
            "timezone": user.timezone,
            "locale": user.locale,
        }

    @staticmethod
    async def get_profile(db: AsyncSession, user: dict) -> dict:
        result = await db.execute(select(User).where(User.id == user["id"]))
        u = result.scalar_one_or_none()
        if not u:
            raise ValueError("User not found")
        return SettingsService._serialize_profile(u)

    @staticmethod
    async def update_profile(db: AsyncSession, user: dict, data: dict) -> dict:
        result = await db.execute(select(User).where(User.id == user["id"]))
        u = result.scalar_one_or_none()
        if not u:
            raise ValueError("User not found")

        if data.get("displayName") is not None:
            u.displayName = data["displayName"]
        if data.get("email") is not None:
            u.email = data["email"]

        await db.commit()
        await db.refresh(u)
        return SettingsService._serialize_profile(u)

    @staticmethod
    async def update_ai_settings(db: AsyncSession, user: dict, data: dict) -> dict:
        result = await db.execute(select(User).where(User.id == user["id"]))
        u = result.scalar_one_or_none()
        if not u:
            raise ValueError("User not found")

        if data.get("aiProvider") is not None:
            u.aiProvider = data["aiProvider"]
        if data.get("aiModel") is not None:
            u.aiModel = data["aiModel"]
        if data.get("aiApiKey") is not None:
            key = get_encryption_key()
            u.aiApiKey = encrypt(data["aiApiKey"], key)
        if data.get("aiBaseUrl") is not None:
            pass

        await db.commit()
        await db.refresh(u)
        return {
            "id": u.id,
            "aiProvider": u.aiProvider,
            "aiModel": u.aiModel,
        }
