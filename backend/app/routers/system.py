from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import uuid
import json

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.migration_service import MigrationService

router = APIRouter(prefix="/api/system", tags=["system"])
migration_service = MigrationService()


@router.get("/migration/status")
async def get_migration_status(user: dict = Depends(get_current_user)):
    """Get current mode and DB stats."""
    from app.config import settings

    db_path = Path(settings.data_dir) / "mkindayzir.db"
    db_size = db_path.stat().st_size if db_path.exists() else 0

    return {
        "mode": settings.MKINDAYZIR_MODE,
        "database_provider": settings.DATABASE_PROVIDER,
        "database_url": settings.DATABASE_URL,
        "database_size_mb": round(db_size / (1024 * 1024), 2),
        "can_migrate": False,  # legacy SQLite import handled via CLI only
    }


@router.post("/migration/test-connection")
async def test_connection(data: dict, user: dict = Depends(get_current_user)):
    """Test PostgreSQL connection."""
    pg_url = data.get("database_url")
    if not pg_url:
        raise HTTPException(400, "database_url is required")
    result = await migration_service.test_connection(pg_url)
    return result


@router.post("/migration/pre-check")
async def pre_check(data: dict, user: dict = Depends(get_current_user)):
    """Run pre-migration checks."""
    pg_url = data.get("database_url")
    if not pg_url:
        raise HTTPException(400, "database_url is required")
    result = await migration_service.pre_check(pg_url)
    return result


@router.post("/migration/start")
async def start_migration(data: dict, user: dict = Depends(get_current_user)):
    """Begin migration (Server-Sent Events stream)."""
    pg_url = data.get("database_url")
    if not pg_url:
        raise HTTPException(400, "database_url is required")

    job_id = str(uuid.uuid4())
    migration_service.register_job(job_id)

    async def event_generator():
        try:
            async for progress in migration_service.start_migration(job_id, pg_url):
                yield f"data: {json.dumps(progress)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step': 'error', 'status': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/migration/progress/{job_id}")
async def migration_progress(job_id: str, user: dict = Depends(get_current_user)):
    """Stream live migration progress for a job as SSE."""
    progress = await migration_service.get_progress(job_id)
    if progress is None:
        raise HTTPException(404, "Unknown migration job_id")

    async def event_generator():
        async for step in migration_service.subscribe_progress(job_id):
            yield f"data: {json.dumps(step)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/migration/rollback")
async def rollback_migration(user: dict = Depends(get_current_user)):
    """Rollback to SQLite / personal mode."""
    result = await migration_service.rollback()
    return result
