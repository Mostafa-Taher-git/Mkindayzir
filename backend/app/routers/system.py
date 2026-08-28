import re

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.database import get_db
from app.middleware.auth import get_current_user
from app.config import settings
from app.version import APP_VERSION

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
async def system_status(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Current system status: version and PostgreSQL database details."""
    size_mb = 0.0
    try:
        result = await db.execute(text("SELECT pg_database_size(current_database())"))
        row = result.first()
        if row:
            size_mb = round(row[0] / (1024 * 1024), 2)
    except Exception:
        size_mb = 0.0

    return {
        "version": APP_VERSION,
        "database_provider": "postgres",
        "database_url": re.sub(r"(://[^:@/]+:)[^@/]+@", r"\1***@", settings.DATABASE_URL),
        "database_size_mb": size_mb,
    }
