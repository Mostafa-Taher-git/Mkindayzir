import re
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import joinedload, selectinload
from app.models.vault_folder import VaultFolder
from app.models.vault_note import VaultNote
from app.models.note_tag import NoteTag
from app.models.tag import Tag
from app.models.note_version import NoteVersion
from app.models.note_feedback import NoteFeedback
from app.models.internal_link import InternalLink
from app.models.user import User
from app.services.workspace_filter import resolve_workspace, stamp_owner


TAG_PATTERN = re.compile(r"\[\[([^\[\]\n]{1,80})\]\]")


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
        folder_name = None
        if note.folderId:
            folder = note.folder
            if folder is not None:
                folder_name = folder.name
        tag_list = []
        if note.tags:
            for nt in note.tags:
                if nt.tag is not None:
                    tag_list.append({
                        "id": nt.tag.id,
                        "name": nt.tag.name,
                        "color": nt.tag.color,
                    })
        return {
            "id": note.id,
            "folderId": note.folderId,
            "folderName": folder_name,
            "title": note.title,
            "slug": note.slug,
            "content": note.content,
            "excerpt": note.excerpt,
            "status": note.status,
            "authorId": note.authorId,
            "metadata": note.meta,
            "version": note.version,
            "tags": tag_list,
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
        folders = list(result.scalars().all())
        by_parent: dict[str | None, list[VaultFolder]] = {}
        for f in folders:
            by_parent.setdefault(f.parentId, []).append(f)
        serialized: dict[str, dict] = {}
        for f in folders:
            serialized[f.id] = VaultService._serialize_folder(f)
        for f in folders:
            if f.parentId and f.parentId in serialized:
                serialized[f.parentId].setdefault("children", []).append(serialized[f.id])
        roots = [serialized[f.id] for f in folders if not f.parentId]
        return roots

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
        folder.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def list_notes(db: AsyncSession, params: dict, user: dict) -> dict:
        from app.models.organization import OrganizationMember

        query = select(VaultNote).where(VaultNote.deletedAt.is_(None))

        workspace = params.get("workspace")
        if workspace and workspace != "personal":
            # Org workspace: user must be a member of this org
            membership = (await db.execute(
                select(OrganizationMember).where(
                    OrganizationMember.orgId == workspace,
                    OrganizationMember.userId == user["id"],
                )
            )).scalar_one_or_none()
            if membership is None:
                raise ValueError("not a member of this organization")
            query = query.where(
                VaultNote.ownerType == "org",
                VaultNote.ownerOrgId == workspace,
            )
        else:
            # Default / personal: only the user's own personal notes
            query = query.where(
                VaultNote.ownerType == "personal",
                VaultNote.ownerUserId == user["id"],
            )

        if params.get("folderId"):
            query = query.where(VaultNote.folderId == params["folderId"])
        if params.get("status"):
            query = query.where(VaultNote.status == params["status"])
        if params.get("authorId"):
            query = query.where(VaultNote.authorId == params["authorId"])
        if params.get("search"):
            search = f"%{params['search']}%"
            query = query.where(or_(VaultNote.title.ilike(search), VaultNote.content.ilike(search)))
        if params.get("tagId"):
            tag_id = params["tagId"]
            query = query.where(
                VaultNote.id.in_(select(NoteTag.noteId).where(NoteTag.tagId == tag_id))
            )

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        page = params.get("page", 1)
        per_page = params.get("perPage", 20)
        offset = (page - 1) * per_page

        query = query.offset(offset).limit(per_page).order_by(VaultNote.updatedAt.desc()).options(
            joinedload(VaultNote.folder),
            selectinload(VaultNote.tags).joinedload(NoteTag.tag),
        )
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
    async def _unique_slug(db: AsyncSession, base_slug: str) -> str:
        """Return a slug guaranteed free in vault_notes.

        create_note used to insert the raw title-derived slug; the UNIQUE
        constraint on slug then turned any duplicate title into an unhandled
        IntegrityError -> HTTP 500.
        """
        from sqlalchemy import select, func
        candidate = base_slug or "note"
        n = 2
        while True:
            exists = await db.execute(
                select(func.count()).select_from(VaultNote).where(VaultNote.slug == candidate)
            )
            if (exists.scalar_one() or 0) == 0:
                return candidate
            candidate = f"{base_slug}-{n}"
            n += 1

    @staticmethod
    def extract_tag_names(content: str) -> list[str]:
        if not content:
            return []
        seen: set[str] = set()
        names: list[str] = []
        for m in TAG_PATTERN.finditer(content):
            name = m.group(1).strip()
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            names.append(name)
        return names

    @staticmethod
    async def _sync_note_tags(
        db: AsyncSession,
        note_id: str,
        content: str | None,
        explicit_ids: list[str] | None,
    ) -> list[Tag]:
        explicit_ids = explicit_ids or []
        if not explicit_ids:
            existing_links = (
                await db.execute(
                    select(NoteTag).where(NoteTag.noteId == note_id)
                )
            ).scalars().all()
            for link in existing_links:
                await db.delete(link)
            await db.flush()
            return []

        explicit_tags = (
            await db.execute(select(Tag).where(Tag.id.in_(explicit_ids)))
        ).scalars().all()
        keep = {t.id for t in explicit_tags}

        existing_links = (
            await db.execute(
                select(NoteTag).where(NoteTag.noteId == note_id)
            )
        ).scalars().all()
        for link in existing_links:
            if link.tagId not in keep:
                await db.delete(link)
        linked_ids = {link.tagId for link in existing_links}
        for tag_id in keep:
            if tag_id in linked_ids:
                continue
            db.add(NoteTag(noteId=note_id, tagId=tag_id))
        await db.flush()
        return list(explicit_tags)

    @staticmethod
    async def create_note(db: AsyncSession, data: dict, user: dict) -> dict:
        base_slug = data.get("slug") or data["title"].lower().replace(" ", "-")
        note = VaultNote(
            id=uuid.uuid4().hex,
            folderId=data.get("folderId"),
            title=data["title"],
            slug=await VaultService._unique_slug(db, base_slug),
            content=data["content"],
            status=data.get("status", "DRAFT"),
            authorId=user["id"],
            meta=str(data.get("metadata") or {}),
        )
        ws = await resolve_workspace(db, user, data.get("workspace"))
        await stamp_owner(
            note,
            owner_type=ws["ownerType"],
            owner_user_id=ws["ownerUserId"],
            owner_org_id=ws["orgId"],
        )
        db.add(note)
        await db.flush()
        explicit = data.get("tagIds") or []
        await VaultService._sync_note_tags(db, note.id, note.content, explicit)
        await db.commit()

        reloaded = await db.execute(
            select(VaultNote)
            .where(VaultNote.id == note.id)
            .options(
                joinedload(VaultNote.folder),
                selectinload(VaultNote.tags).joinedload(NoteTag.tag),
            )
        )
        return VaultService._serialize_note(reloaded.unique().scalar_one())

    @staticmethod
    async def get_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(
            select(VaultNote)
            .where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None))
            .options(
                joinedload(VaultNote.folder),
                selectinload(VaultNote.tags).joinedload(NoteTag.tag),
            )
        )
        note = result.unique().scalar_one_or_none()
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

        content_fields = {"title", "content"}
        if content_fields.intersection(data.keys()) and any(
            data.get(f) is not None and getattr(note, f) != data[f] for f in content_fields
        ):
            version_row = NoteVersion(
                id=uuid.uuid4().hex,
                noteId=note.id,
                version=note.version,
                title=note.title,
                content=note.content,
                editedBy=user["id"],
            )
            db.add(version_row)
            note.version = (note.version or 0) + 1

        for field in ["title", "content", "folderId", "excerpt", "status"]:
            if field in data and data[field] is not None:
                setattr(note, field, data[field])
        if "metadata" in data and data["metadata"] is not None:
            note.meta = str(data["metadata"])

        if "content" in data or "tagIds" in data:
            await VaultService._sync_note_tags(
                db,
                note.id,
                note.content,
                data.get("tagIds"),
            )

        await db.commit()

        reloaded = await db.execute(
            select(VaultNote)
            .where(VaultNote.id == note_id)
            .options(
                joinedload(VaultNote.folder),
                selectinload(VaultNote.tags).joinedload(NoteTag.tag),
            )
        )
        return VaultService._serialize_note(reloaded.unique().scalar_one())

    @staticmethod
    async def delete_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        note.deletedAt = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True}

    @staticmethod
    async def publish_note(db: AsyncSession, note_id: str, user: dict) -> dict:
        result = await db.execute(select(VaultNote).where(VaultNote.id == note_id, VaultNote.deletedAt.is_(None)))
        note = result.scalar_one_or_none()
        if not note:
            raise ValueError("Note not found")
        note.status = "PUBLISHED"
        note.publishedAt = datetime.now(timezone.utc)
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
            select(VaultNote)
            .where(
                VaultNote.deletedAt.is_(None),
                or_(VaultNote.title.ilike(search), VaultNote.content.ilike(search)),
            )
            .options(
                joinedload(VaultNote.folder),
                selectinload(VaultNote.tags).joinedload(NoteTag.tag),
            )
        )
        notes = result.unique().scalars().all()
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
        result = await db.execute(
            select(VaultNote)
            .where(VaultNote.deletedAt.is_(None))
            .options(joinedload(VaultNote.folder))
        )
        notes = result.unique().scalars().all()
        nodes = [
            {
                "id": n.id,
                "title": n.title,
                "slug": n.slug,
                "status": n.status,
                "folderId": n.folderId,
                "folderName": n.folder.name if n.folder else None,
                "isSubfolderNote": bool(n.folder and n.folder.parentId),
            }
            for n in notes
        ]

        link_pairs: set[tuple[str, str]] = set()

        link_result = await db.execute(select(InternalLink))
        for l in link_result.scalars().all():
            if not l.sourceId or not l.targetId or l.sourceId == l.targetId:
                continue
            link_pairs.add(tuple(sorted((l.sourceId, l.targetId))))

        by_folder: dict[str, list[str]] = {}
        for n in notes:
            if not n.folderId:
                continue
            by_folder.setdefault(n.folderId, []).append(n.id)
        for ids in by_folder.values():
            ids = sorted(ids)
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    link_pairs.add((ids[i], ids[j]))

        links = [{"source": s, "target": t} for s, t in link_pairs]
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
