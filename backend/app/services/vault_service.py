import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from app.models.vault_folder import VaultFolder
from app.models.vault_note import VaultNote
from app.models.note_tag import NoteTag
from app.models.tag import Tag
from app.models.note_version import NoteVersion
from app.models.note_feedback import NoteFeedback
from app.models.internal_link import InternalLink
from app.models.user import User


class VaultService:
    @staticmethod
    def _serialize_folder(folder: VaultFolder) -> dict:
        return {
            "id": folder.id,
            "parentId": folder.parentId,
            "name": folder.name,
            "path": folder.path,
            "position": folder.position,
            "createdAt": folder.createdAt.isoformat() if folder.createdAt else None,
            "updatedAt": folder.updatedAt.isoformat() if folder.updatedAt else None,
            "deletedAt": folder.deletedAt.isoformat() if folder.deletedAt else None,
        }

    @staticmethod
    def _serialize_note(note: VaultNote) -> dict:
        return {
            "id": note.id,
            "folderId": note.folderId,
            "title": note.title,
            "slug": note.slug,
            "content": note.content,
            "excerpt": note.excerpt,
            "status": note.status,
            "authorId": note.authorId,
            "metadata": note.meta,
            "version": note.version,
            "createdAt": note.createdAt.isoformat() if note.createdAt else None,
            "updatedAt": note.updatedAt.isoformat() if note.updatedAt else None,
            "publishedAt": note.publishedAt.isoformat() if note.publishedAt else None,
            "deletedAt": note.deletedAt.isoformat() if note.deletedAt else None,
        }

    @staticmethod
    def _serialize_tag(tag: Tag) -> dict:
        return {
            "id": tag.id,
            "name": tag.name,
            "color": tag.color,
            "createdAt": tag.createdAt.isoformat() if tag.createdAt else None,
        }

    @staticmethod
    def _serialize_feedback(fb: NoteFeedback) -> dict:
        return {
            "id": fb.id,
            "noteId": fb.noteId,
            "userId": fb.userId,
            "helpful": fb.helpful,
            "comment": fb.comment,
            "createdAt": fb.createdAt.isoformat() if fb.createdAt else None,
        }

    @staticmethod
    def _serialize_version(ver: NoteVersion) -> dict:
        return {
            "id": ver.id,
            "noteId": ver.noteId,
            "version": ver.version,
            "title": ver.title,
            "content": ver.content,
            "editedBy": ver.editedBy,
            "createdAt": ver.createdAt.isoformat() if ver.createdAt else None,
        }

    @staticmethod
    async def list_folders(db: AsyncSession, user: dict) -> list[dict]:
        result = await db.execute(
            select(VaultFolder).where(VaultFolder.deletedAt.is_(None)).order_by(VaultFolder.position.asc())
        )
        folders = result.scalars().all()
        return [VaultService._serialize_folder(f) for f in folders]

    @staticmethod
    async def create_folder(db: AsyncSession, data: dict, user: dict) -> dict:
        folder = VaultFolder(
            id=uuid.uuid4().hex,
            parentId=data.get("parentId"),
            name=data["name"],
            path=data.get("parentId") or "",
            position=data.get("position", 0),
        )
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
        return VaultService._serialize_folder(folder)

    @staticmethod
    async def get_folder(db: AsyncSession, folder_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultFolder).where(VaultFolder.id == folder_id, VaultFolder.deletedAt.is_(None)))
        folder = result.scalar_one_or_none()
        if not folder:
            raise ValueError("Folder not found")
        return VaultService._serialize_folder(folder)

    @staticmethod
    async def update_folder(db: AsyncSession, folder_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(VaultFolder).where(VaultFolder.id == folder_id, VaultFolder.deletedAt.is_(None)))
        folder = result.scalar_one_or_none()
        if not folder:
            raise ValueError("Folder not found")

        for field in ["name", "parentId"]:
            if field in data and data[field] is not None:
                setattr(folder, field, data[field])

        await db.commit()
        await db.refresh(folder)
        return VaultService._serialize_folder(folder)

    @staticmethod
    async def delete_folder(db: AsyncSession, folder_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultFolder).where(VaultFolder.id == folder_id, VaultFolder.deletedAt.is_(None)))
        folder = result.scalar_one_or_none()
        if not folder:
            raise ValueError("Folder not found")
        folder.deletedAt = datetime.utcnow()
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def list_notes(db: AsyncSession, params: dict, user: dict) -> dict:
        query = select(VaultNote).where(VaultNote.deletedAt.is_(None))
        if params.get("folderId"):
            query = query.where(VaultNote.folderId == params["folderId"])
        if params.get("status"):
            query = query.where(VaultNote.status == params["status"])
        if params.get("authorId"):
            query = query.where(VaultNote.authorId == params["authorId"])
        if params.get("search"):
            search = f"%{params['search']}%"
            query = query.where(or_(VaultNote.title.ilike(search), VaultNote.content.ilike(search)))

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        page = params.get("page", 1)
        per_page = params.get("perPage", 20)
        offset = (page - 1) * per_page

        query = query.offset(offset).limit(per_page).order_by(VaultNote.updatedAt.desc())
        result = await db.execute(query)
        items = result.scalars().all()

        return {
            "items": [VaultService._serialize_note(n) for n in items],
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page),
        }

    @staticmethod
    async def create_note(db: AsyncSession, data: dict, user: dict) -> dict:
        note = VaultNote(
            id=uuid.uuid4().hex,
            folderId=data.get("folderId"),
            title=data["title"],
            slug=data.get("slug") or data["title"].lower().replace(" ", "-"),
            content=data["content"],
            status=data.get("status", "DRAFT"),
            authorId=user["id"],
            meta=str(data.get("metadata") or {}),
        )
        db.add(note)
        await db.commit()
        await db.refresh(note)
        return VaultService._serialize_note(note)

    @staticmethod
    async def get_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        return VaultService._serialize_note(note)

    @staticmethod
    async def get_note_by_slug(db: AsyncSession, slug: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.slug == slug, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        return VaultService._serialize_note(note)

    @staticmethod
    async def update_note(db: AsyncSession, note_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")

        for field in ["title", "content", "folderId", "excerpt", "status"]:
            if field in data and data[field] is not None:
                setattr(note, field, data[field])
        if "metadata" in data and data["metadata"] is not None:
            note.meta = str(data["metadata"])

        await db.commit()
        await db.refresh(note)
        return VaultService._serialize_note(note)

    @staticmethod
    async def delete_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        note.deletedAt = datetime.utcnow()
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def publish_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        note.status = "PUBLISHED"
        note.publishedAt = datetime.utcnow()
        await db.commit()
        await db.refresh(note)
        return VaultService._serialize_note(note)

    @staticmethod
    async def archive_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        note.status = "ARCHIVED"
        await db.commit()
        await db.refresh(note)
        return VaultService._serialize_note(note)

    @staticmethod
    async def search_notes(db: AsyncSession, query: str, user: dict) -> list[dict]:
        search = f"%{query}%"
        result = await db.execute(
            select(VaultNote).where(VaultNote.deletedAt.is_(None), or_(VaultNote.title.ilike(search), VaultNote.content.ilike(search)))
        )
        notes = result.scalars().all()
        return [VaultService._serialize_note(n) for n in notes]

    @staticmethod
    async def get_backlinks(db: AsyncSession, note_id: str, user: dict) -> list[dict]:
        result = await db.execute(
            select(InternalLink).where(InternalLink.targetId == note_id)
        )
        links = result.scalars().all()
        return [{"id": link.sourceId, "title": "", "context": link.context} for link in links]

    @staticmethod
    async def get_graph(db: AsyncSession, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.deletedAt.is_(None)))
        notes = result.scalars().all()
        nodes = [{"id": n.id, "title": n.title, "slug": n.slug} for n in notes]
        link_result = await db.execute(select(InternalLink))
        links_rows = link_result.scalars().all()
        links = [{"source": l.sourceId, "target": l.targetId} for l in links_rows]
        return {"nodes": nodes, "links": links}

    @staticmethod
    async def get_note_versions(db: AsyncSession, note_id: str, user: dict) -> list[dict]:
        result = await db.execute(
            select(NoteVersion).where(NoteVersion.noteId == note_id).order_by(NoteVersion.version.desc())
        )
        versions = result.scalars().all()
        return [VaultService._serialize_version(v) for v in versions]

    @staticmethod
    async def list_note_feedback(db: AsyncSession, note_id: str, user: dict) -> list[dict]:
        result = await db.execute(
            select(NoteFeedback).where(NoteFeedback.noteId == note_id).order_by(NoteFeedback.createdAt.desc())
        )
        feedbacks = result.scalars().all()
        return [VaultService._serialize_feedback(f) for f in feedbacks]

    @staticmethod
    async def add_feedback(db: AsyncSession, note_id: str, user_id: str, helpful: bool, comment: str | None) -> dict:
        feedback = NoteFeedback(
            id=uuid.uuid4().hex,
            noteId=note_id,
            userId=user_id,
            helpful=helpful,
            comment=comment,
        )
        db.add(feedback)
        await db.commit()
        await db.refresh(feedback)
        return VaultService._serialize_feedback(feedback)

    @staticmethod
    async def list_tags(db: AsyncSession, user: dict) -> list[dict]:
        result = await db.execute(select(Tag).order_by(Tag.name.asc()))
        tags = result.scalars().all()
        return [VaultService._serialize_tag(t) for t in tags]

    @staticmethod
    async def create_tag(db: AsyncSession, name: str, user: dict, color: str | None = None) -> dict:
        tag = Tag(
            id=uuid.uuid4().hex,
            name=name,
            color=color or "#808080",
        )
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        return VaultService._serialize_tag(tag)

    @staticmethod
    async def get_tag(db: AsyncSession, tag_id: str, user: dict) -> dict:
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()
        if not tag:
            raise ValueError("Tag not found")
        return VaultService._serialize_tag(tag)

    @staticmethod
    async def update_tag(db: AsyncSession, tag_id: str, data: dict, user: dict) -> dict:
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()
        if not tag:
            raise ValueError("Tag not found")

        for field in ["name", "color"]:
            if field in data and data[field] is not None:
                setattr(tag, field, data[field])

        await db.commit()
        await db.refresh(tag)
        return VaultService._serialize_tag(tag)

    @staticmethod
    async def delete_tag(db: AsyncSession, tag_id: str, user: dict) -> dict:
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()
        if not tag:
            raise ValueError("Tag not found")
        await db.delete(tag)
        await db.commit()
        return {"ok": True}
