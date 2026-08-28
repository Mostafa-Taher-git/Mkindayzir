from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.organization_service import OrganizationService


router = APIRouter(prefix="/api/organizations", tags=["organizations"])


def _bad_request(msg: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": msg}})


@router.post("", status_code=201)
async def start_organization(
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"organization": await OrganizationService.start_organization(
            db, user,
            name=data.get("name", ""),
            type_=data.get("type", "team"),
            slug=data.get("slug"),
        )}
    except ValueError as e:
        raise _bad_request(str(e))


@router.get("/mine")
async def get_mine(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await OrganizationService.get_mine(db, user)
    return {"organizations": org.get("organizations", [])}


@router.get("/{org_id}")
async def get_org(
    org_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"organization": await OrganizationService.get(db, user, org_id)}
    except ValueError as e:
        msg = str(e)
        code = "NOT_FOUND" if msg == "not found" else "FORBIDDEN"
        raise HTTPException(status_code=404 if code == "NOT_FOUND" else 403,
                            detail={"error": {"code": code, "message": msg}})


@router.get("/{org_id}/members")
async def list_members(
    org_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"members": await OrganizationService.list_members(db, user, org_id)}
    except ValueError:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "not a member"}})


@router.post("/leave", status_code=200)
async def leave(
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await OrganizationService.leave(db, user, org_id=data.get("orgId", ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})


@router.post("/{org_id}/transfer-ownership", status_code=200)
async def transfer_ownership(
    org_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"organization": await OrganizationService.transfer_ownership(
            db, user, org_id=org_id, new_owner_id=data.get("userId", ""),
        )}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})


@router.delete("/{org_id}/members/{user_id}", status_code=200)
async def remove_member(
    org_id: str,
    user_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await OrganizationService.remove_member(db, user, org_id, user_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})


@router.patch("/{org_id}/members/{user_id}", status_code=200)
async def update_member_role(
    org_id: str,
    user_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"member": await OrganizationService.update_member_role(
            db, user, org_id, user_id, new_role=data.get("role", "member"),
        )}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})


@router.delete("/{org_id}", status_code=200)
async def delete_organization(
    org_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await OrganizationService.delete_organization(db, user, org_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})


@router.post("/{org_id}/transition", status_code=200)
async def transition_type(
    org_id: str,
    data: dict,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return {"organization": await OrganizationService.transition_type(
            db, user, org_id,
            new_type=data.get("newType", ""),
            excluded_member_ids=data.get("excludedMemberIds", []),
        )}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": str(e)}})
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": str(e)}})
