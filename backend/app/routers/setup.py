from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.auth import SetupRequest, SetupResponse
from app.services.auth_service import AuthService
from app.config import settings

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/")
async def get_setup_status(db: AsyncSession = Depends(get_db)):
    complete = await AuthService.check_setup_complete(db)
    return {"setupComplete": complete}


@router.post("/", status_code=201)
async def complete_setup(req: SetupRequest, db: AsyncSession = Depends(get_db)):
    if req.password != req.confirmPassword:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_ERROR", "message": "Passwords do not match"}})
    try:
        result = await AuthService.complete_setup(db, req.mode, req.email, req.displayName, req.password, req.initialRole)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "ALREADY_SETUP", "message": str(e)}})
