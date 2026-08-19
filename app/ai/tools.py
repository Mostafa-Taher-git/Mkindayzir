"""AI agent tool registry + RBAC-checked handlers (Phase 4B).

Every tool runs AS the calling user and passes through the same permission
rules a REST endpoint would (Master Plan rule: "AI tool calls inherit user
RBAC"). The model only ever sees tool *results* - never the raw DB row unless
the handler is allowed to return it.

Tools:
  * search_issues       - query jira_issues (RBAC-scoped visibility)
  * create_issue        - create a jira_issue (any logged-in user)
  * update_issue_status - transition a status (role/owner gated)
  * search_kb           - query kb_notes (requester sees published only)

The handlers return plain dicts (or strings). `execute_tool` normalizes the
result and catches errors so the chat loop never crashes on a tool failure.
"""

import json

from .. import db, config

# Roles allowed to mutate issues / see cross-requester data.
_AGENT_PLUS = (config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)


class ToolError(Exception):
    """Raised by a tool handler when the request is not allowed / invalid.

    `status` is an HTTP-ish code used by the chat client to render the right
    error (e.g. 403 -> forbidden, 400 -> bad input).
    """

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# RBAC visibility helpers
# ---------------------------------------------------------------------------
def _issue_visible_to(user, issue):
    """True if `user` may see the given jira_issue row (mirrors can_view_ticket)."""
    if user["role"] in _AGENT_PLUS:
        return True
    return issue["requester_id"] == user["id"] or issue["assignee_id"] == user["id"]


