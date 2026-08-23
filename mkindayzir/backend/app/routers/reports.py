from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.report_service import ReportService

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/")
async def get_report(
    type: str = Query("summary"),
    projectId: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if type == "summary":
        data = await ReportService.get_dashboard_summary(db, user["id"], user)
    elif type == "workload":
        data = await ReportService.get_workload_report(db, user)
    elif type == "velocity":
        data = await ReportService.get_velocity_report(db, user, projectId)
    elif type == "trends":
        data = await ReportService.get_trend_report(db, user)
    else:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_ERROR", "message": "Invalid report type"}})
    return {"data": data}


@router.get("/export")
async def export_report(
    projectId: str | None = Query(None),
    status: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    csv_content = await ReportService.export_csv(db, user, {"projectId": projectId, "status": status})
    from fastapi.responses import Response
    return Response(content=csv_content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=work-items.csv"})
