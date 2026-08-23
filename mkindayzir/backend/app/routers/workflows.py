from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/workflows", tags=["workflows"])


@router.get("/")
async def list_workflows(project_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.workflow import Workflow
    from sqlalchemy import select
    result = await db.execute(select(Workflow).where(Workflow.projectId == project_id))
    items = result.scalars().all()
    return [{
        "id": w.id,
        "projectId": w.projectId,
        "name": w.name,
        "statuses": w.statuses,
        "transitions": w.transitions,
        "isDefault": w.isDefault,
    } for w in items]


@router.post("/", status_code=201)
async def create_workflow(project_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import uuid
    from app.models.workflow import Workflow
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    workflow = Workflow(
        id=uuid.uuid4().hex,
        projectId=project_id,
        name=data.get("name", ""),
        statuses=data.get("statuses", "[]"),
        transitions=data.get("transitions", "[]"),
        isDefault=data.get("isDefault", False),
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return {
        "id": workflow.id,
        "projectId": workflow.projectId,
        "name": workflow.name,
        "statuses": workflow.statuses,
        "transitions": workflow.transitions,
        "isDefault": workflow.isDefault,
    }
