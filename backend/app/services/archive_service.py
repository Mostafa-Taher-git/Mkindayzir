import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func, or_, desc, asc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.user import User


DEFAULT_FOLDERS = [
    {"name": "Boards", "entityType": "board"},
    {"name": "Cards", "entityType": "card"},
    {"name": "Projects", "entityType": "project"},
    {"name": "Spaces", "entityType": "space"},
    {"name": "Tickets", "entityType": "ticket"},
    {"name": "Notes", "entityType": "note"},
    {"name": "Conversations", "entityType": "conversation"},
    {"name": "Guides", "entityType": "guide"},
    {"name": "Reports", "entityType": "report"},
    {"name": "Customers", "entityType": "customer"},
    {"name": "Initiatives", "entityType": "initiative"},
    {"name": "Iterations", "entityType": "iteration"},
    {"name": "Work items", "entityType": "work_item"},
]

ENTITY_TYPE_LABELS = {
    "board": "Board",
    "card": "Card",
    "column": "Column",
    "project": "Project",
    "space": "Space",
    "ticket": "Ticket",
    "note": "Note",
    "conversation": "Conversation",
    "guide": "Guide",
    "report": "Report",
    "customer": "Customer",
    "initiative": "Initiative",
    "iteration": "Iteration",
    "work_item": "Work item",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_folder(f: ArchiveFolder, counts: dict[str, int] | None = None) -> dict:
    return {
        "id": f.id,
        "parentId": f.parentId,
        "name": f.name,
        "isDefault": bool(f.isDefault),
        "entityType": f.entityType,
        "position": f.position,
        "createdAt": f.createdAt.isoformat() if f.createdAt else None,
        "updatedAt": f.updatedAt.isoformat() if f.updatedAt else None,
        "count": (counts or {}).get(f.id, 0),
    }


def _serialize_item(item: ArchiveItem) -> dict:
    return {
        "id": item.id,
        "entityType": item.entityType,
        "entityTypeLabel": ENTITY_TYPE_LABELS.get(item.entityType, item.entityType),
        "entityId": item.entityId,
        "folderId": item.folderId,
        "title": item.title,
        "summary": item.summary,
        "payload": json.loads(item.payload) if item.payload else None,
        "archivedAt": item.archivedAt.isoformat() if item.archivedAt else None,
        "archivedBy": item.archivedBy,
        "restoredAt": item.restoredAt.isoformat() if item.restoredAt else None,
        "permanentlyDeletedAt": item.permanentlyDeletedAt.isoformat() if item.permanentlyDeletedAt else None,
        "originalCreatedAt": item.originalCreatedAt.isoformat() if item.originalCreatedAt else None,
    }


class ArchiveService:
    @staticmethod
    async def _ensure_default_folders(db: AsyncSession, owner_id: str) -> None:
        existing = (await db.execute(
            select(ArchiveFolder).where(
                ArchiveFolder.ownerId == owner_id,
                ArchiveFolder.isDefault.is_(True),
            )
        )).scalars().all()
        existing_by_entity = {f.entityType for f in existing if f.entityType}
        if not existing:
            for pos, spec in enumerate(DEFAULT_FOLDERS):
                db.add(ArchiveFolder(
                    id=str(uuid.uuid4()),
                    ownerId=owner_id,
                    parentId=None,
                    name=spec["name"],
                    isDefault=True,
                    entityType=spec["entityType"],
                    position=pos,
                ))
            await db.commit()
            return
        for pos, spec in enumerate(DEFAULT_FOLDERS):
            if spec["entityType"] not in existing_by_entity:
                db.add(ArchiveFolder(
                    id=str(uuid.uuid4()),
                    ownerId=owner_id,
                    parentId=None,
                    name=spec["name"],
                    isDefault=True,
                    entityType=spec["entityType"],
                    position=pos,
                ))
        await db.commit()

    @staticmethod
    async def list_folders(db: AsyncSession, user: dict) -> dict:
        await ArchiveService._ensure_default_folders(db, user["id"])
        rows = (await db.execute(
            select(ArchiveFolder)
            .where(ArchiveFolder.ownerId == user["id"])
            .order_by(ArchiveFolder.isDefault.desc(), ArchiveFolder.position.asc(), ArchiveFolder.name.asc())
        )).scalars().all()
        counts_rows = (await db.execute(
            select(ArchiveItem.folderId, func.count(ArchiveItem.id))
            .where(
                ArchiveItem.ownerId == user["id"],
                ArchiveItem.restoredAt.is_(None),
                ArchiveItem.permanentlyDeletedAt.is_(None),
            )
            .group_by(ArchiveItem.folderId)
        )).all()
        counts = {fid: cnt for fid, cnt in counts_rows if fid}
        recent = (await db.execute(
            select(func.count(ArchiveItem.id)).where(
                ArchiveItem.ownerId == user["id"],
                ArchiveItem.restoredAt.is_(None),
                ArchiveItem.permanentlyDeletedAt.is_(None),
            )
        )).scalar_one()
        return {
            "folders": [_serialize_folder(f, counts) for f in rows],
            "totalItems": int(recent or 0),
        }

    @staticmethod
    async def create_folder(db: AsyncSession, user: dict, data: dict) -> dict:
        await ArchiveService._ensure_default_folders(db, user["id"])
        name = (data.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")
        parent_id = data.get("parentId")
        if parent_id:
            parent = (await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.id == parent_id, ArchiveFolder.ownerId == user["id"])
            )).scalar_one_or_none()
            if not parent:
                raise ValueError("parent folder not found")
        sibling_count = (await db.execute(
            select(func.count(ArchiveFolder.id)).where(
                ArchiveFolder.ownerId == user["id"],
                ArchiveFolder.parentId.is_(parent_id) if parent_id is None else ArchiveFolder.parentId == parent_id,
            )
        )).scalar_one()
        folder = ArchiveFolder(
            id=str(uuid.uuid4()),
            ownerId=user["id"],
            parentId=parent_id,
            name=name,
            isDefault=False,
            entityType=None,
            position=int(sibling_count or 0),
        )
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
        return {"folder": _serialize_folder(folder)}

    @staticmethod
    async def rename_folder(db: AsyncSession, user: dict, folder_id: str, name: str) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("name is required")
        folder = (await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.id == folder_id, ArchiveFolder.ownerId == user["id"])
        )).scalar_one_or_none()
        if not folder:
            raise ValueError("folder not found")
        folder.name = name
        await db.commit()
        await db.refresh(folder)
        return {"folder": _serialize_folder(folder)}

    @staticmethod
    async def delete_folder(db: AsyncSession, user: dict, folder_id: str) -> None:
        folder = (await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.id == folder_id, ArchiveFolder.ownerId == user["id"])
        )).scalar_one_or_none()
        if not folder:
            raise ValueError("folder not found")
        if folder.isDefault:
            raise ValueError("default folders cannot be deleted")
        child_count = (await db.execute(
            select(func.count(ArchiveItem.id)).where(
                ArchiveItem.folderId == folder_id,
                ArchiveItem.restoredAt.is_(None),
                ArchiveItem.permanentlyDeletedAt.is_(None),
            )
        )).scalar_one()
        if (child_count or 0) > 0:
            raise ValueError("folder is not empty; move items first")
        sub_count = (await db.execute(
            select(func.count(ArchiveFolder.id)).where(ArchiveFolder.parentId == folder_id)
        )).scalar_one()
        if (sub_count or 0) > 0:
            raise ValueError("folder has subfolders; move or delete them first")
        await db.delete(folder)
        await db.commit()

    @staticmethod
    async def _default_folder_for(db: AsyncSession, owner_id: str, entity_type: str) -> Optional[str]:
        folder = (await db.execute(
            select(ArchiveFolder).where(
                ArchiveFolder.ownerId == owner_id,
                ArchiveFolder.isDefault.is_(True),
                ArchiveFolder.entityType == entity_type,
            )
        )).scalar_one_or_none()
        return folder.id if folder else None

    @staticmethod
    async def archive(
        db: AsyncSession,
        user: dict,
        entity_type: str,
        entity_id: Optional[str],
        title: str,
        summary: Optional[str] = None,
        payload: Optional[dict] = None,
        folder_id: Optional[str] = None,
    ) -> dict:
        if not title:
            raise ValueError("title is required")
        await ArchiveService._ensure_default_folders(db, user["id"])
        if not folder_id:
            folder_id = await ArchiveService._default_folder_for(db, user["id"], entity_type)
        item = ArchiveItem(
            id=str(uuid.uuid4()),
            ownerId=user["id"],
            entityType=entity_type,
            entityId=entity_id,
            folderId=folder_id,
            title=title[:512],
            summary=summary,
            payload=json.dumps(payload) if payload else None,
            archivedAt=_now(),
            archivedBy=user["id"],
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return {"item": _serialize_item(item)}

    @staticmethod
    async def list_items(
        db: AsyncSession,
        user: dict,
        folder_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        search: Optional[str] = None,
        recent: bool = False,
        page: int = 1,
        per_page: int = 50,
    ) -> dict:
        q = select(ArchiveItem).where(
            ArchiveItem.ownerId == user["id"],
            ArchiveItem.restoredAt.is_(None),
            ArchiveItem.permanentlyDeletedAt.is_(None),
        )
        count_q = select(func.count(ArchiveItem.id)).where(
            ArchiveItem.ownerId == user["id"],
            ArchiveItem.restoredAt.is_(None),
            ArchiveItem.permanentlyDeletedAt.is_(None),
        )
        if folder_id == "root":
            q = q.where(ArchiveItem.folderId.is_(None))
            count_q = count_q.where(ArchiveItem.folderId.is_(None))
        elif folder_id:
            q = q.where(ArchiveItem.folderId == folder_id)
            count_q = count_q.where(ArchiveItem.folderId == folder_id)
        if entity_type:
            q = q.where(ArchiveItem.entityType == entity_type)
            count_q = count_q.where(ArchiveItem.entityType == entity_type)
        if search:
            like = f"%{search}%"
            q = q.where(or_(ArchiveItem.title.ilike(like), ArchiveItem.summary.ilike(like)))
            count_q = count_q.where(or_(ArchiveItem.title.ilike(like), ArchiveItem.summary.ilike(like)))
        if recent:
            cutoff = datetime.now(timezone.utc).replace(day=1) if False else _now()
            from datetime import timedelta
            cutoff = _now() - timedelta(days=30)
            q = q.where(ArchiveItem.archivedAt >= cutoff)
            count_q = count_q.where(ArchiveItem.archivedAt >= cutoff)
        total = (await db.execute(count_q)).scalar_one() or 0
        q = q.order_by(desc(ArchiveItem.archivedAt)).offset((page - 1) * per_page).limit(per_page)
        rows = (await db.execute(q)).scalars().all()
        return {
            "items": [_serialize_item(r) for r in rows],
            "pagination": {
                "page": page,
                "perPage": per_page,
                "total": int(total),
                "totalPages": (int(total) + per_page - 1) // per_page if total else 0,
            },
        }

    @staticmethod
    async def get_item(db: AsyncSession, user: dict, item_id: str) -> dict:
        item = (await db.execute(
            select(ArchiveItem).where(ArchiveItem.id == item_id, ArchiveItem.ownerId == user["id"])
        )).scalar_one_or_none()
        if not item:
            raise ValueError("item not found")
        return {"item": _serialize_item(item)}

    @staticmethod
    async def move_item(db: AsyncSession, user: dict, item_id: str, folder_id: Optional[str]) -> dict:
        item = (await db.execute(
            select(ArchiveItem).where(ArchiveItem.id == item_id, ArchiveItem.ownerId == user["id"])
        )).scalar_one_or_none()
        if not item:
            raise ValueError("item not found")
        if folder_id:
            folder = (await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.id == folder_id, ArchiveFolder.ownerId == user["id"])
            )).scalar_one_or_none()
            if not folder:
                raise ValueError("folder not found")
        item.folderId = folder_id
        await db.commit()
        await db.refresh(item)
        return {"item": _serialize_item(item)}

    @staticmethod
    async def bulk_move(db: AsyncSession, user: dict, item_ids: list[str], folder_id: Optional[str]) -> dict:
        if not item_ids:
            return {"moved": 0}
        if folder_id:
            folder = (await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.id == folder_id, ArchiveFolder.ownerId == user["id"])
            )).scalar_one_or_none()
            if not folder:
                raise ValueError("folder not found")
        rows = (await db.execute(
            select(ArchiveItem).where(ArchiveItem.id.in_(item_ids), ArchiveItem.ownerId == user["id"])
        )).scalars().all()
        for r in rows:
            r.folderId = folder_id
        await db.commit()
        return {"moved": len(rows)}

    @staticmethod
    async def permanent_delete(db: AsyncSession, user: dict, item_id: str) -> None:
        item = (await db.execute(
            select(ArchiveItem).where(ArchiveItem.id == item_id, ArchiveItem.ownerId == user["id"])
        )).scalar_one_or_none()
        if not item:
            raise ValueError("item not found")
        item.permanentlyDeletedAt = _now()
        await db.commit()

    @staticmethod
    async def bulk_permanent_delete(db: AsyncSession, user: dict, item_ids: list[str]) -> dict:
        if not item_ids:
            return {"deleted": 0}
        rows = (await db.execute(
            select(ArchiveItem).where(ArchiveItem.id.in_(item_ids), ArchiveItem.ownerId == user["id"])
        )).scalars().all()
        now = _now()
        for r in rows:
            r.permanentlyDeletedAt = now
        await db.commit()
        return {"deleted": len(rows)}

    @staticmethod
    async def mark_restored(db: AsyncSession, user: dict, item_id: str) -> dict:
        item = (await db.execute(
            select(ArchiveItem).where(ArchiveItem.id == item_id, ArchiveItem.ownerId == user["id"])
        )).scalar_one_or_none()
        if not item:
            raise ValueError("item not found")
        item.restoredAt = _now()
        await db.commit()
        await db.refresh(item)
        return {"item": _serialize_item(item)}
