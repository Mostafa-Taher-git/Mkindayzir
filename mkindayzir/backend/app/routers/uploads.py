from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("/")
async def upload_file(user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail={"error": {"code": "NOT_IMPLEMENTED", "message": "Upload endpoint not yet implemented"}})


@router.get("/{path:path}")
async def serve_upload(path: str, user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail={"error": {"code": "NOT_IMPLEMENTED", "message": "Serve file not yet implemented"}})


@router.delete("/{path:path}")
async def delete_upload(path: str, user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail={"error": {"code": "NOT_IMPLEMENTED", "message": "Delete file not yet implemented"}})
