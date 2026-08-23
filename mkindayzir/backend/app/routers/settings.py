from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/")
async def get_settings(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    profile = await SettingsService.get_profile(db, user)
    return {"data": profile}


@router.patch("/")
async def update_settings(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    profile = await SettingsService.update_profile(db, user, data)
    return {"data": profile}


@router.patch("/ai")
async def update_ai_settings(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await SettingsService.update_ai_settings(db, user, data)
    return {"data": result}
