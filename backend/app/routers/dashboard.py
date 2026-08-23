from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models import Project, WorkItem, Activity, User, Ticket

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate stats for the converted frontend dashboard."""
    project_count = await db.scalar(
        select(func.count()).select_from(Project).where(Project.deletedAt.is_(None))
    )
    work_item_count = await db.scalar(
        select(func.count()).select_from(WorkItem).where(WorkItem.deletedAt.is_(None))
    )
    ticket_count = await db.scalar(
        select(func.count()).select_from(Ticket).where(
            Ticket.deletedAt.is_(None),
            Ticket.status.in_(["OPEN", "IN_PROGRESS"])
        )
    )
    waiting_tickets_count = await db.scalar(
        select(func.count()).select_from(Ticket).where(
            Ticket.deletedAt.is_(None),
            Ticket.status.in_(["WAITING_ON_CUSTOMER", "WAITING_ON_TEAM"])
        )
    )

    result = await db.execute(
        select(Activity)
        .order_by(Activity.createdAt.desc())
        .limit(10)
    )
    activities = result.scalars().all()

    user_ids = {a.userId for a in activities if a.userId is not None}
    user_map: dict = {}
    if user_ids:
        user_rows = (
            await db.execute(select(User).where(User.id.in_(list(user_ids))))
        ).scalars().all()
        for u in user_rows:
            user_map[u.id] = {
                "id": u.id,
                "displayName": getattr(u, "displayName", None),
                "email": getattr(u, "email", None),
                "username": getattr(u, "username", None),
            }

    recent_activities = [
        {
            "id": a.id,
            "entityType": a.entityType,
            "entityId": a.entityId,
            "userId": a.userId,
            "user": user_map.get(a.userId),
            "action": a.action,
            "changes": a.changes,
            "createdAt": a.createdAt.isoformat() if a.createdAt else None,
        }
        for a in activities
    ]

    return {
        "projectCount": int(project_count or 0),
        "workItemCount": int(work_item_count or 0),
        "ticketCount": int(ticket_count or 0),
        "ticketsAwaitingResponse": int(waiting_tickets_count or 0),
        "recentActivities": recent_activities,
    }
