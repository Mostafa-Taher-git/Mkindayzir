from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class SpaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    visibility: Optional[str] = "PRIVATE"


class SpaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    visibility: str
    createdById: str
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
