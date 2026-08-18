"""
The fixed 6-state ticket lifecycle (BRD §6.2 / PRD §5).

This module is the SINGLE source of truth for which status transitions
are allowed. Editing this dict changes the workflow everywhere.

Since Phase 1A the transitions are also *configurable* per project via the
jira_workflow_transitions table (project_id NULL = the default scheme
seeded from this module). can_transition()/next_statuses() accept an
optional SQLite connection + project_id + role; when given, project-level
override rows take precedence over the defaults in this file.

States: new -> assigned -> in_progress -> resolved -> closed
               |            |                      ^
               |          blocked                 | (auto after 72h, or manual)
               |            |                      |
               +--- reopened (from resolved/closed within window) -> assigned

Transitions are encoded as:  allowed[from_status] = {to_status: reason_required?}
A value of True means the destination requires a "reason" (blocked_reason)
or actor note.
"""
import json
import sqlite3

from . import config

# Allowed forward/backward transitions. Keyed by current status.
ALLOWED = {
    config.STATUS_NEW: {
        config.STATUS_ASSIGNED: False,   # someone claims/assigns it
        config.STATUS_CLOSED: False,     # manager/admin close spam/dupe w/o work
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


def _parse_roles(raw):
    """allowed_roles is a JSON array ('' -> None = any role)."""
    if not raw:
        return None
    try:
        roles = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return roles if isinstance(roles, list) else None


def _effective(from_status, conn=None, project_id=None, role=None):
    """Merged transition map for `from_status`: the default scheme, then
    project-level overrides from jira_workflow_transitions (a project row
    wins for the same pair). `roles=None` on an entry means any role; when
    `role` is passed, entries whose allowed_roles exclude it are dropped.
    """
    scheme = {to: {"reason_required": bool(rr), "roles": None}
              for to, rr in ALLOWED.get(from_status, {}).items()}
    if conn is None:
        return scheme
    try:
        rows = conn.execute(
            "SELECT project_id, to_status, allowed_roles, reason_required "
            "FROM jira_workflow_transitions "
            "WHERE from_status=? AND (project_id IS NULL OR project_id=?)",
            (from_status, project_id or -1)).fetchall()
    except sqlite3.OperationalError:
        return scheme  # table missing (pre-Phase-1A DB without init_db rerun)
    for r in rows:
        meta = {"reason_required": bool(r["reason_required"]),
                "roles": _parse_roles(r["allowed_roles"])}
        if role is not None and meta["roles"] is not None and role not in meta["roles"]:
            scheme.pop(r["to_status"], None)
        else:
            scheme[r["to_status"]] = meta
    return scheme


def can_transition(from_status, to_status, conn=None, project_id=None, role=None):
    """Return (allowed: bool, reason_required: bool).

    Pass `conn` (+ project_id + role) to honour per-project workflow
    overrides; without them this is the fixed default scheme.
    """
    dests = _effective(from_status, conn, project_id, role)
    if to_status in dests:
        return True, bool(dests[to_status]["reason_required"])
    return False, False


def next_statuses(from_status, conn=None, project_id=None, role=None):
    """List the statuses reachable from `from_status` (for UI buttons)."""
    return list(_effective(from_status, conn, project_id, role).keys())


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
