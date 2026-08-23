from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.guide_service import GuideService

router = APIRouter(prefix="/api/guides", tags=["guides"])


@router.get("/")
async def list_guides(
    category: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = {"category": category, "status": status, "search": search, "page": page, "perPage": perPage}
    result = await GuideService.list(db, params, user)
    return {
        "guides": result["items"],
        "pagination": {"page": result["page"], "limit": result["perPage"], "total": result["total"], "totalPages": result["totalPages"]},
    }


@router.get("/{guide_id}")
async def get_guide(guide_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await GuideService.get_by_id(db, guide_id)
    except ValueError:
        try:
            return await GuideService.get_by_slug(db, guide_id)
        except ValueError:
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Guide not found"}})
