from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class SearchResultItem(BaseModel):
    entityType: str
    id: str
    title: str
    description: Optional[str] = None
    url: Optional[str] = None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
