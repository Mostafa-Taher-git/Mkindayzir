"""
The fixed 6-state ticket lifecycle (BRD §6.2 / PRD §5).

This module is the SINGLE source of truth for which status transitions
are allowed. Editing this dict changes the workflow everywhere.

States: new -> assigned -> in_progress -> resolved -> closed
               |            |                      ^
               |          blocked                 | (auto after 72h, or manual)
               |            |                      |
               +--- reopened (from resolved/closed within window) -> assigned

Transitions are encoded as:  allowed[from_status] = {to_status: reason_required?}
A value of True means the destination requires a "reason" (blocked_reason)
or actor note.
"""
from . import config

# Allowed forward/backward transitions. Keyed by current status.
ALLOWED = {
    config.STATUS_NEW: {
        config.STATUS_ASSIGNED: False,   # someone claims/assigns it
    },
    config.STATUS_ASSIGNED: {
        config.STATUS_IN_PROGRESS: False,
        config.STATUS_BLOCKED: True,     # reason required
        config.STATUS_CLOSED: False,     # manager/admin close w/o work (rare)
    },
    config.STATUS_IN_PROGRESS: {
        config.STATUS_BLOCKED: True,     # reason required
        config.STATUS_RESOLVED: False,
        config.STATUS_ASSIGNED: False,   # reassign
    },
    config.STATUS_BLOCKED: {
        config.STATUS_IN_PROGRESS: False, # dependency cleared
        config.STATUS_ASSIGNED: False,   # reassigned to different owner
    },
    config.STATUS_RESOLVED: {
        config.STATUS_CLOSED: False,
        config.STATUS_REOPENED: False,   # requester reopen path -> then Assigned
    },
    config.STATUS_REOPENED: {
        config.STATUS_ASSIGNED: False,
        config.STATUS_IN_PROGRESS: False,
    },
    config.STATUS_CLOSED: {
        config.STATUS_REOPENED: False,   # reopen within window -> Assigned
    },
}


def can_transition(from_status, to_status):
    """Return (allowed: bool, reason_required: bool)."""
    dests = ALLOWED.get(from_status, {})
    if to_status in dests:
        return True, bool(dests[to_status])
    return False, False


def next_statuses(from_status):
    """List the statuses reachable from `from_status` (for UI buttons)."""
    return list(ALLOWED.get(from_status, {}).keys())


# Friendly labels for display (edit here to rename statuses in the UI).
LABELS = {
    config.STATUS_NEW: "New",
    config.STATUS_ASSIGNED: "Assigned",
    config.STATUS_IN_PROGRESS: "In Progress",
    config.STATUS_BLOCKED: "Blocked",
    config.STATUS_RESOLVED: "Resolved",
    config.STATUS_CLOSED: "Closed",
    config.STATUS_REOPENED: "Reopened",
}

# Semantic color per status, used by the frontend badge mapping.
STATUS_COLOR = {
    config.STATUS_NEW: "neutral",
    config.STATUS_ASSIGNED: "info",
    config.STATUS_IN_PROGRESS: "info",
    config.STATUS_BLOCKED: "warn",
    config.STATUS_RESOLVED: "ok",
    config.STATUS_CLOSED: "muted",
    config.STATUS_REOPENED: "urgent",
}
