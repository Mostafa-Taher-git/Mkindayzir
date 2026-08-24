from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    id: str
    email: str
    displayName: str
    role: str
    status: str
    avatar: Optional[str] = None
    timezone: str
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None


class SessionResponse(BaseModel):
    data: Optional[LoginResponse] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    displayName: str
    password: str


class SetupRequest(BaseModel):
    mode: str
    email: EmailStr
    displayName: str
    password: str
    confirmPassword: str
    # Optional role for team/enterprise setups. Validated against the fixed
    # role set; personal mode always forces ADMIN regardless of this value.
    initialRole: Optional[str] = None


class SetupResponse(BaseModel):
    id: str
    email: str
    displayName: str
    role: str
    autoLoggedIn: bool


class ChangeRoleRequest(BaseModel):
    newRole: str
    confirmation: str
