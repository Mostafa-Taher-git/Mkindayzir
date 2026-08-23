from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.vault_service import VaultService

router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.get("/folders")
async def list_folders(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"folders": await VaultService.list_folders(db, user)}


@router.post("/folders", status_code=201)
async def create_folder(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:vault"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    return await VaultService.create_folder(db, data, user)


@router.get("/folders/{folder_id}")
async def get_folder(folder_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"folder": await VaultService.get_folder(db, folder_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Folder not found"}})


@router.patch("/folders/{folder_id}")
async def update_folder(folder_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:vault"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return {"folder": await VaultService.update_folder(db, folder_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Folder not found"}})


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:vault"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return await VaultService.delete_folder(db, folder_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Folder not found"}})


@router.get("/notes")
async def list_notes(
    folderId: str | None = Query(None),
    status: str | None = Query(None),
    authorId: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    params = {"folderId": folderId, "status": status, "authorId": authorId, "search": search, "page": page, "perPage": perPage}
    result = await VaultService.list_notes(db, params, user)
    return {
        "notes": result["items"],
        "pagination": {"page": result["page"], "perPage": result["perPage"], "total": result["total"], "totalPages": result["totalPages"]},
    }


@router.post("/notes", status_code=201)
async def create_note(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await VaultService.create_note(db, data, user)


@router.get("/notes/{note_id}")
async def get_note(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"note": await VaultService.get_note(db, note_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Note not found"}})


@router.patch("/notes/{note_id}")
async def update_note(note_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"note": await VaultService.update_note(db, note_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Note not found"}})


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await VaultService.delete_note(db, note_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Note not found"}})


@router.post("/notes/{note_id}/publish")
async def publish_note(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await VaultService.publish_note(db, note_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Note not found"}})


@router.post("/notes/{note_id}/archive")
async def archive_note(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await VaultService.archive_note(db, note_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Note not found"}})


@router.get("/notes/{note_id}/versions")
async def get_note_versions(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"versions": await VaultService.get_note_versions(db, note_id, user)}


@router.get("/notes/{note_id}/feedback")
async def get_note_feedback(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"feedback": await VaultService.list_note_feedback(db, note_id, user)}


@router.post("/notes/{note_id}/feedback", status_code=201)
async def add_note_feedback(note_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await VaultService.add_feedback(db, note_id, user["id"], data.get("helpful", False), data.get("comment"))


@router.get("/notes/{note_id}/backlinks")
async def get_note_backlinks(note_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"backlinks": await VaultService.get_backlinks(db, note_id, user)}


@router.get("/tags")
async def list_tags(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"tags": await VaultService.list_tags(db, user)}


@router.post("/tags", status_code=201)
async def create_tag(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:vault"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    return await VaultService.create_tag(db, data["name"], user, data.get("color"))


@router.get("/tags/{tag_id}")
async def get_tag(tag_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"tag": await VaultService.get_tag(db, tag_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Tag not found"}})


@router.patch("/tags/{tag_id}")
async def update_tag(tag_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:vault"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return {"tag": await VaultService.update_tag(db, tag_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Tag not found"}})


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:vault"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return await VaultService.delete_tag(db, tag_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Tag not found"}})


@router.get("/search")
async def search_vault(q: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    results = await VaultService.search_notes(db, q, user)
    return {"results": results}


@router.get("/graph")
async def get_vault_graph(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await VaultService.get_graph(db, user)
