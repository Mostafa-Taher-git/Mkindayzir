from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.archive_service import ArchiveService


router = APIRouter(prefix="/api/archive", tags=["archive"])


def _bad_request(msg: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": msg}})


@router.get("/folders")
async def list_folders(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ArchiveService.list_folders(db, user)


@router.post("/folders", status_code=201)
async def create_folder(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ArchiveService.create_folder(db, user, data)
    except ValueError as e:
        raise _bad_request(str(e))


@router.patch("/folders/{folder_id}")
async def rename_folder(folder_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ArchiveService.rename_folder(db, user, folder_id, data.get("name", ""))
    except ValueError as e:
        raise _bad_request(str(e))


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await ArchiveService.delete_folder(db, user, folder_id)
    except ValueError as e:
        raise _bad_request(str(e))


@router.get("/items")
async def list_items(
    folderId: Optional[str] = Query(None),
    entityType: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    recent: bool = Query(False),
    page: int = Query(1, ge=1),
    perPage: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ArchiveService.list_items(
        db, user,
        folder_id=folderId,
        entity_type=entityType,
        search=search,
        recent=recent,
        page=page,
        per_page=perPage,
    )


@router.get("/items/{item_id}")
async def get_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ArchiveService.get_item(db, user, item_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})


@router.patch("/items/{item_id}/move")
async def move_item(item_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ArchiveService.move_item(db, user, item_id, data.get("folderId"))
    except ValueError as e:
        raise _bad_request(str(e))


@router.post("/items/bulk-move", status_code=200)
async def bulk_move(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ArchiveService.bulk_move(db, user, data.get("itemIds", []), data.get("folderId"))
    except ValueError as e:
        raise _bad_request(str(e))


@router.post("/items/{item_id}/restore", status_code=200)
async def restore_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ArchiveService.mark_restored(db, user, item_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})


@router.delete("/items/{item_id}", status_code=204)
async def permanent_delete_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await ArchiveService.permanent_delete(db, user, item_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})


@router.post("/items/bulk-delete", status_code=200)
async def bulk_delete(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ArchiveService.bulk_permanent_delete(db, user, data.get("itemIds", []))


@router.post("/items/snapshot", status_code=201)
async def snapshot(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Record an archive item for any entity.

    Frontend calls this before (or after) the entity's own delete/archive
    endpoint so the Vault has a recoverable copy. Accepts the entity's
    display name, summary fields, and a JSON payload that restore can use.
    """
    try:
        return await ArchiveService.archive(
            db,
            user,
            entity_type=data.get("entityType", "unknown"),
            entity_id=data.get("entityId"),
            title=data.get("title") or "Untitled",
            summary=data.get("summary"),
            payload=data.get("payload"),
            folder_id=data.get("folderId"),
        )
    except ValueError as e:
        raise _bad_request(str(e))
