from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/projects/{project_id}/iterations", tags=["iterations"])


@router.get("/")
async def list_iterations(project_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.iteration import Iteration
    from sqlalchemy import select
    result = await db.execute(select(Iteration).where(Iteration.projectId == project_id, Iteration.deletedAt.is_(None)))
    items = result.scalars().all()
    return [{
        "id": i.id,
        "projectId": i.projectId,
        "name": i.name,
        "goal": i.goal,
        "status": i.status,
        "startDate": i.startDate.isoformat() if i.startDate else None,
        "endDate": i.endDate.isoformat() if i.endDate else None,
        "createdAt": i.createdAt.isoformat() if i.createdAt else None,
        "updatedAt": i.updatedAt.isoformat() if i.updatedAt else None,
    } for i in items]


@router.post("/", status_code=201)
async def create_iteration(project_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import uuid
    from app.models.iteration import Iteration
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    iteration = Iteration(
        id=uuid.uuid4().hex,
        projectId=project_id,
        name=data.get("name", ""),
        goal=data.get("goal"),
        status=data.get("status", "PLANNING"),
        startDate=data.get("startDate"),
        endDate=data.get("endDate"),
    )
    db.add(iteration)
    await db.commit()
    await db.refresh(iteration)
    return {
        "id": iteration.id,
        "projectId": iteration.projectId,
        "name": iteration.name,
        "goal": iteration.goal,
        "status": iteration.status,
        "startDate": iteration.startDate.isoformat() if iteration.startDate else None,
        "endDate": iteration.endDate.isoformat() if iteration.endDate else None,
    }


@router.get("/{iteration_id}")
async def get_iteration(iteration_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.iteration import Iteration
    from sqlalchemy import select
    result = await db.execute(select(Iteration).where(Iteration.id == iteration_id, Iteration.deletedAt.is_(None)))
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Iteration not found"}})
    return {
        "id": iteration.id,
        "projectId": iteration.projectId,
        "name": iteration.name,
        "goal": iteration.goal,
        "status": iteration.status,
        "startDate": iteration.startDate.isoformat() if iteration.startDate else None,
        "endDate": iteration.endDate.isoformat() if iteration.endDate else None,
    }


@router.patch("/{iteration_id}")
async def update_iteration(iteration_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.iteration import Iteration
    from sqlalchemy import select
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    result = await db.execute(select(Iteration).where(Iteration.id == iteration_id, Iteration.deletedAt.is_(None)))
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Iteration not found"}})
    for field in ["name", "goal", "status", "startDate", "endDate"]:
        if field in data and data[field] is not None:
            setattr(iteration, field, data[field])
    await db.commit()
    await db.refresh(iteration)
    return {
        "id": iteration.id,
        "projectId": iteration.projectId,
        "name": iteration.name,
        "goal": iteration.goal,
        "status": iteration.status,
        "startDate": iteration.startDate.isoformat() if iteration.startDate else None,
        "endDate": iteration.endDate.isoformat() if iteration.endDate else None,
    }


@router.delete("/{iteration_id}")
async def delete_iteration(iteration_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.iteration import Iteration
    from sqlalchemy import select
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:projects"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    result = await db.execute(select(Iteration).where(Iteration.id == iteration_id, Iteration.deletedAt.is_(None)))
    iteration = result.scalar_one_or_none()
    if not iteration:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Iteration not found"}})
    iteration.deletedAt = __import__("datetime").datetime.utcnow()
    await db.commit()
    return {"ok": True}
