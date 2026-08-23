from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.middleware.auth import get_current_user
from app.utils.rbac import has_permission
from app.schemas.ticket import (
    TicketCreate,
    TicketUpdate,
    TicketAssignRequest,
    TicketReplyCreate,
    TicketReplyUpdate,
)
from app.services.ticket_service import TicketService

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("/")
async def list_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    assigneeId: Optional[str] = Query(None),
    customerId: Optional[str] = Query(None),
    projectId: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    slaBreached: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(10, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "view:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    filters = {
        "status": status,
        "priority": priority,
        "category": category,
        "assigneeId": assigneeId,
        "customerId": customerId,
        "projectId": projectId,
        "search": search,
        "slaBreached": slaBreached,
        "page": page,
        "perPage": perPage,
    }
    return await TicketService.list_tickets(db, filters, user)


@router.get("/stats")
async def get_ticket_stats(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "view:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    return await TicketService.get_stats(db, user["id"])


@router.post("/", status_code=201)
async def create_ticket(
    data: TicketCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "create:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    result = await TicketService.create_ticket(db, data.model_dump(exclude_none=True), user["id"])
    return result


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "view:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    try:
        return await TicketService.get_ticket(db, ticket_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})


@router.patch("/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    data: TicketUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        existing = await TicketService.get_ticket(db, ticket_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})

    is_assigned_member = existing.get("assigneeId") == user["id"]
    if not has_permission(user["role"], "manage:tickets") and not is_assigned_member:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    try:
        return await TicketService.update_ticket(db, ticket_id, data.model_dump(exclude_none=True), user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})


@router.delete("/{ticket_id}")
async def delete_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "manage:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    try:
        return await TicketService.delete_ticket(db, ticket_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})


@router.post("/{ticket_id}/replies", status_code=201)
async def add_ticket_reply(
    ticket_id: str,
    data: TicketReplyCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "reply:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    try:
        return await TicketService.add_reply(
            db=db,
            ticket_id=ticket_id,
            content=data.content,
            author_id=user["id"],
            is_internal=data.isInternal,
            reply_type=data.type or "REPLY",
        )
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})


@router.patch("/{ticket_id}/replies/{reply_id}")
async def edit_ticket_reply(
    ticket_id: str,
    reply_id: str,
    data: TicketReplyUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await TicketService.update_reply(db, ticket_id, reply_id, data.content, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Reply not found"}})
    except PermissionError:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})


@router.delete("/{ticket_id}/replies/{reply_id}")
async def delete_ticket_reply(
    ticket_id: str,
    reply_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await TicketService.delete_reply(db, ticket_id, reply_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Reply not found"}})
    except PermissionError:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})


@router.post("/{ticket_id}/assign")
async def assign_ticket(
    ticket_id: str,
    data: TicketAssignRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "manage:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    try:
        return await TicketService.assign_ticket(db, ticket_id, data.assigneeId, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})


@router.post("/{ticket_id}/close")
async def close_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        existing = await TicketService.get_ticket(db, ticket_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})

    is_assigned = existing.get("assigneeId") == user["id"]
    if not has_permission(user["role"], "manage:tickets") and not is_assigned:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    return await TicketService.close_ticket(db, ticket_id, user)


@router.post("/{ticket_id}/reopen")
async def reopen_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_permission(user["role"], "manage:tickets"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})

    try:
        return await TicketService.reopen_ticket(db, ticket_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Ticket not found"}})
