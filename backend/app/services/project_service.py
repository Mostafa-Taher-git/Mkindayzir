import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from app.models.project import Project
from app.models.work_item import WorkItem
from app.models.user import User
from app.services.workspace_filter import (
    resolve_workspace, stamp_owner,
    personal_owner_filter, org_owner_filter,
)


class ProjectService:
    @staticmethod
    def _serialize(project: Project) -> dict:
        return {
            "id": project.id,
            "key": project.key,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "leadId": project.leadId,
            "teamId": project.teamId,
            "settings": project.settings,
            "createdById": project.createdById,
            "ownerType": getattr(project, "ownerType", None),
            "ownerUserId": getattr(project, "ownerUserId", None),
            "ownerOrgId": getattr(project, "ownerOrgId", None),
            "createdAt": project.createdAt.isoformat() if project.createdAt else None,
            "updatedAt": project.updatedAt.isoformat() if project.updatedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, params: dict, user: dict) -> dict:
        query = select(Project).where(Project.deletedAt.is_(None))
        ws = await resolve_workspace(db, user, params.get("workspace"))
        if ws["ownerType"] == "personal":
            query = query.where(personal_owner_filter(Project, user["id"]))
        else:
            query = query.where(org_owner_filter(Project, ws["orgId"]))
        if params.get("status"):
            query = query.where(Project.status == params["status"])
        if params.get("teamId"):
            query = query.where(Project.teamId == params["teamId"])
        if params.get("search"):
            search = f"%{params['search']}%"
            query = query.where(or_(Project.name.ilike(search), Project.key.ilike(search)))

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        page = params.get("page", 1)
        per_page = params.get("perPage", 10)
        offset = (page - 1) * per_page

        query = query.offset(offset).limit(per_page).order_by(Project.createdAt.desc())
        result = await db.execute(query)
        items = result.scalars().all()

        return {
            "items": [ProjectService._serialize(p) for p in items],
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page),
        }

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        project_id = uuid.uuid4().hex
        key = data.get("key") or project_id[:8].upper()

        # Duplicate keys must be a friendly 400, not an unhandled
        # IntegrityError -> 500 (found during live testing).
        existing = await db.execute(select(Project).where(Project.key == key, Project.deletedAt.is_(None)))
        if existing.scalar_one_or_none():
            raise ValueError(f"Project key '{key}' is already in use")

        project = Project(
            id=project_id,
            key=key,
            name=data["name"],
            description=data.get("description"),
            teamId=data.get("teamId"),
            settings=str(data.get("settings") or {}),
            createdById=user["id"],
        )
        ws = await resolve_workspace(db, user, data.get("workspace"))
        await stamp_owner(
            project,
            owner_type=ws["ownerType"],
            owner_user_id=ws["ownerUserId"],
            owner_org_id=ws["orgId"],
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
        return ProjectService._serialize(project)

    @staticmethod
    async def get_by_id(db: AsyncSession, project_id: str, user: dict) -> dict:
        result = await db.execute(select(Project).where(Project.id == project_id, Project.deletedAt.is_(None)))
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError("Project not found")
        return ProjectService._serialize(project)

    @staticmethod
    async def update(db: AsyncSession, project_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Project).where(Project.id == project_id, Project.deletedAt.is_(None)))
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError("Project not found")

        if data.get("name") is not None:
            project.name = data["name"]
        if data.get("description") is not None:
            project.description = data["description"]
        if data.get("status") is not None:
            project.status = data["status"]
        if data.get("leadId") is not None:
            project.leadId = data["leadId"]
        if data.get("settings") is not None:
            project.settings = str(data["settings"])
        await db.commit()
        await db.refresh(project)
        return ProjectService._serialize(project)

    @staticmethod
    async def delete(db: AsyncSession, project_id: str, user: dict) -> dict:
        result = await db.execute(select(Project).where(Project.id == project_id, Project.deletedAt.is_(None)))
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError("Project not found")
        project.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def get_stats(db: AsyncSession, project_id: str) -> dict:
        result = await db.execute(select(func.count()).select_from(WorkItem).where(WorkItem.projectId == project_id, WorkItem.deletedAt.is_(None)))
        total = result.scalar_one()
        return {"totalWorkItems": total}
