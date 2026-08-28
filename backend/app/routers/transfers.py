from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.transfer_service import TransferService


router = APIRouter(prefix="/api/transfers", tags=["transfers"])


@router.get("/preview")
async def preview(
    direction: str,
    orgId: str | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if direction == "to_org":
        return await TransferService.preview_personal(db, user)
    if direction == "from_org":
        if not orgId:
            raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": "orgId required"}})
        try:
            return await TransferService.preview_org(db, user, orgId)
        except ValueError as e:
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": "direction must be to_org or from_org"}})


@router.post("/to-org", status_code=200)
async def transfer_to_org(
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = data.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": "orgId required"}})
    try:
        return await TransferService.transfer_to_org(
            db, user, org_id,
            project_ids=data.get("projectIds", []),
            space_ids=data.get("spaceIds", []),
            note_ids=data.get("noteIds", []),
            ticket_ids=data.get("ticketIds", []),
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})


@router.post("/from-org", status_code=200)
async def transfer_from_org(
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = data.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": "orgId required"}})
    try:
        return await TransferService.transfer_from_org(
            db, user, org_id,
            project_ids=data.get("projectIds", []),
            space_ids=data.get("spaceIds", []),
            note_ids=data.get("noteIds", []),
            ticket_ids=data.get("ticketIds", []),
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})


@router.get("/history")
async def history(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return {"transfers": await TransferService.history(db, user)}
