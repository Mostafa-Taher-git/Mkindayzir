"""User directory endpoints for assignment pickers.

Exposes only safe, non-identifying fields (no emails) to any authenticated
user, because every member/assignee picker in the console needs the roster.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
async def list_users(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active accounts in display-name order for assignment pickers."""
    result = await db.execute(
        select(User).where(User.status == "ACTIVE").order_by(User.displayName)
    )
    users = result.scalars().all()
    return {
        "users": [
            {
                "id": u.id,
                "displayName": u.displayName,
                "avatar": u.avatar,
                "role": u.role,
            }
            for u in users
        ]
    }
