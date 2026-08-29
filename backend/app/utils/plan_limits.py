"""
Plan limits — single source of truth for Free tier.

Free: 1 organization per user, max 5 members per organization (owner included).
Frontend reads the same values via error messages and can query /api/system/limits if needed.
"""

# Free tier constants
FREE_MAX_ORGS = 1  # max organizations a user can belong to (as member)
FREE_MAX_MEMBERS_PER_ORG = 5  # max members inside one org (including owner)
FREE_PLAN_NAME = "free"
