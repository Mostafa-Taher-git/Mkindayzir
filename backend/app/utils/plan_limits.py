"""
Plan limits — single source of truth for all tiers.

Free:       1 org, up to 5 members, 5 personal boards
Pro:        up to 5 orgs, unlimited members
Enterprise: unlimited everything
All tiers have all app features; Enterprise gets extra future features.
"""

# --- Free ---
FREE_MAX_ORGS = 1  # max orgs a Free user can belong to (owner or member)
FREE_MAX_MEMBERS_PER_ORG = 5  # max members inside one Free org (including owner)
FREE_MAX_BOARDS_PERSONAL = 5  # max boards in personal workspace
FREE_PLAN_NAME = "free"

# --- Pro ---
PRO_MAX_ORGS = 5  # up to 5 orgs, unlimited members
PRO_PLAN_NAME = "pro"

# --- Enterprise ---
ENTERPRISE_PLAN_NAME = "enterprise"
# unlimited = None or very large, checked via is_unlimited helpers
