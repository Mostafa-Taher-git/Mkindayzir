from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.space_service import SpaceService

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


@router.get("/")
async def list_spaces(
    search: str | None = Query(None),
    workspace: str | None = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        items = await SpaceService.list(db, user, workspace=workspace)
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    return {"spaces": items}


@router.post("/", status_code=201)
async def create_space(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    return await SpaceService.create(db, data, user)


@router.get("/{space_id}")
async def get_space(space_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"space": await SpaceService.get(db, space_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Space not found"}})


@router.patch("/{space_id}")
async def update_space(space_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return {"space": await SpaceService.update(db, space_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Space not found"}})


@router.delete("/{space_id}")
async def delete_space(space_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return await SpaceService.delete(db, space_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Space not found"}})


@router.patch("/{space_id}/members")
async def update_space_members(space_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await SpaceService.update_members(db, space_id, data.get("members", []), user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Space not found"}})
