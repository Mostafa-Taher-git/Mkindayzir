from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.label_service import LabelService

router = APIRouter(prefix="/api/projects/{project_id}/labels", tags=["labels"])


@router.get("/")
async def list_labels(project_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await LabelService.list(db, project_id, user)


@router.post("/", status_code=201)
async def create_label(project_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    data["projectId"] = project_id
    return await LabelService.create(db, data, user)