def _resolve_project(args):
    """Resolve a jira_projects row by id/key, else the first project.

    Returns the row dict, or None when no project can be resolved.
    """
    cur = db.get_db()
    pid = args.get("project_id")
    pkey = (args.get("project_key") or "").strip().upper()
    if pid:
        row = cur.execute(
            "SELECT * FROM jira_projects WHERE id=?", (pid,)
        ).fetchone()
        if row:
            return dict(row)
    if pkey:
        row = cur.execute(
            "SELECT * FROM jira_projects WHERE key=?", (pkey,)
        ).fetchone()
        if row:
            return dict(row)
    # Default: first project (OPS for seeded installs).
    row = cur.execute(
        "SELECT * FROM jira_projects ORDER BY id ASC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------
def search_issues(user, args):
    q = (args.get("q") or "").strip()
    status = (args.get("status") or "").strip()
    if not q:
        raise ToolError("Missing required argument 'q'", 400)

    cur = db.get_db()
    like = f"%{q}%"
    sql = (
        "SELECT * FROM jira_issues "
        "WHERE (summary LIKE ? OR description LIKE ?)"
    )
    params = [like, like]
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY id DESC LIMIT 50"
    rows = cur.execute(sql, params).fetchall()

    issues = []
    for r in rows:
        r = dict(r)
        if not _issue_visible_to(user, r):
            continue
        issues.append({
            "id": r["id"],
            "issue_key": r["issue_key"],
            "summary": r["summary"],
            "status": r["status"],
            "priority": r["priority"],
        })
    return issues


def create_issue(user, args):
    summary = (args.get("summary") or "").strip()
    if not summary:
        raise ToolError("Missing required argument 'summary'", 400)

    description = args.get("description") or ""
    priority = (args.get("priority") or "normal").strip() or "normal"
    if priority not in config.PRIORITIES:
        priority = "normal"

    project = _resolve_project(args)
    if not project:
        raise ToolError("No Jira project available to create the issue", 400)

    cur = db.get_db()
    now = db.now_iso()
    # Atomically increment the project's next sequence for the key.
    seq = project["next_seq"]
    issue_key = f"{project['key']}-{seq}"
    cur.execute(
        "UPDATE jira_projects SET next_seq = next_seq + 1 WHERE id = ?",
        (project["id"],),
    )
    res = cur.execute(
        """INSERT INTO jira_issues
           (issue_key, project_id, issue_type, summary, description,
            priority, status, requester_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (issue_key, project["id"], "Task", summary, description,
         priority, "new", user["id"], now, now),
    )
    iid = res.lastrowid
    cur.commit()
    return {"issue_key": issue_key, "id": iid}


def update_issue_status(user, args):
    issue_key = (args.get("issue_key") or "").strip()
    status = (args.get("status") or "").strip()
    if not issue_key:
        raise ToolError("Missing required argument 'issue_key'", 400)
    if not status:
        raise ToolError("Missing required argument 'status'", 400)

    cur = db.get_db()
    row = cur.execute(
        "SELECT * FROM jira_issues WHERE issue_key=?", (issue_key,)
    ).fetchone()
    if not row:
        raise ToolError(f"Issue {issue_key} not found", 404)
    issue = dict(row)

    allowed = (
        user["role"] in _AGENT_PLUS
        or issue["requester_id"] == user["id"]
        or issue["assignee_id"] == user["id"]
    )
    if not allowed:
        raise ToolError("Not allowed to change this issue", 403)

    cur.execute(
        "UPDATE jira_issues SET status=?, updated_at=? WHERE id=?",
        (status, db.now_iso(), issue["id"]),
    )
    cur.commit()
    return {"issue_key": issue_key, "status": status}


def search_kb(user, args):
    q = (args.get("q") or "").strip()
    if not q:
        raise ToolError("Missing required argument 'q'", 400)

    cur = db.get_db()
    like = f"%{q}%"
    sql = "SELECT * FROM kb_notes WHERE (title LIKE ? OR content LIKE ?)"
    params = [like, like]
    # Requesters see only published notes; agent+ see all.
    if user["role"] == config.ROLE_REQUESTER:
        sql += " AND status='published'"
    sql += " ORDER BY id DESC LIMIT 50"
    rows = cur.execute(sql, params).fetchall()

    notes = [{
        "id": dict(r)["id"],
        "title": dict(r)["title"],
        "status": dict(r)["status"],
    } for r in rows]
    return notes


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
REGISTRY = {
    "search_issues": {
        "name": "search_issues",
        "description": "Search Jira issues by keyword/status",
        "parameters": {
            "type": "object",
            "properties": {
                "q": {"type": "string", "description": "Keyword to match in summary/description"},
                "status": {"type": "string", "description": "Optional status filter"},
            },
            "required": ["q"],
        },
        "requires_confirm": False,
        "handler": search_issues,
    },
    "create_issue": {
        "name": "create_issue",
        "description": "Create a new Jira issue",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Issue summary"},
                "description": {"type": "string", "description": "Issue description"},
                "priority": {"type": "string", "description": "low|normal|high|urgent"},
                "project_id": {"type": "integer", "description": "Project id"},
                "project_key": {"type": "string", "description": "Project key (e.g. OPS)"},
            },
            "required": ["summary"],
        },
        "requires_confirm": True,
        "handler": create_issue,
    },
    "update_issue_status": {
        "name": "update_issue_status",
        "description": "Update the status of a Jira issue",
        "parameters": {
            "type": "object",
            "properties": {
                "issue_key": {"type": "string", "description": "Issue key (e.g. OPS-12)"},
                "status": {"type": "string", "description": "New status"},
            },
            "required": ["issue_key", "status"],
        },
        "requires_confirm": True,
        "handler": update_issue_status,
    },
    "search_kb": {
        "name": "search_kb",
        "description": "Search the knowledge base by keyword",
        "parameters": {
            "type": "object",
            "properties": {
                "q": {"type": "string", "description": "Keyword to match in title/content"},
            },
            "required": ["q"],
        },
        "requires_confirm": False,
        "handler": search_kb,
    },
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------
def list_tool_schemas():
    """Return OpenAI-style function schemas for every registered tool."""
    return [{
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["parameters"],
        },
    } for t in REGISTRY.values()]


def requires_confirm(name):
    """True if the named tool requires explicit user confirmation before run."""
    tool = REGISTRY.get(name)
    return bool(tool and tool.get("requires_confirm"))


def execute_tool(name, user, args):
    """Execute a tool handler and normalize the result.

    Returns:
      * {"error": "unknown tool"}           - name not in REGISTRY
      * {"error": str, "status": int}      - handler raised ToolError
      * {"error": "tool execution failed"}  - unexpected exception
      * {"result": str}                     - handler returned a string
      * <handler dict>                       - handler returned a dict
    """
    tool = REGISTRY.get(name)
    if not tool:
        return {"error": "unknown tool"}
    try:
        result = tool["handler"](user, args or {})
    except ToolError as e:
        return {"error": e.message, "status": e.status}
    except Exception:
        return {"error": "tool execution failed"}

    if isinstance(result, str):
        return {"result": result}
    return result
