from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ColumnCreate(BaseModel):
    boardId: str
    name: str
    position: Optional[int] = 0
    limit: Optional[int] = None


class ColumnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    boardId: str
    name: str
    position: int
    limit: Optional[int] = None
    createdAt: str
    updatedAt: str
