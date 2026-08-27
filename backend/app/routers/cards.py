from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pathlib import Path
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.card_attachment import CardAttachment
from app.services.card_service import CardService

router = APIRouter(prefix="/api/cards", tags=["cards"])

ATTACHMENT_DIR = "card-attachments"
ALLOWED_ATTACHMENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
    ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
    ".zip": "application/zip",
}
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024  # 20 MB


@router.get("/")
async def list_cards(
    columnId: str | None = Query(None),
    boardId: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if boardId:
        items = await CardService.list_by_board(db, boardId)
    elif columnId:
        items = await CardService.list(db, columnId, user)
    else:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_ERROR", "message": "Either columnId or boardId is required"}})
    return {"cards": items}


@router.get("/archived")
async def list_archived_cards(
    boardId: str = Query(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Registered before /{card_id} so "archived" is never parsed as an id.
    return {"cards": await CardService.list_archived(db, boardId, user)}


@router.post("/", status_code=201)
async def create_card(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await CardService.create(db, data, user)


@router.get("/{card_id}")
async def get_card(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"card": await CardService.get(db, card_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Card not found"}})


@router.patch("/{card_id}")
async def update_card(card_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"card": await CardService.update(db, card_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Card not found"}})


@router.delete("/{card_id}")
async def delete_card(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await CardService.delete(db, card_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Card not found"}})


@router.post("/{card_id}/move")
async def move_card(card_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # The SPA sends {"columnId"} (and position optional); older callers used
    # {"targetColumnId"}. Accept both, defaulting position to end-of-list.
    column_id = data.get("columnId") or data.get("targetColumnId")
    if not column_id:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_ERROR", "message": "columnId is required"}})
    position = data.get("position")
    try:
        if position is None:
            from sqlalchemy import select, func
            from app.models.card import Card
            count = (await db.execute(
                select(func.count()).where(Card.columnId == column_id, Card.deletedAt.is_(None))
            )).scalar_one()
            position = int(count)
        return await CardService.move(db, card_id, column_id, int(position), user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Card not found"}})


@router.post("/{card_id}/labels", status_code=201)
async def add_card_label(card_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await CardService.add_label(db, card_id, data["labelId"], user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Label not found"}})


@router.delete("/{card_id}/labels/{label_id}")
async def remove_card_label(card_id: str, label_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await CardService.remove_label(db, card_id, label_id, user)


@router.get("/{card_id}/members")
async def list_card_members(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await CardService.list_members(db, card_id)


@router.post("/{card_id}/members", status_code=201)
async def add_card_member(card_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await CardService.add_member(db, card_id, data["userId"], user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "User not found"}})


@router.delete("/{card_id}/members/{user_id}")
async def remove_card_member(card_id: str, user_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await CardService.remove_member(db, card_id, user_id, user)


@router.post("/{card_id}/checklists", status_code=201)
async def create_card_checklist(card_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.checklist_service import ChecklistService
    return await ChecklistService.create(db, {"cardId": card_id, **data}, user)


@router.post("/{card_id}/copy", status_code=201)
async def copy_card(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Duplicate a card into the same list."""
    try:
        return {"card": await CardService.copy(db, card_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Card not found"}})


@router.post("/{card_id}/archive")
async def archive_card(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Soft-delete a card; it stays recoverable from the board's archive."""
    try:
        result = {"card": await CardService.archive(db, card_id, user)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(exc)}})
    try:
        from app.services.archive_service import ArchiveService
        card = result["card"]
        snapshot = await ArchiveService.archive(
            db, user,
            entity_type="card",
            entity_id=card.get("id"),
            title=card.get("title") or "Untitled card",
            summary=card.get("description"),
            payload={"card": card},
        )
        result["archiveItem"] = snapshot["item"]
    except Exception:
        pass
    return result


@router.post("/{card_id}/restore")
async def restore_card(card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"card": await CardService.restore(db, card_id, user)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(exc)}})


@router.post("/{card_id}/move-board")
async def move_card_to_board(
    card_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"card": await CardService.move_to_board(db, card_id, data, user)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(exc)}})


def _attachment_dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / ATTACHMENT_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/{card_id}/attachments")
async def list_card_attachments(
    card_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(CardAttachment).where(CardAttachment.cardId == card_id))
    attachments = result.scalars().all()
    return {
        "attachments": [
            {
                "id": a.id,
                "fileName": a.displayName,
                "mimeType": a.mimeType,
                "sizeBytes": a.sizeBytes,
                "url": f"/api/cards/attachments/{a.fileName}",
                "uploadedById": a.uploadedById,
                "createdAt": a.createdAt.isoformat() if a.createdAt else None,
            }
            for a in attachments
        ]
    }


@router.post("/{card_id}/attachments", status_code=201)
async def upload_card_attachment(
    card_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "INVALID_TYPE",
                      "message": f"Unsupported file type {ext or '(none)'}."}
        })
    data = await file.read()
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "TOO_LARGE", "message": "Files must be 20 MB or smaller."}
        })

    stored_name = f"{uuid.uuid4().hex}{ext}"
    (_attachment_dir() / stored_name).write_bytes(data)
    attachment = CardAttachment(
        id=uuid.uuid4().hex,
        cardId=card_id,
        fileName=stored_name,
        displayName=file.filename or stored_name,
        mimeType=ALLOWED_ATTACHMENT_TYPES[ext],
        sizeBytes=len(data),
        uploadedById=user["id"],
    )
    db.add(attachment)
    await db.commit()
    return {
        "attachment": {
            "id": attachment.id,
            "fileName": attachment.displayName,
            "mimeType": attachment.mimeType,
            "sizeBytes": attachment.sizeBytes,
            "url": f"/api/cards/attachments/{attachment.fileName}",
        }
    }


@router.get("/attachments/{stored_name}")
async def serve_card_attachment(
    stored_name: str, user: dict = Depends(get_current_user)
):
    path = (_attachment_dir() / stored_name).resolve()
    if not path.is_relative_to(_attachment_dir().resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Attachment not found"}})
    return FileResponse(str(path))
