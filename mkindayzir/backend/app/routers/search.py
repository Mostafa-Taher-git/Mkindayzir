from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.vault_service import VaultService
from app.services.work_item_service import WorkItemService

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/")
async def global_search(q: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    results = []
    try:
        vault_results = await VaultService.search_notes(db, q, user)
        for note in vault_results:
            results.append({
                "entityType": "vault_note",
                "id": note["id"],
                "title": note["title"],
                "description": note.get("excerpt"),
                "url": f"/vault/notes/{note['id']}",
            })
    except Exception:
        pass
    return {"results": results}
