from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime


class WorkItemCreate(BaseModel):
    projectId: str
    type: str
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    assigneeId: Optional[str] = None
    initiativeId: Optional[str] = None
    iterationId: Optional[str] = None
    parentId: Optional[str] = None
    storyPoints: Optional[int] = None
    dueDate: Optional[datetime] = None


class WorkItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigneeId: Optional[str] = None
    initiativeId: Optional[str] = None
    iterationId: Optional[str] = None
    parentId: Optional[str] = None
    storyPoints: Optional[int] = None
    dueDate: Optional[datetime] = None


class WorkItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    projectId: str
    number: int
    type: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assigneeId: Optional[str] = None
    reporterId: str
    initiativeId: Optional[str] = None
    iterationId: Optional[str] = None
    parentId: Optional[str] = None
    storyPoints: Optional[int] = None
    dueDate: Optional[str] = None
    resolvedAt: Optional[str] = None
    metadata: str
    position: int
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
