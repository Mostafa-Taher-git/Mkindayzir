from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.card_service import CardService

router = APIRouter(prefix="/api/cards", tags=["cards"])


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
