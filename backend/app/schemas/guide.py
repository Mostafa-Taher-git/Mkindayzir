from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class GuideResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    slug: str
    content: str
    category: str
    order: int
    status: str
    createdAt: str
    updatedAt: str
