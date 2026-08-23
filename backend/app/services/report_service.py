from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.project import Project
from app.models.work_item import WorkItem
from datetime import datetime, timezone, timedelta


class ReportService:
    @staticmethod
    async def get_dashboard_summary(db: AsyncSession, user_id: str, user: dict) -> dict:
        total_projects = await db.execute(select(func.count()).select_from(Project).where(Project.status == "ACTIVE", Project.deletedAt.is_(None)))
        open_work_items = await db.execute(select(func.count()).select_from(WorkItem).where(WorkItem.status != "done", WorkItem.deletedAt.is_(None)))
        assigned_to_me = await db.execute(select(func.count()).select_from(WorkItem).where(WorkItem.assigneeId == user_id, WorkItem.status != "done", WorkItem.deletedAt.is_(None)))
        overdue_items = await db.execute(select(func.count()).select_from(WorkItem).where(WorkItem.status != "done", WorkItem.dueDate < datetime.now(timezone.utc), WorkItem.deletedAt.is_(None)))
        return {
            "totalProjects": total_projects.scalar_one(),
            "openWorkItems": open_work_items.scalar_one(),
            "assignedToMe": assigned_to_me.scalar_one(),
            "overdueItems": overdue_items.scalar_one(),
        }

    @staticmethod
    async def get_workload_report(db: AsyncSession, user: dict) -> list[dict]:
        result = await db.execute(
            select(WorkItem).where(WorkItem.status != "done", WorkItem.assigneeId.isnot(None), WorkItem.deletedAt.is_(None))
        )
        items = result.scalars().all()
        grouped = {}
        for item in items:
            aid = item.assigneeId
            if aid not in grouped:
                grouped[aid] = {"assignee": {"id": aid}, "items": [], "count": 0}
            grouped[aid]["items"].append({
                "id": item.id,
                "title": item.title,
                "status": item.status,
                "priority": item.priority,
                "projectId": item.projectId,
            })
            grouped[aid]["count"] += 1
        return list(grouped.values())

    @staticmethod
    async def get_velocity_report(db: AsyncSession, user: dict, project_id: str | None = None) -> list[dict]:
        query = select(WorkItem).where(WorkItem.status == "done", WorkItem.iterationId.isnot(None), WorkItem.deletedAt.is_(None))
        if project_id:
            query = query.where(WorkItem.projectId == project_id)
        result = await db.execute(query)
        items = result.scalars().all()
        grouped = {}
        for item in items:
            if not item.iterationId:
                continue
            if item.iterationId not in grouped:
                grouped[item.iterationId] = {
                    "iteration": {"id": item.iterationId},
                    "totalPoints": 0,
                    "count": 0,
                }
            grouped[item.iterationId]["totalPoints"] += item.storyPoints or 0
            grouped[item.iterationId]["count"] += 1
        return list(grouped.values())

    @staticmethod
    async def get_trend_report(db: AsyncSession, user: dict) -> list[dict]:
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        created = await db.execute(
            select(WorkItem.createdAt).where(WorkItem.createdAt >= thirty_days_ago, WorkItem.deletedAt.is_(None))
        )
        created_dates = [r[0].date().isoformat() for r in created.all()]
        resolved = await db.execute(
            select(WorkItem.resolvedAt).where(WorkItem.status == "done", WorkItem.resolvedAt >= thirty_days_ago, WorkItem.deletedAt.is_(None))
        )
        resolved_dates = [r[0].date().isoformat() for r in resolved.all() if r[0]]

        daily = {}
        for i in range(30):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
            daily[d] = {"date": d, "created": 0, "resolved": 0}
        for d in created_dates:
            if d in daily:
                daily[d]["created"] += 1
        for d in resolved_dates:
            if d in daily:
                daily[d]["resolved"] += 1
        return sorted(daily.values(), key=lambda x: x["date"])

    @staticmethod
    async def export_csv(db: AsyncSession, user: dict, filters: dict | None = None) -> str:
        query = select(WorkItem)
        if filters:
            if filters.get("projectId"):
                query = query.where(WorkItem.projectId == filters["projectId"])
            if filters.get("status"):
                query = query.where(WorkItem.status == filters["status"])
        query = query.where(WorkItem.deletedAt.is_(None)).order_by(WorkItem.createdAt.desc())
        result = await db.execute(query)
        items = result.scalars().all()
        headers = ["ID", "Title", "Type", "Status", "Priority", "Assignee", "Project", "Created At"]
        rows = []
        for item in items:
            rows.append([item.id, item.title, item.type, item.status, item.priority, item.assigneeId or "", item.projectId, item.createdAt.isoformat() if item.createdAt else ""])
        csv_content = "\n".join([",".join(headers)] + [",".join(str(c) for c in r) for r in rows])
        return csv_content
