import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, update, and_
from sqlalchemy.orm import selectinload

from app.models.ticket import Ticket
from app.models.ticket_reply import TicketReply
from app.models.customer import Customer
from app.models.user import User
from app.models.project import Project


class TicketService:
    @staticmethod
    def _parse_json(val: Any, default: Any) -> Any:
        if val is None:
            return default
        if isinstance(val, (dict, list)):
            return val
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return default
        return default

    @staticmethod
    def _serialize_user_summary(user: Optional[User]) -> Optional[Dict[str, Any]]:
        if not user:
            return None
        return {
            "id": user.id,
            "displayName": user.displayName,
            "email": getattr(user, "email", None),
            "avatar": getattr(user, "avatar", None),
        }

    @staticmethod
    def _serialize_customer_summary(customer: Optional[Customer]) -> Optional[Dict[str, Any]]:
        if not customer:
            return None
        return {
            "id": customer.id,
            "displayName": customer.displayName,
            "email": customer.email,
            "company": customer.company,
            "avatar": customer.avatar,
        }

    @staticmethod
    def _serialize_project_summary(project: Optional[Project]) -> Optional[Dict[str, Any]]:
        if not project:
            return None
        return {
            "id": project.id,
            "name": project.name,
            "key": project.key,
        }

    @staticmethod
    def _serialize_reply(reply: TicketReply) -> Dict[str, Any]:
        return {
            "id": reply.id,
            "ticketId": reply.ticketId,
            "authorId": reply.authorId,
            "customerId": reply.customerId,
            "content": reply.content,
            "isInternal": reply.isInternal,
            "type": reply.type,
            "createdAt": reply.createdAt.isoformat() if reply.createdAt else None,
            "updatedAt": reply.updatedAt.isoformat() if reply.updatedAt else None,
            "author": TicketService._serialize_user_summary(reply.author) if hasattr(reply, "author") and reply.author else None,
            "customer": TicketService._serialize_customer_summary(reply.customer) if hasattr(reply, "customer") and reply.customer else None,
        }

    @staticmethod
    def _serialize_ticket(ticket: Ticket, replies: Optional[List[TicketReply]] = None, reply_count: Optional[int] = None) -> Dict[str, Any]:
        tags = TicketService._parse_json(ticket.tags, [])
        if not isinstance(tags, list):
            tags = []

        metadata = TicketService._parse_json(ticket.meta, {})
        if not isinstance(metadata, dict):
            metadata = {}

        serialized_replies = None
        if replies is not None:
            serialized_replies = [TicketService._serialize_reply(r) for r in replies if r.deletedAt is None]
            reply_count = len(serialized_replies)
        elif reply_count is None:
            reply_count = len(ticket.replies) if hasattr(ticket, "replies") and ticket.replies is not None else 0

        return {
            "id": ticket.id,
            "number": ticket.number,
            "subject": ticket.subject,
            "description": ticket.description,
            "status": ticket.status,
            "priority": ticket.priority,
            "category": ticket.category,
            "source": ticket.source,
            "customerId": ticket.customerId,
            "assigneeId": ticket.assigneeId,
            "createdById": ticket.createdById,
            "projectId": ticket.projectId,
            "firstResponseAt": ticket.firstResponseAt.isoformat() if ticket.firstResponseAt else None,
            "resolvedAt": ticket.resolvedAt.isoformat() if ticket.resolvedAt else None,
            "closedAt": ticket.closedAt.isoformat() if ticket.closedAt else None,
            "dueDate": ticket.dueDate.isoformat() if ticket.dueDate else None,
            "slaBreached": ticket.slaBreached,
            "tags": tags,
            "metadata": metadata,
            "position": ticket.position,
            "createdAt": ticket.createdAt.isoformat() if ticket.createdAt else None,
            "updatedAt": ticket.updatedAt.isoformat() if ticket.updatedAt else None,
            "deletedAt": ticket.deletedAt.isoformat() if ticket.deletedAt else None,
            "assignee": TicketService._serialize_user_summary(ticket.assignee) if hasattr(ticket, "assignee") and ticket.assignee else None,
            "customer": TicketService._serialize_customer_summary(ticket.customer) if hasattr(ticket, "customer") and ticket.customer else None,
            "creator": TicketService._serialize_user_summary(ticket.creator) if hasattr(ticket, "creator") and ticket.creator else None,
            "project": TicketService._serialize_project_summary(ticket.project) if hasattr(ticket, "project") and ticket.project else None,
            "replyCount": reply_count,
            "replies": serialized_replies,
        }

    @staticmethod
    async def list_tickets(db: AsyncSession, filters: dict, user: dict) -> dict:
        query = select(Ticket).where(Ticket.deletedAt.is_(None))

        if filters.get("status"):
            status_filter = filters["status"]
            if "," in status_filter:
                statuses = [s.strip() for s in status_filter.split(",")]
                query = query.where(Ticket.status.in_(statuses))
            else:
                query = query.where(Ticket.status == status_filter)

        if filters.get("priority"):
            query = query.where(Ticket.priority == filters["priority"])

        if filters.get("category"):
            query = query.where(Ticket.category == filters["category"])

        if filters.get("assigneeId"):
            if filters["assigneeId"] == "unassigned":
                query = query.where(Ticket.assigneeId.is_(None))
            else:
                query = query.where(Ticket.assigneeId == filters["assigneeId"])

        if filters.get("customerId"):
            query = query.where(Ticket.customerId == filters["customerId"])

        if filters.get("projectId"):
            query = query.where(Ticket.projectId == filters["projectId"])

        if filters.get("search"):
            search_str = f"%{filters['search']}%"
            query = query.where(or_(Ticket.subject.ilike(search_str), Ticket.description.ilike(search_str)))

        if filters.get("slaBreached") is not None:
            if isinstance(filters["slaBreached"], str):
                is_breached = filters["slaBreached"].lower() == "true"
            else:
                is_breached = bool(filters["slaBreached"])
            query = query.where(Ticket.slaBreached == is_breached)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        page = int(filters.get("page", 1))
        per_page = int(filters.get("perPage", filters.get("limit", 10)))
        offset = (page - 1) * per_page

        query = (
            query.options(
                selectinload(Ticket.assignee),
                selectinload(Ticket.customer),
                selectinload(Ticket.creator),
                selectinload(Ticket.project),
            )
            .order_by(Ticket.createdAt.desc())
            .offset(offset)
            .limit(per_page)
        )

        result = await db.execute(query)
        tickets = result.scalars().all()

        ticket_ids = [t.id for t in tickets]
        reply_counts: Dict[str, int] = {}
        if ticket_ids:
            rc_query = (
                select(TicketReply.ticketId, func.count(TicketReply.id))
                .where(TicketReply.ticketId.in_(ticket_ids), TicketReply.deletedAt.is_(None))
                .group_by(TicketReply.ticketId)
            )
            rc_res = await db.execute(rc_query)
            for row in rc_res.all():
                reply_counts[row[0]] = row[1]

        items = [TicketService._serialize_ticket(t, reply_count=reply_counts.get(t.id, 0)) for t in tickets]

        return {
            "items": items,
            "tickets": items,  # Support both schemas
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page),
            "pagination": {
                "page": page,
                "limit": per_page,
                "total": total,
                "totalPages": max(1, (total + per_page - 1) // per_page),
            },
        }

    @staticmethod
    async def get_ticket(db: AsyncSession, ticket_id: str, user: dict) -> dict:
        query = (
            select(Ticket)
            .where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None))
            .options(
                selectinload(Ticket.assignee),
                selectinload(Ticket.customer),
                selectinload(Ticket.creator),
                selectinload(Ticket.project),
                selectinload(Ticket.replies).selectinload(TicketReply.author),
                selectinload(Ticket.replies).selectinload(TicketReply.customer),
            )
        )
        result = await db.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        active_replies = [r for r in ticket.replies if r.deletedAt is None]
        return TicketService._serialize_ticket(ticket, replies=active_replies)

    @staticmethod
    async def create_ticket(db: AsyncSession, data: dict, created_by_id: str) -> dict:
        num_res = await db.execute(select(func.coalesce(func.max(Ticket.number), 0)))
        next_number = num_res.scalar_one() + 1

        tags_val = data.get("tags", [])
        if isinstance(tags_val, (list, dict)):
            tags_str = json.dumps(tags_val)
        else:
            tags_str = str(tags_val or "[]")

        meta_val = data.get("metadata", {})
        if isinstance(meta_val, (dict, list)):
            meta_str = json.dumps(meta_val)
        else:
            meta_str = str(meta_val or "{}")

        status = data.get("status", "OPEN")
        ticket = Ticket(
            id=uuid.uuid4().hex,
            number=next_number,
            subject=data["subject"],
            description=data["description"],
            status=status,
            priority=data.get("priority", "MEDIUM"),
            category=data.get("category", "GENERAL"),
            source=data.get("source", "INTERNAL"),
            customerId=data.get("customerId"),
            assigneeId=data.get("assigneeId"),
            createdById=created_by_id,
            projectId=data.get("projectId"),
            dueDate=data.get("dueDate"),
            slaBreached=False,
            tags=tags_str,
            meta=meta_str,
            position=0,
        )

        # If due date already in past, check breach
        if ticket.dueDate and ticket.dueDate.tzinfo is None:
            ticket.dueDate = ticket.dueDate.replace(tzinfo=timezone.utc)
        if ticket.dueDate and ticket.dueDate < datetime.now(timezone.utc):
            ticket.slaBreached = True

        db.add(ticket)
        await db.commit()

        # Reload with relationships
        return await TicketService.get_ticket(db, ticket.id, {"id": created_by_id})

    @staticmethod
    async def update_ticket(db: AsyncSession, ticket_id: str, data: dict, user: dict) -> dict:
        query = select(Ticket).where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None))
        result = await db.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        direct_fields = ["subject", "description", "priority", "category", "assigneeId", "customerId", "projectId", "dueDate"]
        for field in direct_fields:
            if field in data and data[field] is not None:
                setattr(ticket, field, data[field])

        if "status" in data and data["status"] is not None:
            new_status = data["status"]
            old_status = ticket.status
            ticket.status = new_status
            now = datetime.now(timezone.utc)
            if new_status == "RESOLVED" and not ticket.resolvedAt:
                ticket.resolvedAt = now
            elif new_status == "CLOSED":
                if not ticket.closedAt:
                    ticket.closedAt = now
                if not ticket.resolvedAt:
                    ticket.resolvedAt = now
            elif new_status in ["OPEN", "IN_PROGRESS"] and old_status in ["RESOLVED", "CLOSED"]:
                ticket.resolvedAt = None
                ticket.closedAt = None

        if "tags" in data and data["tags"] is not None:
            tags_val = data["tags"]
            ticket.tags = json.dumps(tags_val) if isinstance(tags_val, (list, dict)) else str(tags_val)

        if "metadata" in data and data["metadata"] is not None:
            meta_val = data["metadata"]
            ticket.meta = json.dumps(meta_val) if isinstance(meta_val, (dict, list)) else str(meta_val)

        # Check SLA
        if ticket.dueDate:
            due_dt = ticket.dueDate
            if due_dt.tzinfo is None:
                due_dt = due_dt.replace(tzinfo=timezone.utc)
            if due_dt < datetime.now(timezone.utc) and ticket.status not in ["RESOLVED", "CLOSED"]:
                ticket.slaBreached = True
            else:
                ticket.slaBreached = False

        ticket.updatedAt = datetime.now(timezone.utc)
        await db.commit()

        return await TicketService.get_ticket(db, ticket.id, user)

    @staticmethod
    async def delete_ticket(db: AsyncSession, ticket_id: str, user: dict) -> dict:
        result = await db.execute(select(Ticket).where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None)))
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        ticket.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def add_reply(
        db: AsyncSession,
        ticket_id: str,
        content: str,
        author_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        is_internal: bool = False,
        reply_type: str = "REPLY",
    ) -> dict:
        result = await db.execute(select(Ticket).where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None)))
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        reply_id = uuid.uuid4().hex
        reply = TicketReply(
            id=reply_id,
            ticketId=ticket_id,
            authorId=author_id,
            customerId=customer_id,
            content=content,
            isInternal=is_internal,
            type=reply_type,
        )
        db.add(reply)

        now = datetime.now(timezone.utc)
        # Update first response time if staff replied publicly
        if author_id and not is_internal and not ticket.firstResponseAt:
            ticket.firstResponseAt = now

        # If staff replied to open ticket, move to in_progress or waiting on customer
        if author_id and ticket.status == "OPEN" and not is_internal:
            ticket.status = "IN_PROGRESS"

        ticket.updatedAt = now
        await db.commit()

        # Load reply with author / customer
        query = (
            select(TicketReply)
            .where(TicketReply.id == reply_id)
            .options(
                selectinload(TicketReply.author),
                selectinload(TicketReply.customer),
            )
        )
        rep_res = await db.execute(query)
        loaded_reply = rep_res.scalar_one()
        return TicketService._serialize_reply(loaded_reply)

    @staticmethod
    async def update_reply(db: AsyncSession, ticket_id: str, reply_id: str, content: str, user: dict) -> dict:
        query = (
            select(TicketReply)
            .where(TicketReply.id == reply_id, TicketReply.ticketId == ticket_id, TicketReply.deletedAt.is_(None))
            .options(
                selectinload(TicketReply.author),
                selectinload(TicketReply.customer),
            )
        )
        result = await db.execute(query)
        reply = result.scalar_one_or_none()
        if not reply:
            raise ValueError("Reply not found")

        # Allow author or admin/manager
        if reply.authorId != user["id"] and user.get("role") not in ["ADMIN", "MANAGER"]:
            raise PermissionError("Not authorized to edit this reply")

        reply.content = content
        reply.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(reply)
        return TicketService._serialize_reply(reply)

    @staticmethod
    async def delete_reply(db: AsyncSession, ticket_id: str, reply_id: str, user: dict) -> dict:
        query = select(TicketReply).where(TicketReply.id == reply_id, TicketReply.ticketId == ticket_id, TicketReply.deletedAt.is_(None))
        result = await db.execute(query)
        reply = result.scalar_one_or_none()
        if not reply:
            raise ValueError("Reply not found")

        if reply.authorId != user["id"] and user.get("role") not in ["ADMIN", "MANAGER"]:
            raise PermissionError("Not authorized to delete this reply")

        reply.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def assign_ticket(db: AsyncSession, ticket_id: str, assignee_id: Optional[str], user: dict) -> dict:
        query = select(Ticket).where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None))
        result = await db.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        ticket.assigneeId = assignee_id
        if assignee_id and ticket.status == "OPEN":
            ticket.status = "IN_PROGRESS"

        ticket.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        return await TicketService.get_ticket(db, ticket_id, user)

    @staticmethod
    async def close_ticket(db: AsyncSession, ticket_id: str, user: dict) -> dict:
        query = select(Ticket).where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None))
        result = await db.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        now = datetime.now(timezone.utc)
        ticket.status = "CLOSED"
        ticket.closedAt = now
        if not ticket.resolvedAt:
            ticket.resolvedAt = now
        ticket.updatedAt = now
        await db.commit()
        return await TicketService.get_ticket(db, ticket_id, user)

    @staticmethod
    async def reopen_ticket(db: AsyncSession, ticket_id: str, user: dict) -> dict:
        query = select(Ticket).where(Ticket.id == ticket_id, Ticket.deletedAt.is_(None))
        result = await db.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")

        ticket.status = "OPEN"
        ticket.resolvedAt = None
        ticket.closedAt = None
        ticket.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        return await TicketService.get_ticket(db, ticket_id, user)

    @staticmethod
    async def get_stats(db: AsyncSession, user_id: Optional[str] = None) -> dict:
        total = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.deletedAt.is_(None))
        )
        open_count = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.deletedAt.is_(None), Ticket.status.in_(["OPEN", "IN_PROGRESS"]))
        )
        waiting_count = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.deletedAt.is_(None), Ticket.status.in_(["WAITING_ON_CUSTOMER", "WAITING_ON_TEAM"]))
        )
        resolved_count = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.deletedAt.is_(None), Ticket.status == "RESOLVED")
        )
        closed_count = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.deletedAt.is_(None), Ticket.status == "CLOSED")
        )
        sla_breached_count = await db.scalar(
            select(func.count()).select_from(Ticket).where(
                Ticket.deletedAt.is_(None),
                or_(
                    Ticket.slaBreached == True,
                    and_(Ticket.dueDate.is_not(None), Ticket.dueDate < func.now(), Ticket.status.not_in(["RESOLVED", "CLOSED"]))
                )
            )
        )
        urgent_count = await db.scalar(
            select(func.count()).select_from(Ticket).where(
                Ticket.deletedAt.is_(None),
                Ticket.priority.in_(["CRITICAL", "HIGH"]),
                Ticket.status.not_in(["RESOLVED", "CLOSED"])
            )
        )

        return {
            "totalCount": int(total or 0),
            "openCount": int(open_count or 0),
            "waitingCount": int(waiting_count or 0),
            "resolvedCount": int(resolved_count or 0),
            "closedCount": int(closed_count or 0),
            "slaBreachedCount": int(sla_breached_count or 0),
            "urgentCount": int(urgent_count or 0),
        }
