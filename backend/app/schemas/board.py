from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class BoardCreate(BaseModel):
    spaceId: str
    name: str
    description: Optional[str] = None
    background: Optional[str] = None
    settings: Optional[dict[str, Any]] = None


class BoardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    spaceId: str
    name: str
    description: Optional[str] = None
    background: Optional[str] = None
    settings: str
    position: int
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
