import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.activity import Activity


class ActivityService:
    @staticmethod
    async def log_activity(db: AsyncSession, entity_type: str, entity_id: str, user: dict, action: str, changes: dict | None = None) -> dict:
        activity = Activity(
            id=uuid.uuid4().hex,
            userId=user["id"],
            entityType=entity_type,
            entityId=entity_id,
            action=action,
            changes=changes or {},
        )
        db.add(activity)
        await db.commit()
        await db.refresh(activity)
        return {
            "id": activity.id,
            "userId": activity.userId,
            "entityType": activity.entityType,
            "entityId": activity.entityId,
            "action": activity.action,
            "changes": activity.changes,
            "createdAt": activity.createdAt.isoformat() if activity.createdAt else None,
        }
