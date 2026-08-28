from fastapi import APIRouter, Depends, HTTPException, Query
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.board_label import BoardLabel
from app.services.board_service import BoardService

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("/")
async def list_boards(
    spaceId: str | None = Query(None),
    workspace: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        if spaceId:
            items = await BoardService.list(db, spaceId, user)
        else:
            items = await BoardService.list_all(db, user, workspace=workspace)
        return {"boards": items}
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})


@router.get("/{board_id}/labels")
async def list_board_labels(
    board_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(BoardLabel).where(BoardLabel.boardId == board_id).order_by(BoardLabel.createdAt.asc())
    )
    labels = result.scalars().all()
    return {
        "labels": [{"id": l.id, "name": l.name, "color": l.color} for l in labels]
    }


@router.post("/{board_id}/labels", status_code=201)
async def create_board_label(
    board_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = (data or {}).get("name", "").strip()
    color = (data or {}).get("color", "").strip()
    if not name or not color:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "VALIDATION_ERROR", "message": "name and color are required"}
        })
    label = BoardLabel(id=uuid.uuid4().hex, boardId=board_id, name=name[:255], color=color[:50])
    db.add(label)
    await db.commit()
    return {"label": {"id": label.id, "name": label.name, "color": label.color}}


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


@router.post("/{board_id}/star")
async def star_board(board_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Star a board (per-user). Starred boards float to the top of lists."""
    try:
        return await BoardService.set_star(db, board_id, user["id"], True)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Board not found"}})


@router.delete("/{board_id}/star")
async def unstar_board(board_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await BoardService.set_star(db, board_id, user["id"], False)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Board not found"}})


@router.post("/{board_id}/duplicate", status_code=201)
async def duplicate_board(board_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Clone a board (columns + cards) — used for 'create from template'."""
    from app.utils.rbac import has_permission
    if not has_permission(user["role"], "manage:boards"):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    try:
        return {"board": await BoardService.duplicate(db, board_id, data or {}, user)}
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Board not found"}})
