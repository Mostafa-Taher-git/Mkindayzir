from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.board_service import BoardService

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("/")
async def list_boards(
    spaceId: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if spaceId:
        items = await BoardService.list(db, spaceId, user)
    else:
        items = await BoardService.list_all(db, user)
    return {"boards": items}


@router.post("/", status_code=201)
async def create_board(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:boards"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    return await BoardService.create(db, data, user)


@router.get("/{board_id}")
async def get_board(board_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return {"board": await BoardService.get_by_id(db, board_id, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Board not found"}})


@router.patch("/{board_id}")
async def update_board(board_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:boards"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return {"board": await BoardService.update(db, board_id, data, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Board not found"}})


@router.delete("/{board_id}")
async def delete_board(board_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:boards"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return await BoardService.delete(db, board_id, user)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Board not found"}})
