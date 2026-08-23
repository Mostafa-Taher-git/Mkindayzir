from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.work_item import WorkItemCreate, WorkItemUpdate, WorkItemResponse
from app.services.work_item_service import WorkItemService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/work-items", tags=["work_items"])


@router.get("/")
async def list_work_items(
    project_id: str,
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(10, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = {"status": status, "search": search, "page": page, "perPage": perPage}
    result = await WorkItemService.list(db, project_id, params, user)
    return result


@router.post("/", status_code=201)
async def create_work_item(data: WorkItemCreate, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "create:work_items"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    result = await WorkItemService.create(db, data.model_dump(exclude_none=True), user)
    return result


@router.get("/{item_id}")
async def get_work_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await WorkItemService.get(db, item_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Work item not found"}})


@router.patch("/{item_id}")
async def update_work_item(item_id: str, data: WorkItemUpdate, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "edit:work_items"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return await WorkItemService.update(db, item_id, data.model_dump(exclude_none=True), user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Work item not found"}})


@router.delete("/{item_id}")
async def delete_work_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "delete:work_items"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return await WorkItemService.delete(db, item_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Work item not found"}})
