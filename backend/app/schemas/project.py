from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class ProjectCreate(BaseModel):
    key: Optional[str] = None
    name: str
    description: Optional[str] = None
    teamId: Optional[str] = None
    settings: Optional[dict[str, Any]] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    leadId: Optional[str] = None
    settings: Optional[dict[str, Any]] = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    name: str
    description: Optional[str] = None
    status: str
    leadId: Optional[str] = None
    teamId: Optional[str] = None
    settings: str
    createdById: str
    createdAt: str
    updatedAt: str
