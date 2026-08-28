from pydantic import BaseModel


class ChangeRoleRequest(BaseModel):
    newRole: str
    confirmation: str
