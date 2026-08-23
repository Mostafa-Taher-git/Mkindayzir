from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Any
from datetime import datetime


class CardCreate(BaseModel):
    columnId: str
    title: str
    description: Optional[str] = None
    dueDate: Optional[datetime] = None
    coverColor: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class CardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    position: Optional[int] = None
    dueDate: Optional[datetime] = None
    coverColor: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class CardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    columnId: str
    title: str
    description: Optional[str] = None
    position: int
    dueDate: Optional[str] = None
    coverColor: Optional[str] = None
    metadata: str = Field(validation_alias="meta", serialization_alias="metadata")
    createdById: str
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
