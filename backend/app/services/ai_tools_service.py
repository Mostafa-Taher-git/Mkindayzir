from typing import Any


TOOL_DEFINITIONS = [
    {
        "name": "search_work_items",
        "description": "Search work items by query string with optional filters.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query string"},
                "filters": {
                    "type": "object",
                    "properties": {
                        "projectId": {"type": "string"},
                        "status": {"type": "string"},
                        "priority": {"type": "string"},
                        "type": {"type": "string"},
                        "assigneeId": {"type": "string"},
                    },
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_work_item",
        "description": "Get details of a specific work item by ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Work item ID"},
            },
            "required": ["id"],
        },
    },
    {
        "name": "create_work_item",
        "description": "Create a new work item.",
        "parameters": {
            "type": "object",
            "properties": {
                "projectId": {"type": "string", "description": "Project ID"},
                "title": {"type": "string", "description": "Work item title"},
                "type": {"type": "string", "description": "Work item type (TASK, BUG, FEATURE, IMPROVEMENT)"},
                "priority": {"type": "string", "description": "Priority (CRITICAL, HIGH, MEDIUM, LOW)"},
                "description": {"type": "string", "description": "Work item description"},
            },
            "required": ["projectId", "title", "type"],
        },
    },
    {
        "name": "update_work_item_status",
        "description": "Transition a work item to a new status.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Work item ID"},
                "newStatus": {"type": "string", "description": "New status value"},
            },
            "required": ["id", "newStatus"],
        },
    },
    {
        "name": "search_vault",
        "description": "Search vault notes by query string.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_vault_note",
        "description": "Get a vault note by ID or slug.",
        "parameters": {
            "type": "object",
            "properties": {
                "identifier": {"type": "string", "description": "Note ID or slug"},
            },
            "required": ["identifier"],
        },
    },
    {
        "name": "summarize_iteration",
        "description": "Get a summary of an iteration including work item counts.",
        "parameters": {
            "type": "object",
            "properties": {
                "iterationId": {"type": "string", "description": "Iteration ID"},
            },
            "required": ["iterationId"],
        },
    },
]


class AIToolsService:
    @staticmethod
    async def get_tool_definitions() -> list[dict]:
        return TOOL_DEFINITIONS

    @staticmethod
    async def execute_tool(tool_name: str, args: dict, user: dict, db) -> Any:
        if tool_name == "search_work_items":
            from app.services.work_item_service import WorkItemService
            return await WorkItemService.list(db, args.get("projectId"), {**args, "search": args.get("query")}, user)
        if tool_name == "get_work_item":
            from app.services.work_item_service import WorkItemService
            return await WorkItemService.get(db, args["id"], user)
        if tool_name == "create_work_item":
            from app.services.work_item_service import WorkItemService
            return await WorkItemService.create(db, args, user)
        if tool_name == "update_work_item_status":
            from app.services.work_item_service import WorkItemService
            return await WorkItemService.transition(db, args["id"], args["newStatus"], user)
        if tool_name == "search_vault":
            from app.services.vault_service import VaultService
            return await VaultService.search_notes(db, args["query"], user)
        if tool_name == "get_vault_note":
            from app.services.vault_service import VaultService
            identifier = args.get("identifier", "")
            try:
                return await VaultService.get_note(db, identifier, user)
            except ValueError:
                return await VaultService.get_note_by_slug(db, identifier, user)
        if tool_name == "summarize_iteration":
            from app.models.iteration import Iteration
            from app.models.work_item import WorkItem
            from sqlalchemy import select, func
            result = await db.execute(select(Iteration).where(Iteration.id == args["iterationId"]))
            iteration = result.scalar_one_or_none()
            if not iteration:
                return {"error": "Iteration not found"}
            items_result = await db.execute(
                select(WorkItem).where(WorkItem.iterationId == args["iterationId"])
            )
            items = items_result.scalars().all()
            total = len(items)
            done = sum(1 for i in items if i.status == "done")
            in_progress = sum(1 for i in items if i.status == "in_progress")
            todo = sum(1 for i in items if i.status == "todo")
            return {
                "id": iteration.id,
                "name": iteration.name,
                "project": iteration.project.name if iteration.project else "Unknown",
                "goal": iteration.goal,
                "status": iteration.status,
                "startDate": iteration.startDate.isoformat() if iteration.startDate else None,
                "endDate": iteration.endDate.isoformat() if iteration.endDate else None,
                "summary": {"total": total, "done": done, "inProgress": in_progress, "todo": todo},
            }
        raise ValueError(f"Unknown tool: {tool_name}")
