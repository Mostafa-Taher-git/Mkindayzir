from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.storm_service import StormService

router = APIRouter(prefix="/api/storms", tags=["storms"])

@router.get("/")
async def list_storms(
    workspace: str | None = Query(None),
    includeArchived: bool = Query(False),
    search: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        items = await StormService.list_storms(db, user, workspace=workspace, include_archived=includeArchived, search=search)
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    return {"storms": items}

@router.get("/search")
async def search_storms(
    q: str = Query("", alias="q"),
    workspace: str | None = Query(None),
    limit: int = Query(10, ge=1, le=20),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        items = await StormService.search_storms(db, user, qstr=q, workspace=workspace, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    return {"storms": items}

# links routes before :id to avoid conflict
@router.get("/links")
async def list_links(
    workspace: str | None = Query(None),
    stormIds: str | None = Query(None, description="comma-separated ids"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ids = [s.strip() for s in stormIds.split(",") if s.strip()] if stormIds else None
    try:
        items = await StormService.list_links(db, user, workspace=workspace, storm_ids=ids)
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    return {"links": items}

@router.post("/links", status_code=201)
async def create_link(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        link = await StormService.create_link(db, user, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})
    return {"link": link}

@router.delete("/links/{link_id}")
async def delete_link(link_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await StormService.delete_link(db, user, link_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})

@router.post("/", status_code=201)
async def create_storm(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        storm = await StormService.create_storm(db, user, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})
    return {"storm": storm}

@router.get("/{storm_id}")
async def get_storm(storm_id: str, includeWhiteboard: bool = Query(False), user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        storm = await StormService.get_storm(db, user, storm_id, include_whiteboard=includeWhiteboard)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Storm not found"}})
    return {"storm": storm}

@router.patch("/{storm_id}")
async def update_storm(storm_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        storm = await StormService.update_storm(db, user, storm_id, data)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": msg}})
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": msg}})
    return {"storm": storm}

@router.delete("/{storm_id}")
async def delete_storm(storm_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await StormService.delete_storm(db, user, storm_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Storm not found"}})

@router.get("/{storm_id}/whiteboard")
async def get_whiteboard(storm_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        data = await StormService.get_whiteboard(db, user, storm_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Storm not found"}})
    return {"whiteboard": data}

@router.put("/{storm_id}/whiteboard")
async def save_whiteboard(storm_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        # data is expected to be {elements, appState, files} or wrapped in data
        payload = data.get("whiteboard") or data
        return await StormService.save_whiteboard(db, user, storm_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})
