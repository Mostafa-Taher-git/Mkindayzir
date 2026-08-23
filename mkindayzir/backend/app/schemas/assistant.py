from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime


class ConversationCreate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    userId: str
    title: Optional[str] = None
    model: Optional[str] = None
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
    messages: Optional[list[Any]] = None


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversationId: str
    role: str
    content: str
    toolCalls: Optional[str] = None
    toolResults: Optional[str] = None
    model: Optional[str] = None
    tokens: Optional[int] = None
    createdAt: str


class SendMessageRequest(BaseModel):
    content: str
    model: Optional[str] = None


class AISettingsResponse(BaseModel):
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None
    aiApiKey: Optional[str] = None
