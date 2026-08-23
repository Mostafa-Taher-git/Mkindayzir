from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(user: dict):
    if user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Admin access required"}})


@router.get("/")
async def admin_get(user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"data": None, "path": ""}


@router.post("/")
async def admin_post(user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"data": None, "path": ""}


@router.patch("/")
async def admin_patch(user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"data": None, "path": ""}


@router.delete("/")
async def admin_delete(user: dict = Depends(get_current_user)):
    require_admin(user)
    return {"ok": True, "path": ""}
