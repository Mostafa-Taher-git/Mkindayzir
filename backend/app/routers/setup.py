from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User


router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/")
async def get_setup_status(db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(User))
    return {"setupComplete": (count or 0) > 0}
