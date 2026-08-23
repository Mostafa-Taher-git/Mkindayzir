from typing import Dict, List

ROLES = {
    "ADMIN": "ADMIN",
    "MANAGER": "MANAGER",
    "MEMBER": "MEMBER",
    "VIEWER": "VIEWER",
}

PERMISSIONS = {
    "MANAGE_USERS": "manage:users",
    "MANAGE_TEAMS": "manage:teams",
    "MANAGE_PROJECTS": "manage:projects",
    "MANAGE_WORK_ITEMS": "manage:work_items",
    "MANAGE_BOARDS": "manage:boards",
    "MANAGE_VAULT": "manage:vault",
    "MANAGE_SETTINGS": "manage:settings",
    "VIEW_DASHBOARD": "view:dashboard",
    "VIEW_PROJECTS": "view:projects",
    "VIEW_BOARDS": "view:boards",
    "VIEW_VAULT": "view:vault",
    "VIEW_REPORTS": "view:reports",
    "CREATE_WORK_ITEMS": "create:work_items",
    "EDIT_WORK_ITEMS": "edit:work_items",
    "DELETE_WORK_ITEMS": "delete:work_items",
}

ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "ADMIN": list(PERMISSIONS.values()),
    "MANAGER": [
        PERMISSIONS["VIEW_DASHBOARD"],
        PERMISSIONS["VIEW_PROJECTS"],
        PERMISSIONS["VIEW_BOARDS"],
        PERMISSIONS["VIEW_VAULT"],
        PERMISSIONS["VIEW_REPORTS"],
        PERMISSIONS["MANAGE_PROJECTS"],
        PERMISSIONS["MANAGE_TEAMS"],
        PERMISSIONS["MANAGE_WORK_ITEMS"],
        PERMISSIONS["MANAGE_BOARDS"],
        PERMISSIONS["CREATE_WORK_ITEMS"],
        PERMISSIONS["EDIT_WORK_ITEMS"],
        PERMISSIONS["DELETE_WORK_ITEMS"],
    ],
    "MEMBER": [
        PERMISSIONS["VIEW_DASHBOARD"],
        PERMISSIONS["VIEW_PROJECTS"],
        PERMISSIONS["VIEW_BOARDS"],
        PERMISSIONS["VIEW_VAULT"],
        PERMISSIONS["CREATE_WORK_ITEMS"],
        PERMISSIONS["EDIT_WORK_ITEMS"],
    ],
    "VIEWER": [
        PERMISSIONS["VIEW_DASHBOARD"],
        PERMISSIONS["VIEW_PROJECTS"],
        PERMISSIONS["VIEW_BOARDS"],
        PERMISSIONS["VIEW_VAULT"],
        PERMISSIONS["VIEW_REPORTS"],
    ],
}


def has_permission(role: str, permission: str) -> bool:
    return permission in ROLES.get(role, []) or permission in ROLE_PERMISSIONS.get(role, [])
