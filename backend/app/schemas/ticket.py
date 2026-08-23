from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Any, List
from datetime import datetime


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    priority: str = "MEDIUM"
    category: Optional[str] = "GENERAL"
    customerId: Optional[str] = None
    assigneeId: Optional[str] = None
    projectId: Optional[str] = None
    dueDate: Optional[datetime] = None
    tags: List[str] = []
    metadata: Optional[dict[str, Any]] = None
    source: Optional[str] = "INTERNAL"


class TicketUpdate(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assigneeId: Optional[str] = None
    customerId: Optional[str] = None
    projectId: Optional[str] = None
    dueDate: Optional[datetime] = None
    tags: Optional[List[str]] = None
    metadata: Optional[dict[str, Any]] = None


class TicketAssignRequest(BaseModel):
    assigneeId: Optional[str] = None


class TicketReplyCreate(BaseModel):
    content: str = Field(..., min_length=1)
    isInternal: bool = False
    type: Optional[str] = "REPLY"


class TicketReplyUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class UserSummary(BaseModel):
    id: str
    displayName: str
    email: Optional[str] = None
    avatar: Optional[str] = None


class CustomerSummary(BaseModel):
    id: str
    displayName: str
    email: str
    company: Optional[str] = None
    avatar: Optional[str] = None


class ProjectSummary(BaseModel):
    id: str
    name: str
    key: str


class TicketReplyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ticketId: str
    authorId: Optional[str] = None
    customerId: Optional[str] = None
    content: str
    isInternal: bool
    type: str
    createdAt: str
    updatedAt: Optional[str] = None
    author: Optional[UserSummary] = None
    customer: Optional[CustomerSummary] = None


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: int
    subject: str
    description: str
    status: str
    priority: str
    category: Optional[str] = None
    source: str
    customerId: Optional[str] = None
    assigneeId: Optional[str] = None
    createdById: str
    projectId: Optional[str] = None
    firstResponseAt: Optional[str] = None
    resolvedAt: Optional[str] = None
    closedAt: Optional[str] = None
    dueDate: Optional[str] = None
    slaBreached: bool = False
    tags: List[str] = []
    metadata: dict[str, Any] = {}
    position: int = 0
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
    assignee: Optional[UserSummary] = None
    customer: Optional[CustomerSummary] = None
    creator: Optional[UserSummary] = None
    project: Optional[ProjectSummary] = None
    replyCount: int = 0
    replies: Optional[List[TicketReplyResponse]] = None


class TicketListResponse(BaseModel):
    items: List[TicketResponse]
    page: int
    perPage: int
    total: int
    totalPages: int


class TicketStatsResponse(BaseModel):
    totalCount: int
    openCount: int
    waitingCount: int
    resolvedCount: int
    closedCount: int
    slaBreachedCount: int
    urgentCount: int
