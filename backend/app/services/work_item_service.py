import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from app.models.work_item import WorkItem
from app.models.project import Project
from app.models.user import User


class WorkItemService:
    @staticmethod
    def _serialize(item: WorkItem) -> dict:
        return {
            "id": item.id,
            "projectId": item.projectId,
            "number": item.number,
            "type": item.type,
            "title": item.title,
            "description": item.description,
            "status": item.status,
            "priority": item.priority,
            "assigneeId": item.assigneeId,
            "reporterId": item.reporterId,
            "initiativeId": item.initiativeId,
            "iterationId": item.iterationId,
            "parentId": item.parentId,
            "storyPoints": item.storyPoints,
            "dueDate": item.dueDate.isoformat() if item.dueDate else None,
            "resolvedAt": item.resolvedAt.isoformat() if item.resolvedAt else None,
            "metadata": item.meta,
            "position": item.position,
            "createdAt": item.createdAt.isoformat() if item.createdAt else None,
            "updatedAt": item.updatedAt.isoformat() if item.updatedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, project_id: str, params: dict, user: dict) -> dict:
        query = select(WorkItem).where(WorkItem.projectId == project_id, WorkItem.deletedAt.is_(None))
        if params.get("status"):
            query = query.where(WorkItem.status == params["status"])
        if params.get("search"):
            search = f"%{params['search']}%"
            query = query.where(or_(WorkItem.title.ilike(search), WorkItem.description.ilike(search)))
        if params.get("assigneeId"):
            query = query.where(WorkItem.assigneeId == params["assigneeId"])
        if params.get("type"):
            query = query.where(WorkItem.type == params["type"])
        if params.get("priority"):
            query = query.where(WorkItem.priority == params["priority"])

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        page = params.get("page", 1)
        per_page = params.get("perPage", 10)
        offset = (page - 1) * per_page

        query = query.offset(offset).limit(per_page).order_by(WorkItem.position.asc(), WorkItem.createdAt.desc())
        result = await db.execute(query)
        items = result.scalars().all()

        return {
            "items": [WorkItemService._serialize(item) for item in items],
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page),
        }

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        project_id = data["projectId"]
        result = await db.execute(
            select(func.coalesce(func.max(WorkItem.number), 0)).where(WorkItem.projectId == project_id, WorkItem.deletedAt.is_(None))
        )
        next_number = result.scalar_one() + 1

        item = WorkItem(
            id=uuid.uuid4().hex,
            projectId=project_id,
            number=next_number,
            type=data["type"],
            title=data["title"],
            description=data.get("description"),
            status="todo",
            priority=data.get("priority", "MEDIUM"),
            assigneeId=data.get("assigneeId"),
            reporterId=user["id"],
            initiativeId=data.get("initiativeId"),
            iterationId=data.get("iterationId"),
            parentId=data.get("parentId"),
            storyPoints=data.get("storyPoints"),
            dueDate=data.get("dueDate"),
            meta=str(data.get("metadata") or {}),
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return WorkItemService._serialize(item)

    @staticmethod
    async def get(db: AsyncSession, item_id: str, user: dict) -> dict:
        result = await db.execute(select(WorkItem).where(WorkItem.id == item_id, WorkItem.deletedAt.is_(None)))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Work item not found")
        return WorkItemService._serialize(item)

    @staticmethod
    async def update(db: AsyncSession, item_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(WorkItem).where(WorkItem.id == item_id, WorkItem.deletedAt.is_(None)))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Work item not found")

        for field in ["title", "description", "status", "priority", "assigneeId", "initiativeId", "iterationId", "parentId", "storyPoints", "dueDate"]:
            if field in data and data[field] is not None:
                setattr(item, field, data[field])
        if "metadata" in data and data["metadata"] is not None:
            item.meta = str(data["metadata"])

        await db.commit()
        await db.refresh(item)
        return WorkItemService._serialize(item)

    @staticmethod
    async def delete(db: AsyncSession, item_id: str, user: dict) -> dict:
        result = await db.execute(select(WorkItem).where(WorkItem.id == item_id, WorkItem.deletedAt.is_(None)))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Work item not found")
        item.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def transition(db: AsyncSession, item_id: str, new_status: str, user: dict) -> dict:
        result = await db.execute(select(WorkItem).where(WorkItem.id == item_id, WorkItem.deletedAt.is_(None)))
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("Work item not found")
        item.status = new_status
        if new_status == "done":
            item.resolvedAt = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(item)
        return WorkItemService._serialize(item)
