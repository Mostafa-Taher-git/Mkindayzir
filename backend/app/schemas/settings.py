from pydantic import BaseModel, ConfigDict
from typing import Optional


class ProfileUpdate(BaseModel):
    displayName: Optional[str] = None
    email: Optional[str] = None


class AISettingsUpdate(BaseModel):
    aiProvider: Optional[str] = None
    aiApiKey: Optional[str] = None
    aiModel: Optional[str] = None
    aiBaseUrl: Optional[str] = None
