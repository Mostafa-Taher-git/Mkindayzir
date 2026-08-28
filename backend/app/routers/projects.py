from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.project_service import ProjectService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/")
async def list_projects(
    status: str | None = Query(None),
    teamId: str | None = Query(None),
    search: str | None = Query(None),
    workspace: str | None = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(10, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = {"status": status, "teamId": teamId, "search": search, "workspace": workspace, "page": page, "perPage": perPage}
    try:
        result = await ProjectService.list(db, params, user)
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    return {"projects": result["items"], "pagination": {"page": result["page"], "limit": result["perPage"], "total": result["total"], "totalPages": result["totalPages"]}}


@router.post("/", status_code=201, response_model=dict)
async def create_project(data: ProjectCreate, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        result = await ProjectService.create(db, data.model_dump(exclude_none=True), user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "DUPLICATE_KEY", "message": str(e)}})
    return {"project": result}


@router.get("/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        project = await ProjectService.get_by_id(db, project_id, user)
        stats = await ProjectService.get_stats(db, project_id)
        return {"project": project, "stats": stats}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Project not found"}})


@router.patch("/{project_id}")
async def update_project(project_id: str, data: ProjectUpdate, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        result = await ProjectService.update(db, project_id, data.model_dump(exclude_none=True), user)
        return {"project": result}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Project not found"}})


@router.delete("/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        result = await ProjectService.delete(db, project_id, user)
        return result
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Project not found"}})
