from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.column_service import ColumnService

router = APIRouter(prefix="/api/boards/{board_id}/columns", tags=["columns"])


@router.get("/")
async def list_columns(board_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ColumnService.list(db, board_id, user)


@router.post("/", status_code=201)
async def create_column(board_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data["boardId"] = board_id
    return await ColumnService.create(db, data, user)


@router.patch("/{column_id}")
async def update_column(column_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ColumnService.update(db, column_id, data, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Column not found"}})


@router.delete("/{column_id}")
async def delete_column(column_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ColumnService.delete(db, column_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Column not found"}})


@router.post("/{column_id}/reorder")
async def reorder_columns(column_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ColumnService.reorder(db, column_id, data.get("orderedIds", []), user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Column not found"}})
