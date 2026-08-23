from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.checklist_service import ChecklistService

router = APIRouter(prefix="/api/checklists", tags=["checklists"])


@router.get("/{checklist_id}")
async def get_checklist(checklist_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"checklist": await ChecklistService.get(db, checklist_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist not found"}})


@router.patch("/{checklist_id}")
async def update_checklist(checklist_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"checklist": await ChecklistService.update(db, checklist_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist not found"}})


@router.delete("/{checklist_id}")
async def delete_checklist(checklist_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ChecklistService.delete(db, checklist_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist not found"}})


@router.post("/checklist-items", status_code=201)
async def create_checklist_item(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ChecklistService.create_item(db, data["checklistId"], data, user)


@router.get("/checklist-items/{item_id}")
async def get_checklist_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ChecklistService.get_item(db, item_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist item not found"}})


@router.patch("/checklist-items/{item_id}")
async def update_checklist_item(item_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ChecklistService.update_item(db, item_id, data, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist item not found"}})


@router.delete("/checklist-items/{item_id}")
async def delete_checklist_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ChecklistService.delete_item(db, item_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist item not found"}})


@router.post("/checklist-items/{item_id}/toggle")
async def toggle_checklist_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ChecklistService.toggle_item(db, item_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Checklist item not found"}})
