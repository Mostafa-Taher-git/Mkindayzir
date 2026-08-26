"""Storm HTTP surface — list/create/update/delete storms + links, subtree drag,
and per-storm .md note I/O.

Storms are personal (see reference/storm-canvas.md). The current user is
always the owner; ownership is checked on every endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.storm_service import (
    StormError,
    StormService,
    _serialize_storm,
)
from app.services import storm_note_store


router = APIRouter(prefix="/api/storms", tags=["storms"])


def _err(e: StormError) -> HTTPException:
    return HTTPException(
        status_code=e.status,
        detail={"error": {"code": e.code, "message": e.message}},
    )


# ---- Storms ----


class CreateStormBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class UpdateStormBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    positionX: float | None = None
    positionY: float | None = None


@router.get("/")
async def list_storms(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await StormService.list_for_user(db, user["id"])


@router.post("/", status_code=201)
async def create_storm(
    body: CreateStormBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"storm": await StormService.create(db, user["id"], {"name": body.name})}
    except StormError as e:
        raise _err(e)


@router.patch("/{storm_id}")
async def update_storm(
    storm_id: str,
    body: UpdateStormBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"storm": await StormService.update(db, user["id"], storm_id, body.model_dump(exclude_unset=True))}
    except StormError as e:
        raise _err(e)


@router.delete("/{storm_id}", status_code=204)
async def delete_storm(
    storm_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await StormService.delete(db, user["id"], storm_id)
    except StormError as e:
        raise _err(e)


class SubtreeMoveBody(BaseModel):
    dx: float
    dy: float


@router.post("/{storm_id}/move-subtree")
async def move_subtree(
    storm_id: str,
    body: SubtreeMoveBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        storms = await StormService.move_subtree(db, user["id"], storm_id, body.dx, body.dy)
        return {"storms": storms}
    except StormError as e:
        raise _err(e)


# ---- Links ----


class CreateLinkBody(BaseModel):
    targetId: str
    sourceCorner: int = Field(ge=0, le=3)
    targetCorner: int = Field(ge=0, le=3)


@router.post("/{storm_id}/links", status_code=201)
async def create_link(
    storm_id: str,
    body: CreateLinkBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        link = await StormService.create_link(
            db,
            user["id"],
            source_id=storm_id,
            target_id=body.targetId,
            source_corner=body.sourceCorner,
            target_corner=body.targetCorner,
        )
        return {"link": link}
    except StormError as e:
        raise _err(e)


@router.delete("/{storm_id}/links/{link_id}", status_code=204)
async def delete_link(
    storm_id: str,
    link_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await StormService.delete_link(db, user["id"], link_id)
    except StormError as e:
        raise _err(e)


# ---- Notes (.md on disk) ----


class NoteBody(BaseModel):
    body: str = ""


@router.get("/{storm_id}/note")
async def get_note(
    storm_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ownership gate before touching the filesystem.
    await StormService.update(db, user["id"], storm_id, {})  # raises 404 if not owned
    body = await storm_note_store.read_note(storm_id)
    return {"body": body, "wikiLinks": storm_note_store.extract_wiki_links(body)}


@router.put("/{storm_id}/note")
async def put_note(
    storm_id: str,
    body: NoteBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await StormService.update(db, user["id"], storm_id, {})
    await storm_note_store.write_note(storm_id, body.body)
    return {"ok": True}


@router.get("/_backlinks")
async def backlinks(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """{name -> [stormId, ...]} across all of the user's notes."""
    from sqlalchemy import select
    from app.models.storm import Storm

    storms = (await db.execute(
        select(Storm).where(Storm.ownerId == user["id"], Storm.isArchived.is_(False))
    )).scalars().all()

    pairs: list[tuple[str, str]] = []
    for s in storms:
        body = await storm_note_store.read_note(s.id)
        if body:
            pairs.append((s.id, body))
    return {"index": storm_note_store.backlink_index(pairs)}
