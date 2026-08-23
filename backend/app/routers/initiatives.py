from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/initiatives", tags=["initiatives"])


@router.get("/")
async def list_initiatives(project_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.initiative import Initiative
    from sqlalchemy import select
    result = await db.execute(select(Initiative).where(Initiative.projectId == project_id, Initiative.deletedAt.is_(None)))
    items = result.scalars().all()
    return [{
        "id": i.id,
        "projectId": i.projectId,
        "name": i.name,
        "description": i.description,
        "status": i.status,
        "progress": i.progress,
        "startDate": i.startDate.isoformat() if i.startDate else None,
        "targetDate": i.targetDate.isoformat() if i.targetDate else None,
    } for i in items]


@router.post("/", status_code=201)
async def create_initiative(project_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import uuid
    from app.models.initiative import Initiative
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    initiative = Initiative(
        id=uuid.uuid4().hex,
        projectId=project_id,
        name=data.get("name", ""),
        description=data.get("description"),
        status=data.get("status", "OPEN"),
        progress=data.get("progress", 0),
        startDate=data.get("startDate"),
        targetDate=data.get("targetDate"),
    )
    db.add(initiative)
    await db.commit()
    await db.refresh(initiative)
    return {
        "id": initiative.id,
        "projectId": initiative.projectId,
        "name": initiative.name,
        "description": initiative.description,
        "status": initiative.status,
        "progress": initiative.progress,
    }
