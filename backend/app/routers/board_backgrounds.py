"""
Board background image upload.

Stores the image inside DATA_DIR/uploads/board-backgrounds and returns the
served URL (/api/board-backgrounds/<filename>) plus a recommended overlay
strength based on file size/type. Served with cache headers so boards paint
fast.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/board-backgrounds", tags=["board-backgrounds"])

ALLOWED = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
           ".webp": "image/webp", ".gif": "image/gif"}
MAX_BYTES = 8 * 1024 * 1024  # 8 MB


def _dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "board-backgrounds"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("")
async def upload_background(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "INVALID_TYPE",
                      "message": f"Unsupported image type {ext or '(none)'}. Use JPG, PNG, WEBP or GIF."}
        })
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "TOO_LARGE", "message": "Image must be 8 MB or smaller."}
        })

    name = f"{uuid.uuid4().hex}{ext}"
    path = _dir() / name
    path.write_bytes(data)

    return {
        "url": f"/api/board-backgrounds/{name}",
        "fileName": name,
        "sizeBytes": len(data),
    }


@router.get("/{name}")
async def serve_background(name: str, user: dict = Depends(get_current_user)):
    # basic path-safety: reject anything with separators
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Bad filename")
    path = _dir() / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media = ALLOWED.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(str(path), media_type=media, headers={
        "Cache-Control": "public, max-age=31536000, immutable",
    })
