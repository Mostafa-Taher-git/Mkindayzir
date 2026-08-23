from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime


class VaultFolderCreate(BaseModel):
    parentId: Optional[str] = None
    name: str


class VaultFolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parentId: Optional[str] = None
    name: str
    path: str
    position: int
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None


class VaultNoteCreate(BaseModel):
    folderId: Optional[str] = None
    title: str
    content: str
    status: Optional[str] = "DRAFT"
    metadata: Optional[dict[str, Any]] = None


class VaultNoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    excerpt: Optional[str] = None
    folderId: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class VaultNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    folderId: Optional[str] = None
    title: str
    slug: str
    content: str
    excerpt: Optional[str] = None
    status: str
    authorId: str
    metadata: str
    version: int
    createdAt: str
    updatedAt: str
    publishedAt: Optional[str] = None
    deletedAt: Optional[str] = None
