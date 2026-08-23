from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class DashboardSummaryResponse(BaseModel):
    totalProjects: int
    openWorkItems: int
    assignedToMe: int
    overdueItems: int


class WorkloadReportResponse(BaseModel):
    assignee: dict[str, Any]
    items: list[Any]
    count: int


class VelocityReportResponse(BaseModel):
    iteration: dict[str, Any]
    totalPoints: int
    count: int


class TrendReportResponse(BaseModel):
    date: str
    created: int
    resolved: int
