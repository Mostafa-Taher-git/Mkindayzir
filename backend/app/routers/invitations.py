from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.invitation_service import InvitationService


router = APIRouter(prefix="/api/invitations", tags=["invitations"])


def _bad_request(msg: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": msg}})


def _forbidden(msg: str) -> HTTPException:
    return HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": msg}})


@router.post("", status_code=201)
async def create_invitation(
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"invitation": await InvitationService.invite(
            db, user,
            org_id=data.get("orgId", ""),
            email=data.get("email", ""),
            role=data.get("role", "member"),
        )}
    except PermissionError as e:
        raise _forbidden(str(e))
    except ValueError as e:
        raise _bad_request(str(e))


@router.get("/pending")
async def list_my_pending(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return {"invitations": await InvitationService.list_my_pending(db, user)}


@router.get("/org/{org_id}")
async def list_org_invitations(
    org_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"invitations": await InvitationService.list_org_invitations(db, user, org_id)}
    except PermissionError as e:
        raise _forbidden(str(e))
    except ValueError as e:
        raise _bad_request(str(e))


@router.post("/{token}/accept", status_code=200)
async def accept_invitation(
    token: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await InvitationService.accept(db, user, token)
    except PermissionError as e:
        raise _forbidden(str(e))
    except ValueError as e:
        raise _bad_request(str(e))


@router.post("/{token}/decline", status_code=200)
async def decline_invitation(
    token: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"invitation": await InvitationService.decline(db, user, token)}
    except PermissionError as e:
        raise _forbidden(str(e))
    except ValueError as e:
        raise _bad_request(str(e))


@router.delete("/{invitation_id}", status_code=200)
async def revoke_invitation(
    invitation_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"invitation": await InvitationService.revoke(db, user, invitation_id)}
    except PermissionError as e:
        raise _forbidden(str(e))
    except ValueError as e:
        raise _bad_request(str(e))
