"""
Jira issue routes: the core lifecycle of OpsDesk Enterprise (Phase 1A).

Endpoints:
  GET  /api/jira/issues        -> list (filtered, RBAC-scoped)
  POST /api/jira/issues        -> create (requester or any)
  GET  /api/jira/issues/<id>   -> detail (RBAC)
  PATCH /api/jira/issues/<id>  -> edit
  POST /api/jira/issues/<id>/assign
  POST /api/jira/issues/<id>/status
  POST /api/jira/issues/<id>/reopen
  POST /api/jira/issues/<id>/priority
  POST /api/jira/issues/<id>/comments
  POST /api/jira/issues/<id>/attachments
  GET  /api/jira/issues/<id>/attachments/<att_id>
  GET  /api/jira/issues/<id>/followers
  POST /api/jira/issues/<id>/follow
  DELETE /api/jira/issues/<id>/follow
  GET  /api/jira/issues/<id>/knowledge        (+ POST/DELETE, suggested)
  POST /api/jira/issues/<id>/promote-kb
  POST /api/jira/issues/bulk
  GET  /api/dashboard          -> manager/agent aggregates
  GET  /api/meta               -> teams, categories, statuses, priorities (for forms)

Uses the polymorphic shared tables (entity_comments, entity_attachments,
entity_activity, entity_followers, entity_links) with entity_type='jira_issue',
and jira_issues / issue_sla / jira_projects for the issues themselves.
"""
import os
import re
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify, send_file, abort

from . import db, config, helpers
from .helpers import login_required, is_agent_or_manager, can_view_ticket, csrf_protect
from . import lifecycle
from . import notifications
from . import routes_sla as sla

jira = Blueprint("jira", __name__)

ENTITY_TYPE = "jira_issue"

# Simple attachment magic-byte guard (stdlib only). This does NOT need
# python-magic; it checks a small whitelist of known file signatures
# against the first 32 bytes and rejects obvious mismatches.
_MAGIC = {
    # images
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "gif": (b"GIF87a", b"GIF89a"),
    "bmp": (b"BM",),
    "webp": (b"RIFF",),  # simplistic; actual container/type is later
    "svg": (b"<svg", b"<?xml"),
    "tiff": (b"II", b"MM"),
    # docs/archives
    "pdf": (b"%PDF-",),
    "doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    "xls": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    "docx": (b"PK\x03\x04",),
    "xlsx": (b"PK\x03\x04",),
    "pptx": (b"PK\x03\x04",),
    "zip": (b"PK\x03\x04",),
    "rar": (b"Rar!\x1a\x07\x00",),
    "7z": (b"7z\xbc\xaf\x27\x1c",),
    "txt": (None,),  # text-like: require UTF-8 printable or empty
}

def _detect_upload_type(head: bytes, ext: str):
    if not head:
        return "ok", "empty"
    ext = ext.lower().lstrip(".")
    candidates = _MAGIC.get(ext, (None,))
    if candidates == (None,):
        # text/plain-ish fallback: allow printable/UTF-8-only payloads
        try:
            head.decode("utf-8")
            return "ok", "text"
        except UnicodeDecodeError:
            return "Invalid file content for extension", ext
    for sig in candidates:
        if sig and head.startswith(sig):
            return "ok", ext
    return f"File content does not match {ext} format", ext


# ---------------------------------------------------------------------------
# Listing & detail
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues")
@login_required
def list_issues():
    user = request.current_user
    # Select issue columns plus the SLA/policy columns via the LEFT JOIN so the
    # list serializes SLA state without a per-row extra SELECT (no N+1).
    # NOTE: SQLite requires JOINs before the WHERE clause.
    q = ["SELECT t.*, ts.first_response_at, ts.breach_at, ts.breached, "
         "ts.response_met, ts.resolution_met, sp.name AS policy_name, "
         "sp.response_hours, sp.resolution_hours "
         "FROM jira_issues t "
         "LEFT JOIN issue_sla ts ON ts.issue_id = t.id "
         "LEFT JOIN sla_policies sp ON sp.id = ts.policy_id"]
    where, params = [], []

    # RBAC scoping (FR-21)
    if user["role"] == config.ROLE_REQUESTER:
        where.append("t.requester_id = ?")
        params.append(user["id"])
    elif user["role"] == config.ROLE_AGENT:
        # see own team's queue; also anything unassigned
        where.append("(t.team_id = ? OR t.team_id IS NULL)")
        params.append(user["team_id"])

    # Filters from query string
    for col, val in (("status", request.args.get("status")),
                     ("priority", request.args.get("priority")),
                     ("category_id", request.args.get("category_id")),
                     ("team_id", request.args.get("team_id"))):
        if val:
            where.append(f"t.{col} = ?")
            params.append(val)

    assignee_filter = request.args.get("assignee_id")
    if assignee_filter == "me":
        where.append("t.assignee_id = ?")
        params.append(user["id"])
    elif assignee_filter == "unassigned":
        where.append("t.assignee_id IS NULL")
    elif assignee_filter:
        where.append("t.assignee_id = ?")
        params.append(assignee_filter)

    search = request.args.get("q")
    if search:
        where.append("(t.summary LIKE ? OR t.description LIKE ? OR t.issue_key LIKE ?)")
        like = f"%{search}%"
        params += [like, like, like]

    base = " ".join(q)
    if where:
        base += " WHERE " + " AND ".join(where)
    base += " ORDER BY t.updated_at DESC"
    rows = db.get_db().execute(base, params).fetchall()

    page = max(1, int(request.args.get("page", "1") or "1"))
    per_page = max(1, min(100, int(request.args.get("per_page", "25") or "25")))
    total = len(rows)
    start = (page - 1) * per_page
    page_rows = rows[start:start + per_page]
    return jsonify(
        issues=[_serialize(t, sla_row=t) for t in page_rows],
        pagination={"page": page, "per_page": per_page, "total": total, "pages": max(1, (total + per_page - 1) // per_page)},
    )


@jira.route("/api/jira/issues/<int:iid>")
@login_required
def get_issue(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    out = _serialize(t)
    out["comments"] = _comments_for(iid, user)
    out["attachments"] = _attachments_for(iid)
    out["activity"] = _activity_for(iid)
    out["allowed_transitions"] = lifecycle.next_statuses(t["status"])
    return jsonify(issue=out)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues", methods=["POST"])
@login_required
@csrf_protect
def create_issue():
    data = request.get_json(silent=True) or {}
    summary = (data.get("summary") or data.get("subject") or "").strip()
    description = data.get("description") or ""
    category_id = data.get("category_id")
    priority = data.get("priority") or config.PRIORITY_NORMAL
    team_id = data.get("team_id")

    if not summary:
        return jsonify(error="Summary is required"), 400
    if len(summary) > config.MAX_SUBJECT:
        return jsonify(error=f"Summary must be {config.MAX_SUBJECT} characters or fewer"), 400
    if len(description) > config.MAX_DESCRIPTION:
        return jsonify(error=f"Description must be {config.MAX_DESCRIPTION} characters or fewer"), 400
    if priority not in config.PRIORITIES:
        return jsonify(error="Invalid priority"), 400
    if category_id is not None:
        cat = db.get_db().execute(
            "SELECT id, default_team_id, active FROM categories WHERE id=?", (category_id,)).fetchone()
        if not cat or not cat["active"]:
            return jsonify(error="Unknown or inactive category"), 400

    # Authoritative category -> team routing. Agents/managers may route to an
    # explicit team; requesters CANNOT (the client-sent team_id is ignored for
    # them) so a Hardware issue can't be parked in Finance.
    if helpers.is_agent_or_manager(request.current_user):
        effective_team = team_id
    else:
        effective_team = None
    if not effective_team:
        cat = db.get_db().execute(
            "SELECT default_team_id FROM categories WHERE id=?", (category_id,)).fetchone()
        if cat and cat["default_team_id"]:
            effective_team = cat["default_team_id"]
    team_id = effective_team

    # Requester is whoever is logged in, UNLESS an agent/manager creates on
    # behalf of someone else. A plain requester can never set requester_id.
    if helpers.is_agent_or_manager(request.current_user) and data.get("requester_id"):
        requester_id = data.get("requester_id")
    else:
        requester_id = request.current_user["id"]

    project = db.get_db().execute(
        "SELECT id FROM jira_projects WHERE key='OPS'").fetchone()
    project_id = project["id"] if project else _ensure_project()
    key, seq = _next_key()
    now = db.now_iso()
    cur = db.get_db().execute(
        """INSERT INTO jira_issues
           (issue_key, project_id, issue_type, summary, description,
            category_id, requester_id, assignee_id, team_id,
            priority, status, reopen_count, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (key, project_id, "Task", summary, description, category_id,
         requester_id, None, team_id, priority, config.STATUS_NEW, 0, now, now),
    )
    db.get_db().execute(
        "UPDATE jira_projects SET next_seq=? WHERE id=?", (seq + 1, project_id))
    db.get_db().commit()
    iid = cur.lastrowid
    _log(iid, request.current_user["id"], "created", note=f"Issue {key} created")
    # Phase 3: attach the matching SLA policy (once) at creation time.
    sla.attach_sla(_fetch(iid))
    return jsonify(issue=_serialize(_fetch(iid))), 201


# ---------------------------------------------------------------------------
# Edit (staff always; requester while the issue is still new)
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>", methods=["PATCH"])
@login_required
@csrf_protect
def update_issue(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    if user["role"] == config.ROLE_REQUESTER:
        # Requesters may only fix their own issue while it is still unassigned.
        if t["requester_id"] != user["id"] or t["status"] != config.STATUS_NEW:
            return jsonify(error="Forbidden"), 403
    elif not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    data = request.get_json(silent=True) or {}
    summary = (data.get("summary") or data.get("subject") or t["summary"]).strip()
    description = data.get("description", t["description"]) or ""
    category_id = data.get("category_id", t["category_id"])
    team_id = data.get("team_id", t["team_id"])

    if not summary:
        return jsonify(error="Summary is required"), 400
    if len(summary) > config.MAX_SUBJECT:
        return jsonify(error=f"Summary must be {config.MAX_SUBJECT} characters or fewer"), 400
    if len(description) > config.MAX_DESCRIPTION:
        return jsonify(error=f"Description must be {config.MAX_DESCRIPTION} characters or fewer"), 400
    if category_id is not None:
        cat = db.get_db().execute(
            "SELECT id, default_team_id, active FROM categories WHERE id=?", (category_id,)).fetchone()
        if not cat or not cat["active"]:
            return jsonify(error="Unknown or inactive category"), 400

    # Category change re-routes to the category's default team (staff may
    # override with an explicit team; requesters get the default).
    effective_team = t["team_id"]
    if category_id != t["category_id"]:
        if is_agent_or_manager(user) and team_id:
            effective_team = team_id
        else:
            cat = db.get_db().execute(
                "SELECT default_team_id FROM categories WHERE id=?", (category_id,)).fetchone()
            effective_team = cat["default_team_id"] if cat else None

    db.get_db().execute(
        """UPDATE jira_issues SET summary=?, description=?, category_id=?,
           team_id=?, updated_at=? WHERE id=?""",
        (summary, description, category_id, effective_team, db.now_iso(), iid),
    )
    db.get_db().commit()
    _log(iid, user["id"], "updated", note=f"Issue edited by {user['name']}")
    # Category/team change may invalidate the SLA policy -> re-pick it.
    if category_id != t["category_id"] or effective_team != t["team_id"]:
        sla.update_sla_on_priority(iid, category_id, t["priority"])
    return jsonify(issue=_serialize(_fetch(iid)))


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/assign", methods=["POST"])
@login_required
@csrf_protect
def assign(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    data = request.get_json(silent=True) or {}
    assignee_id = data.get("assignee_id")
    team_id = data.get("team_id")

    if data.get("unassign"):
        assignee_id = None
        team_id = None
        to_status = config.STATUS_NEW
    else:
        # Self-assign shortcut: agent clicks "claim" with no body.
        if not assignee_id and data.get("self"):
            assignee_id = user["id"]
            team_id = team_id or user["team_id"]

        if assignee_id:
            a = db.get_db().execute(
                "SELECT id, team_id FROM users WHERE id = ?", (assignee_id,)
            ).fetchone()
            if not a:
                return jsonify(error="Unknown assignee"), 400
            team_id = team_id or a["team_id"]
        to_status = config.STATUS_ASSIGNED if assignee_id else t["status"]

    db.get_db().execute(
        "UPDATE jira_issues SET assignee_id=?, team_id=?, status=?,\
         updated_at=? WHERE id=?",
        (assignee_id, team_id, to_status, db.now_iso(), iid),
    )
    db.get_db().commit()
    who = "self" if data.get("self") else (f"user {assignee_id}" if assignee_id else "unassigned")
    _log(iid, user["id"], "assigned", t["status"], to_status,
         note=f"Assigned to {who}")
    # Phase 3: an agent acting on the issue counts as the first response.
    if assignee_id and t["requester_id"] != user["id"]:
        sla.record_first_response(iid)
    # Phase 1: tell the requester their issue was picked up.
    if assignee_id and t["requester_id"] != user["id"]:
        assignee_name = db.get_db().execute(
            "SELECT name FROM users WHERE id=?", (assignee_id,)).fetchone()
        an = assignee_name["name"] if assignee_name else "an agent"
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "assigned",
            f"Your issue “{t['summary']}” was assigned to {an}.",
            email_subject=f"OpsDesk: issue {t['issue_key']} assigned",
            email_body=f"Hi,\n\nYour issue '{t['summary']}' ({t['issue_key']}) was assigned to {an}.\nView it here: {config.APP_BASE_URL}/#/ticket/{iid}\n")
    # Watchers: the assignee follows (they own it now); followers get notified.
    if assignee_id:
        db.get_db().execute(
            "INSERT OR IGNORE INTO entity_followers (entity_type, entity_id, user_id, created_at) VALUES (?,?,?,?)",
            (ENTITY_TYPE, iid, assignee_id, db.now_iso()))
        db.get_db().commit()
    _notify_followers(iid, user["id"], "assigned",
                      f"Issue “{t['summary']}” was assigned." if assignee_id else f"Issue “{t['summary']}” was unassigned.")
    return jsonify(issue=_serialize(_fetch(iid)))


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/status", methods=["POST"])
@login_required
@csrf_protect
def change_status(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    data = request.get_json(silent=True) or {}
    to = data.get("status")
    note = data.get("note") or data.get("blocked_reason") or ""

    allowed, reason_required = lifecycle.can_transition(t["status"], to)
    if not allowed:
        return jsonify(error=f"Cannot move from {t['status']} to {to}"), 400
    if reason_required and not note:
        return jsonify(error="A reason is required for this transition"), 400

    # Reopen handling
    reopened = False
    if to == config.STATUS_REOPENED:
        # Only requester (within window) or manager/admin may reopen; the /reopen
        # route already enforces requester ownership + window, so here we only
        # need the window check for requesters.
        if user["role"] == config.ROLE_REQUESTER:
            if not _within_reopen_window(t):
                return jsonify(error="Reopen window has passed"), 400
        reopened = True

    now = db.now_iso()
    # Carry forward existing timestamps; only overwrite the one this transition
    # sets. Previously EVERY non-blocked transition cleared blocked_reason,
    # erasing why an issue had been blocked.
    resolved_at = t["resolved_at"]
    closed_at = t["closed_at"]
    blocked_reason = t["blocked_reason"]
    if to == config.STATUS_RESOLVED:
        resolved_at = now
    if to == config.STATUS_CLOSED:
        closed_at = now
    if to == config.STATUS_BLOCKED:
        blocked_reason = note
    # Note: on all other transitions blocked_reason is preserved, not nulled.

    # reopen_count: bump for ANY newly-reopened issue (requester path already
    # bumps in /reopen, so don't double-count there). This keeps the reopen
    # SLA metric accurate for manager/admin reopened issues too.
    reopen_bump = 1 if (reopened and t["status"] != config.STATUS_REOPENED) else 0

    final_status = config.STATUS_ASSIGNED if reopened else to

    db.get_db().execute(
        """UPDATE jira_issues SET status=?, blocked_reason=?, resolved_at=?,
           closed_at=?, reopen_count = reopen_count + ?, updated_at=? WHERE id=?""",
        (final_status, blocked_reason, resolved_at, closed_at, reopen_bump, now, iid),
    )
    db.get_db().commit()
    _log(iid, user["id"], "status_change", t["status"], final_status,
         note=note or None)
    # Phase 3: evaluate SLA when the issue is resolved or closed (closed
    # without resolving is still a terminal state that must lock in SLA results).
    if final_status in (config.STATUS_RESOLVED, config.STATUS_CLOSED):
        sla.evaluate_on_resolve(iid)
    # Phase 1: notify the requester when their issue is resolved.
    if to == config.STATUS_RESOLVED and t["requester_id"] != user["id"]:
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "resolved",
            f"Your issue “{t['summary']}” was marked resolved. Reply if it’s not fixed.",
            email_subject=f"OpsDesk: issue {t['issue_key']} resolved",
            email_body=f"Hi,\n\nYour issue '{t['summary']}' ({t['issue_key']}) was marked resolved.\nIf the issue isn't actually fixed, just reply in the issue: {config.APP_BASE_URL}/#/ticket/{iid}\n")
    # Phase 1: notify the requester when their issue is blocked.
    if to == config.STATUS_BLOCKED and t["requester_id"] != user["id"] and note:
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "blocked",
            f"Your issue “{t['summary']}” is now blocked: {note}.")
    # Phase 1: notify the requester when their issue is reopened by an agent.
    if to == config.STATUS_REOPENED and t["requester_id"] != user["id"]:
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "reopened",
            f"Your issue “{t['summary']}” was reopened. It is back in the queue.")
    # Watchers: keep followers in the loop on every status change.
    _notify_followers(iid, user["id"], "status_change",
                      f"Issue “{t['summary']}” is now {lifecycle.LABELS.get(final_status, final_status)}.")
    return jsonify(issue=_serialize(_fetch(iid)))


# ---------------------------------------------------------------------------
# Reopen (requester path, separate & explicit per FR-07)
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/reopen", methods=["POST"])
@login_required
@csrf_protect
def reopen(iid):
    t = _fetch(iid)
    if not t:
        return jsonify(error="Not found"), 404
    user = request.current_user
    if user["role"] == config.ROLE_REQUESTER and t["requester_id"] != user["id"]:
        return jsonify(error="Forbidden"), 403
    if t["status"] not in (config.STATUS_RESOLVED, config.STATUS_CLOSED):
        return jsonify(error="Only resolved/closed issues can be reopened"), 400
    if user["role"] == config.ROLE_REQUESTER and not _within_reopen_window(t):
        return jsonify(error="Reopen window has passed"), 400

    now = db.now_iso()
    db.get_db().execute(
        """UPDATE jira_issues SET status=?, reopen_count = reopen_count + 1,
           updated_at=? WHERE id=?""",
        (config.STATUS_REOPENED, now, iid),
    )
    db.get_db().commit()
    _log(iid, user["id"], "reopened", t["status"], config.STATUS_REOPENED)
    # Phase 1: notify the requester that their issue was reopened by a staff member.
    if t["requester_id"] != user["id"]:
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "reopened",
            f"Your issue “{t['summary']}” was reopened. It is back in the queue.")
    # After reopen it sits in 'reopened'; assign routes it onward.
    return jsonify(issue=_serialize(_fetch(iid)))


# ---------------------------------------------------------------------------
# Priority change (agent/manager only)
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/priority", methods=["POST"])
@login_required
@csrf_protect
def change_priority(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    data = request.get_json(silent=True) or {}
    new_priority = data.get("priority")
    if new_priority not in config.PRIORITIES:
        return jsonify(error="Invalid priority"), 400
    if new_priority == t["priority"]:
        return jsonify(issue=_serialize(_fetch(iid)))

    old_priority = t["priority"]
    now = db.now_iso()
    db.get_db().execute(
        "UPDATE jira_issues SET priority=?, updated_at=? WHERE id=?",
        (new_priority, now, iid),
    )
    db.get_db().commit()
    _log(iid, user["id"], "priority_change", old_priority, new_priority)
    # Re-evaluate SLA policy if priority changed (policy may differ).
    updated = _fetch(iid)
    sla.update_sla_on_priority(iid, updated["category_id"], new_priority)
# Notify the requester when an agent changes the priority.
    if t["requester_id"] != user["id"]:
        notifications.notify(
            updated["requester_id"], ENTITY_TYPE, iid, "priority",
            f"Your issue “{t['summary']}” priority was set to {new_priority}.")
    _notify_followers(iid, user["id"], "priority",
                      f"Priority of “{t['summary']}” set to {new_priority}.")
    return jsonify(issue=_serialize(updated))


# ---------------------------------------------------------------------------
# Comments / notes
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/comments", methods=["POST"])
@login_required
@csrf_protect
def add_comment(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()
    visibility = data.get("visibility") or config.VIS_PUBLIC
    if not body:
        return jsonify(error="Comment body is required"), 400
    if len(body) > config.MAX_COMMENT:
        return jsonify(error=f"Comment must be {config.MAX_COMMENT} characters or fewer"), 400
    # Only agents/managers may create internal notes.
    if visibility == config.VIS_INTERNAL and not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    cur = db.get_db().execute(
        """INSERT INTO entity_comments
           (entity_type, entity_id, author_id, body, visibility, created_at)
           VALUES (?,?,?,?,?,?)""",
        (ENTITY_TYPE, iid, user["id"], body, visibility, db.now_iso()),
    )
    db.get_db().commit()
    c = db.get_db().execute(
        "SELECT * FROM entity_comments WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    # Phase 1: an internal note is hidden from the requester, but we still alert
    # them that the team is actively working the issue (without leaking content).
    if visibility == config.VIS_INTERNAL and t["requester_id"] != user["id"] and is_agent_or_manager(user):
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "internal_note",
            f"A private note was added to your issue “{t['summary']}”.")
    # Phase 1: when an agent/manager posts a PUBLIC comment, notify the requester
    # so they see the reply without polling.
    if visibility == config.VIS_PUBLIC and t["requester_id"] != user["id"] and is_agent_or_manager(user):
        notifications.notify(
            t["requester_id"], ENTITY_TYPE, iid, "comment",
            f"{user['name']} replied to your issue “{t['summary']}”.")
    # Phase 3: an agent/manager touching the issue (public reply or internal
    # note) is the first response; record it exactly once.
    if is_agent_or_manager(user) and t["requester_id"] != user["id"]:
        sla.record_first_response(iid)
    # Watchers: commenting follows the issue, mentions notify, followers hear
    # about public replies.
    db.get_db().execute(
        "INSERT OR IGNORE INTO entity_followers (entity_type, entity_id, user_id, created_at) VALUES (?,?,?,?)",
        (ENTITY_TYPE, iid, user["id"], db.now_iso()))
    db.get_db().commit()
    _notify_mentions(iid, body, user["id"], t["summary"])
    if visibility == config.VIS_PUBLIC:
        _notify_followers(iid, user["id"], "comment",
                          f"{user['name']} commented on “{t['summary']}”.")
    return jsonify(comment=_serialize_comment(c)), 201


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/attachments", methods=["POST"])
@login_required
@csrf_protect
def upload_attachment(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404

    file = request.files.get("file")
    if not file:
        return jsonify(error="No file provided"), 400
    # (E) Path-traversal fix: the client-supplied filename is untrusted. Strip
    # any directory components and reject names that escape the upload root,
    # then force the extension to one of the allowed ones so a crafted
    # "..%2fevil.sh" or "x.php" can never be written outside UPLOAD_DIR/<iid>.
    raw_name = file.filename or "upload"
    base = os.path.basename(raw_name).strip()
    if not base or base in (".", ".."):
        return jsonify(error="Invalid filename"), 400
    ext = os.path.splitext(base)[1].lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        return jsonify(error="File type not allowed"), 400
    head = file.read(32)
    file.seek(0)
    kind, _ = _detect_upload_type(head, ext)
    if kind != "ok":
        return jsonify(error=kind), 400
    # Read the real size from the stream (content_length is client-supplied and
    # can be missing/forged). Rewind after measuring.
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > config.MAX_ATTACHMENT_BYTES:
        return jsonify(error="File exceeds 10MB limit"), 400

    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    # store under issue folder to avoid collisions
    folder = os.path.join(config.UPLOAD_DIR, str(iid))
    os.makedirs(folder, exist_ok=True)
    # Keep the original basename but re-assert it stays inside `folder`.
    safe_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{base}"
    path = os.path.normpath(os.path.join(folder, safe_name))
    if not path.startswith(os.path.normpath(folder) + os.sep):
        return jsonify(error="Invalid filename"), 400
    file.save(path)

    cur = db.get_db().execute(
        """INSERT INTO entity_attachments
           (entity_type, entity_id, uploaded_by, filename, file_size, storage_path, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (ENTITY_TYPE, iid, request.current_user["id"], file.filename,
         os.path.getsize(path), path, db.now_iso()),
    )
    db.get_db().commit()
    a = db.get_db().execute(
        "SELECT * FROM entity_attachments WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(attachment=_serialize_attachment(a)), 201


@jira.route("/api/jira/issues/<int:iid>/attachments/<int:att_id>")
@login_required
def download_attachment(iid, att_id):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    a = db.get_db().execute(
        "SELECT * FROM entity_attachments WHERE id=? AND entity_type=? AND entity_id=?",
        (att_id, ENTITY_TYPE, iid),
    ).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    # The file may have been removed from disk (e.g. manual cleanup). Don't 500.
    if not os.path.exists(a["storage_path"]):
        return jsonify(error="Attachment file is missing on the server"), 410
    return send_file(a["storage_path"], download_name=a["filename"])


# ---------------------------------------------------------------------------
# Issue <-> Knowledge links (polymorphic entity_links)
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/<int:iid>/knowledge", methods=["GET"])
@login_required
def list_issue_knowledge(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        """SELECT n.*, u.name AS author_name, el.created_at AS linked_at
           FROM entity_links el
           JOIN kb_notes n ON n.id = el.target_id
           LEFT JOIN users u ON u.id = n.author_id
          WHERE el.source_type=? AND el.source_id=? AND el.target_type='kb_note'
          ORDER BY el.created_at DESC""",
        (ENTITY_TYPE, iid),
    ).fetchall()
    out = []
    for r in rows:
        out.append(dict(r))
    return jsonify(notes=out)


@jira.route("/api/jira/issues/<int:iid>/knowledge", methods=["POST"])
@login_required
@csrf_protect
def link_issue_knowledge(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    if not is_agent_or_manager(request.current_user):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(force=True, silent=True) or {}
    note_id = data.get("note_id") or data.get("article_id")
    if not note_id:
        return jsonify(error="note_id is required"), 400
    n = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (note_id,)).fetchone()
    if not n:
        return jsonify(error="Note not found"), 404
    try:
        db.get_db().execute(
            "INSERT INTO entity_links (source_type, source_id, target_type, target_id, created_by, created_at) VALUES (?,?,?,?,?,?)",
            (ENTITY_TYPE, iid, "kb_note", note_id, request.current_user["id"], db.now_iso()),
        )
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Already linked"), 409
    return jsonify(ok=True), 201


@jira.route("/api/jira/issues/<int:iid>/knowledge/<int:nid>", methods=["DELETE"])
@login_required
@csrf_protect
def unlink_issue_knowledge(iid, nid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    if not is_agent_or_manager(request.current_user):
        return jsonify(error="Forbidden"), 403
    db.get_db().execute(
        "DELETE FROM entity_links WHERE source_type=? AND source_id=? AND target_type='kb_note' AND target_id=?",
        (ENTITY_TYPE, iid, nid))
    db.get_db().commit()
    return jsonify(ok=True)


@jira.route("/api/jira/issues/<int:iid>/knowledge/suggested", methods=["GET"])
@login_required
def suggested_issue_knowledge(iid):
    """Published KB notes ranked by keyword overlap with the issue's
    summary + description; already-linked notes are excluded."""
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    terms = _keyword_terms(t["summary"] + " " + (t["description"] or ""))
    if not terms:
        return jsonify(suggestions=[])
    linked = {r["target_id"] for r in db.get_db().execute(
        "SELECT target_id FROM entity_links WHERE source_type=? AND source_id=? AND target_type='kb_note'",
        (ENTITY_TYPE, iid)).fetchall()}
    rows = db.get_db().execute(
        "SELECT n.*, f.name AS folder_name FROM kb_notes n "
        "LEFT JOIN kb_folders f ON f.id = n.folder_id "
        "WHERE n.status='published'",
    ).fetchall()
    scored = []
    for r in rows:
        if r["id"] in linked:
            continue
        hay = _keyword_terms(r["title"] + " " + r["content"])
        if not hay:
            continue
        score = sum(terms.get(w, 0) * hay.get(w, 0) for w in terms)
        if score > 0:
            scored.append((score, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = [{"id": r["id"], "title": r["title"], "folder_name": r["folder_name"], "score": s}
           for s, r in scored[:5]]
    return jsonify(suggestions=out)


@jira.route("/api/jira/issues/<int:iid>/promote-kb", methods=["POST"])
@login_required
@csrf_protect
def promote_to_kb(iid):
    """Create a new KB draft note from an issue (staff only).

    Uses the user's own OpenRouter key when configured (via routes_kb's
    shared helper); falls back to a plaintext skeleton. The draft note is
    returned so the SPA can jump straight into the editor.
    """
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    from .routes_kb import _draft_kb_body, _folder_for_category, _serialize as _serialize_note
    body, _ai_used = _draft_kb_body(user, t)
    now = db.now_iso()
    folder_id = _folder_for_category(t["category_id"])
    # kb_notes enforces UNIQUE(folder_id, title) — dedupe with a numeric suffix
    # so promoting the same issue twice yields distinct drafts.
    title, n = t["summary"], 2
    while db.get_db().execute(
            "SELECT 1 FROM kb_notes WHERE folder_id=? AND title=?",
            (folder_id, title)).fetchone():
        title = f"{t['summary']} ({n})"
        n += 1
    cur = db.get_db().execute(
        """INSERT INTO kb_notes (folder_id, title, content, author_id, status, views, created_at, updated_at)
           VALUES (?,?,?,?, 'draft', 0, ?, ?)""",
        (folder_id, title, body, user["id"], now, now),
    )
    db.get_db().commit()
    note = _serialize_note(db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (cur.lastrowid,)).fetchone())
    # The new draft starts life linked to the issue it came from.
    db.get_db().execute(
        "INSERT INTO entity_links (source_type, source_id, target_type, target_id, created_by, created_at) VALUES (?,?,?,?,?,?)",
        (ENTITY_TYPE, iid, "kb_note", note["id"], user["id"], now))
    db.get_db().commit()
    return jsonify(note=note), 201


# ---------------------------------------------------------------------------
# Dashboard aggregates (FR-16, FR-17)
# ---------------------------------------------------------------------------
@jira.route("/api/dashboard")
@login_required
def dashboard():
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403
    dbc = db.get_db()

    # Build a single WHERE prefix. When there is a team scope, every count
    # query filters by it; otherwise the WHERE clause is empty.
    where = ""
    wparams = []
    if user["role"] == config.ROLE_AGENT:
        where = "WHERE (t.team_id = ? OR t.team_id IS NULL)"
        wparams.append(user["team_id"])

    counts = {}
    for st in config.STATUSES:
        row = dbc.execute(
            f"SELECT COUNT(*) c FROM jira_issues t {where} {'AND' if where else 'WHERE'} t.status = ?",
            wparams + [st],
        ).fetchone()
        counts[st] = row["c"]

    unassigned = dbc.execute(
        f"SELECT COUNT(*) c FROM jira_issues t {where} "
        f"{'AND' if where else 'WHERE'} t.assignee_id IS NULL AND t.status != ?",
        wparams + [config.STATUS_CLOSED],
    ).fetchone()["c"]

    urgent = dbc.execute(
        f"SELECT COUNT(*) c FROM jira_issues t {where} "
        f"{'AND' if where else 'WHERE'} t.priority = ? "
        f"AND t.status NOT IN (?,?)",
        wparams + [config.PRIORITY_URGENT, config.STATUS_CLOSED, config.STATUS_RESOLVED],
    ).fetchone()["c"]

    blocked = counts[config.STATUS_BLOCKED]
    resolved = counts[config.STATUS_RESOLVED] + counts[config.STATUS_CLOSED]

    # 7-day rolling average resolution time (resolved_at - created_at)
    avg = dbc.execute(
        f"""SELECT AVG(
              (julianday(resolved_at) - julianday(created_at)) * 24.0) av
            FROM jira_issues t {where}
            {'AND' if where else 'WHERE'} t.resolved_at IS NOT NULL
            AND t.resolved_at >= datetime('now','-7 days','utc')""",
        wparams,
    ).fetchone()["av"]
    avg_resolution_hours = round(avg, 1) if avg is not None else None

    # Aged issues (FR-17)
    aged = _aged_issues(where, wparams)

    out = dict(
        counts=counts,
        unassigned=unassigned,
        urgent=urgent,
        blocked=blocked,
        resolved=resolved,
        avg_resolution_hours=avg_resolution_hours,
        aged=[_serialize(t) for t in aged],
    )
    if user["role"] == config.ROLE_AGENT:
        uid = user["id"]
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        my_open = dbc.execute(
            "SELECT COUNT(*) c FROM jira_issues t "
            "WHERE t.assignee_id = ? AND t.status NOT IN (?,?)",
            (uid, config.STATUS_RESOLVED, config.STATUS_CLOSED),
        ).fetchone()["c"]
        my_assigned_today = dbc.execute(
            "SELECT COUNT(*) c FROM jira_issues t "
            "WHERE t.assignee_id = ? AND date(t.created_at,'utc') = ?",
            (uid, today),
        ).fetchone()["c"]
        my_urgent = dbc.execute(
            "SELECT COUNT(*) c FROM jira_issues t "
            "WHERE t.assignee_id = ? AND t.priority = ? AND t.status NOT IN (?,?)",
            (uid, config.PRIORITY_URGENT, config.STATUS_RESOLVED, config.STATUS_CLOSED),
        ).fetchone()["c"]
        my_blocked = dbc.execute(
            "SELECT COUNT(*) c FROM jira_issues t "
            "WHERE t.assignee_id = ? AND t.status = ?",
            (uid, config.STATUS_BLOCKED),
        ).fetchone()["c"]
        my_resolved_today = dbc.execute(
            "SELECT COUNT(*) c FROM jira_issues t "
            "WHERE t.assignee_id = ? AND t.resolved_at IS NOT NULL "
            "AND date(t.resolved_at,'utc') = ?",
            (uid, today),
        ).fetchone()["c"]
        my_rated = dbc.execute(
            "SELECT COUNT(*) c FROM jira_issues t "
            "WHERE t.assignee_id = ? AND t.csat IS NOT NULL",
            (uid,),
        ).fetchone()["c"]
        first_response_avg = dbc.execute(
            "SELECT AVG((julianday(ts.first_response_at) - julianday(t.created_at)) * 24.0) av "
            "FROM issue_sla ts JOIN jira_issues t ON ts.issue_id = t.id "
            "WHERE t.assignee_id = ? AND ts.first_response_at IS NOT NULL",
            (uid,),
        ).fetchone()["av"]
        resolution_avg = dbc.execute(
            "SELECT AVG((julianday(t.resolved_at) - julianday(t.created_at)) * 24.0) av "
            "FROM jira_issues t "
            "WHERE t.assignee_id = ? AND t.resolved_at IS NOT NULL",
            (uid,),
        ).fetchone()["av"]
        out.update(
            role="agent",
            my_open=my_open,
            my_assigned_today=my_assigned_today,
            my_urgent=my_urgent,
            my_blocked=my_blocked,
            my_resolved_today=my_resolved_today,
            my_rated_tickets=my_rated,
            my_avg_response_hours=round(first_response_avg, 1) if first_response_avg is not None else None,
            my_avg_resolution_hours=round(resolution_avg, 1) if resolution_avg is not None else None,
        )
    else:
        out["role"] = "manager"
    return jsonify(out)


@jira.route("/api/meta")
@login_required
def meta():
    dbc = db.get_db()
    teams = [dict(r) for r in dbc.execute("SELECT * FROM teams ORDER BY name")]
    cats = [dict(r) for r in dbc.execute(
        "SELECT * FROM categories WHERE active=1 ORDER BY name")]
    # SECURITY: a requester must NOT receive the full staff directory.
    # Only agents/managers (who assign issues) need the user list.
    if helpers.is_agent_or_manager(request.current_user):
        users = [dict(r) for r in dbc.execute(
            "SELECT id, name, email, role, team_id FROM users ORDER BY name")]
    else:
        users = []
    return jsonify(
        teams=teams,
        categories=cats,
        users=users,
        statuses=config.STATUSES,
        priorities=config.PRIORITIES,
        status_labels=lifecycle.LABELS,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _fetch(iid):
    return db.get_db().execute(
        "SELECT * FROM jira_issues WHERE id = ?", (iid,)
    ).fetchone()


def _ensure_project():
    """Idempotently create the OPS project (used if migration never ran)."""
    row = db.get_db().execute(
        "SELECT id FROM jira_projects WHERE key='OPS'").fetchone()
    if row:
        return row["id"]
    admin = db.get_db().execute(
        "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
    cur = db.get_db().execute(
        """INSERT INTO jira_projects (key, name, description, lead_id, category, created_at)
           VALUES ('OPS', 'Operations Desk', 'Default operational queue', ?, 'Service Desk', ?)""",
        (admin["id"] if admin else None, db.now_iso()))
    db.get_db().commit()
    return cur.lastrowid


def _next_key():
    """Allocate the next issue key from the project sequence (OPS-0001 style)."""
    row = db.get_db().execute(
        "SELECT next_seq FROM jira_projects WHERE key='OPS'").fetchone()
    seq = row["next_seq"] if row else 1
    return f"OPS-{seq:04d}", seq


def _within_reopen_window(t):
    # Issues closed without ever being resolved have no resolved_at; fall
    # back to closed_at so the reopen window still applies from closure.
    ref = t["resolved_at"] or t["closed_at"]
    if not ref:
        return False
    rt = datetime.fromisoformat(ref)
    return datetime.now(timezone.utc) - rt < timedelta(
        hours=config.REOPEN_WINDOW_HOURS)


def _aged_issues(where, wparams):
    """Return issues matching the aged definition (FR-17)."""
    dbc = db.get_db()
    # New & unassigned > 4h, OR in_progress with no update > 48h.
    rows = dbc.execute(
        f"""SELECT * FROM jira_issues t {where}
            {'AND' if where else 'WHERE'} (
              (t.status = 'new' AND t.assignee_id IS NULL
               AND t.created_at <= datetime('now','-{config.AGED_NEW_HOURS} hours','utc'))
              OR
              (t.status = 'in_progress'
               AND t.updated_at <= datetime('now','-{config.AGED_PROGRESS_HOURS} hours','utc'))
            )
            ORDER BY t.updated_at ASC""",
        wparams,
    ).fetchall()
    return rows


def _log(issue_id, actor_id, action, from_status=None, to_status=None, note=None):
    helpers.log_activity(ENTITY_TYPE, issue_id, actor_id, action,
                         detail={"from_status": from_status,
                                 "to_status": to_status,
                                 "note": note})


def _comments_for(iid, user):
    rows = db.get_db().execute(
        "SELECT * FROM entity_comments WHERE entity_type=? AND entity_id=? ORDER BY created_at ASC",
        (ENTITY_TYPE, iid),
    ).fetchall()
    out = []
    for r in rows:
        # Requesters never see internal notes.
        if r["visibility"] == config.VIS_INTERNAL and \
           user["role"] == config.ROLE_REQUESTER:
            continue
        out.append(_serialize_comment(r))
    return out


def _attachments_for(iid):
    rows = db.get_db().execute(
        "SELECT * FROM entity_attachments WHERE entity_type=? AND entity_id=? ORDER BY created_at ASC",
        (ENTITY_TYPE, iid),
    ).fetchall()
    return [_serialize_attachment(r) for r in rows]


def _activity_for(iid):
    rows = db.get_db().execute(
        "SELECT * FROM entity_activity WHERE entity_type=? AND entity_id=? ORDER BY created_at ASC",
        (ENTITY_TYPE, iid),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            import json as _json
            d["detail"] = _json.loads(d["detail"]) if d["detail"] else {}
        except (ValueError, TypeError):
            d["detail"] = {"note": d["detail"]}
        out.append(d)
    return out


def _serialize(t, sla_row=None):
    name_row = lambda uid: db.get_db().execute(
        "SELECT name FROM users WHERE id=?", (uid,)
    ).fetchone()
    requester_name = name_row(t["requester_id"])["name"] if t["requester_id"] else None
    assignee_name = name_row(t["assignee_id"])["name"] if t["assignee_id"] else None
    return {
        "id": t["id"],
        "issue_key": t["issue_key"],
        "ticket_ref": t["issue_key"],
        "summary": t["summary"],
        "subject": t["summary"],
        "description": t["description"],
        "issue_type": t["issue_type"],
        "category_id": t["category_id"],
        "requester_id": t["requester_id"],
        "requester_name": requester_name,
        "assignee_id": t["assignee_id"],
        "assignee_name": assignee_name,
        "team_id": t["team_id"],
        "priority": t["priority"],
        "status": t["status"],
        "blocked_reason": t["blocked_reason"],
        "reopen_count": t["reopen_count"],
        "created_at": t["created_at"],
        "updated_at": t["updated_at"],
        "resolved_at": t["resolved_at"],
        "closed_at": t["closed_at"],
        "csat": t["csat"],
        "sla": _sla_summary(t["id"], sla_row),
    }

def _sla_summary(iid, sla_row=None):
    """Lightweight SLA readout for issue serialization.

    Delegates to routes_sla.summarize, which computes breach LIVE (overdue open
    issues are reported as breached) so the badge is accurate without a sweep.
    If the list query already JOINed the SLA row (sla_row), pass it through to
    avoid a per-row extra SELECT (N+1).
    The caller has already authorized the issue.
    """
    return sla.summarize(iid, sla_row)


def _serialize_comment(c):
    author_name = None
    if c["author_id"]:
        row = db.get_db().execute("SELECT name FROM users WHERE id=?", (c["author_id"],)).fetchone()
        author_name = row["name"] if row else None
    return {
        "id": c["id"], "entity_type": c["entity_type"], "entity_id": c["entity_id"],
        "ticket_id": c["entity_id"], "author_id": c["author_id"],
        "author_name": author_name, "body": c["body"], "visibility": c["visibility"],
        "created_at": c["created_at"],
    }


def _serialize_attachment(a):
    return {
        "id": a["id"], "entity_type": a["entity_type"], "entity_id": a["entity_id"],
        "ticket_id": a["entity_id"], "filename": a["filename"],
        "file_size": a["file_size"], "created_at": a["created_at"],
    }


# Common English noise words excluded from keyword-overlap matching.
_KEYWORD_STOP = {
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
    "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "man",
    "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let",
    "put", "say", "she", "too", "use", "that", "with", "have", "this", "will",
    "your", "from", "they", "know", "want", "been", "good", "much", "some",
    "time", "very", "when", "come", "here", "just", "like", "long", "make",
    "many", "more", "only", "over", "such", "take", "than", "them", "well",
    "were", "what", "would", "about", "could", "other", "which", "these",
    "there", "where", "after", "before", "please", "thanks", "need", "also",
    "into", "any", "else", "even", "ever", "every", "first", "last", "next",
    "then", "while", "should", "might", "must", "does", "done", "down", "back",
    "still", "work", "team", "issue", "problem", "question", "request", "help",
    "happen", "something", "anything", "everything", "nothing", "thing",
}

def _keyword_terms(text):
    """Lowercased word -> frequency map, dropping stopwords and 1-2 char words."""
    terms = {}
    for w in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if len(w) > 2 and w not in _KEYWORD_STOP:
            terms[w] = terms.get(w, 0) + 1
    return terms


# ---------------------------------------------------------------------------
# Followers / watchers + @mentions
# ---------------------------------------------------------------------------
def _followers_of(iid):
    return [r["user_id"] for r in db.get_db().execute(
        "SELECT user_id FROM entity_followers WHERE entity_type=? AND entity_id=?",
        (ENTITY_TYPE, iid)).fetchall()]


def _notify_followers(iid, actor_id, kind, message):
    """Fan out an in-app notification to every follower except the actor."""
    for uid in _followers_of(iid):
        if uid != actor_id:
            notifications.notify(uid, ENTITY_TYPE, iid, kind, message)


def _notify_mentions(iid, body, actor_id, summary):
    """Parse @Name mentions in a comment and notify the named users.

    The regex is built from the actual user table (longest names first) so a
    mention is an exact name match with a word boundary — "@Sam Requester
    please review" mentions "Sam Requester", and "@Sammy" mentions nobody.
    """
    names = [r["name"] for r in db.get_db().execute("SELECT name FROM users")]
    if not names:
        return
    names.sort(key=len, reverse=True)
    pattern = re.compile(
        r"@(" + "|".join(re.escape(n) for n in names) + r")(?![A-Za-z0-9.])",
        re.IGNORECASE)
    hits = []
    seen = set()
    for m in pattern.finditer(body or ""):
        key = m.group(1).lower()
        if key in seen:
            continue
        seen.add(key)
        row = db.get_db().execute(
            "SELECT id, name FROM users WHERE LOWER(name)=?", (key,)).fetchone()
        if row:
            hits.append(row)
    if not hits:
        return
    actor_name = db.get_db().execute(
        "SELECT name FROM users WHERE id=?", (actor_id,)).fetchone()["name"]
    for r in hits:
        if r["id"] != actor_id:
            notifications.notify(
                r["id"], ENTITY_TYPE, iid, "mention",
                f"{actor_name} mentioned you on “{summary}”.")


@jira.route("/api/jira/issues/<int:iid>/followers", methods=["GET"])
@login_required
def list_followers(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        "SELECT u.id, u.name FROM entity_followers f "
        "JOIN users u ON u.id = f.user_id "
        "WHERE f.entity_type=? AND f.entity_id=? ORDER BY f.created_at",
        (ENTITY_TYPE, iid)).fetchall()
    return jsonify(followers=[{"id": r["id"], "name": r["name"]} for r in rows])


@jira.route("/api/jira/issues/<int:iid>/follow", methods=["POST"])
@login_required
@csrf_protect
def follow_issue(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    db.get_db().execute(
        "INSERT OR IGNORE INTO entity_followers (entity_type, entity_id, user_id, created_at) VALUES (?,?,?,?)",
        (ENTITY_TYPE, iid, request.current_user["id"], db.now_iso()))
    db.get_db().commit()
    return jsonify(following=True)


@jira.route("/api/jira/issues/<int:iid>/follow", methods=["DELETE"])
@login_required
@csrf_protect
def unfollow_issue(iid):
    t = _fetch(iid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    db.get_db().execute(
        "DELETE FROM entity_followers WHERE entity_type=? AND entity_id=? AND user_id=?",
        (ENTITY_TYPE, iid, request.current_user["id"]))
    db.get_db().commit()
    return jsonify(following=False)


# ---------------------------------------------------------------------------
# Bulk queue actions (staff only)
# ---------------------------------------------------------------------------
@jira.route("/api/jira/issues/bulk", methods=["POST"])
@login_required
@csrf_protect
def bulk_action():
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    ids = data.get("issue_ids") or data.get("ticket_ids")
    if not isinstance(ids, list) or not ids:
        return jsonify(error="issue_ids is required"), 400
    action = data.get("action")
    if action not in ("assign", "unassign", "status", "priority", "close", "blocked"):
        return jsonify(error="Unknown action"), 400
    processed, skipped = 0, []
    for raw in ids[:200]:
        try:
            iid = int(raw)
        except (TypeError, ValueError):
            skipped.append({"id": raw, "error": "invalid id"})
            continue
        ok, err = _bulk_one(iid, action, data, user)
        if ok:
            processed += 1
        else:
            skipped.append({"id": iid, "error": err})
    return jsonify(processed=processed, skipped=skipped)


def _bulk_one(iid, action, data, user):
    """Apply one bulk action to one issue. Returns (ok, error_or_none)."""
    t = _fetch(iid)
    if not t or not can_view_ticket(user, t):
        return False, "not found or no access"
    now = db.now_iso()

    if action in ("close", "blocked") or action == "status":
        to = {"close": config.STATUS_CLOSED, "blocked": config.STATUS_BLOCKED}.get(action)
        if action == "status":
            to = data.get("status")
        if not to:
            return False, "status is required"
        allowed, reason_required = lifecycle.can_transition(t["status"], to)
        if not allowed:
            return False, f"cannot move from {t['status']} to {to}"
        if reason_required and not (data.get("note") or data.get("blocked_reason")):
            return False, "a reason is required"
        note = (data.get("note") or data.get("blocked_reason") or "")[:1000]
        resolved_at, closed_at, blocked_reason = t["resolved_at"], t["closed_at"], t["blocked_reason"]
        if to == config.STATUS_RESOLVED:
            resolved_at = now
        elif to == config.STATUS_CLOSED:
            closed_at = now
        elif to == config.STATUS_BLOCKED:
            blocked_reason = note
        db.get_db().execute(
            """UPDATE jira_issues SET status=?, blocked_reason=?, resolved_at=?,
               closed_at=?, updated_at=? WHERE id=?""",
            (to, blocked_reason, resolved_at, closed_at, now, iid))
        db.get_db().commit()
        _log(iid, user["id"], "status_change", t["status"], to,
             note=note or None)
        if to in (config.STATUS_RESOLVED, config.STATUS_CLOSED):
            sla.evaluate_on_resolve(iid)
        if t["requester_id"] != user["id"] and to == config.STATUS_RESOLVED:
            notifications.notify(
                t["requester_id"], ENTITY_TYPE, iid, "resolved",
                f"Your issue “{t['summary']}” was marked resolved.")
        _notify_followers(iid, user["id"], "status_change",
                          f"Issue “{t['summary']}” is now {lifecycle.LABELS.get(to, to)}.")
        return True, None

    if action == "assign":
        assignee_id = data.get("assignee_id")
        if not assignee_id:
            return False, "assignee_id is required"
        a = db.get_db().execute("SELECT id, team_id FROM users WHERE id=?", (assignee_id,)).fetchone()
        if not a:
            return False, "unknown assignee"
        db.get_db().execute(
            "UPDATE jira_issues SET assignee_id=?, team_id=?, status=?, updated_at=? WHERE id=?",
            (assignee_id, a["team_id"], config.STATUS_ASSIGNED if t["status"] == config.STATUS_NEW else t["status"], now, iid))
        db.get_db().commit()
        _log(iid, user["id"], "assigned", t["status"],
             config.STATUS_ASSIGNED, note=f"Assigned to user {assignee_id}")
        db.get_db().execute(
            "INSERT OR IGNORE INTO entity_followers (entity_type, entity_id, user_id, created_at) VALUES (?,?,?,?)",
            (ENTITY_TYPE, iid, assignee_id, now))
        db.get_db().commit()
        if t["requester_id"] != user["id"]:
            sla.record_first_response(iid)
            notifications.notify(
                t["requester_id"], ENTITY_TYPE, iid, "assigned",
                f"Your issue “{t['summary']}” was assigned.")
        _notify_followers(iid, user["id"], "assigned",
                          f"Issue “{t['summary']}” was assigned.")
        return True, None

    if action == "unassign":
        db.get_db().execute(
            "UPDATE jira_issues SET assignee_id=NULL, team_id=NULL, status=?, updated_at=? WHERE id=?",
            (config.STATUS_NEW, now, iid))
        db.get_db().commit()
        _log(iid, user["id"], "assigned", t["status"],
             config.STATUS_NEW, note="Unassigned (bulk)")
        return True, None

    if action == "priority":
        new_priority = data.get("priority")
        if new_priority not in config.PRIORITIES:
            return False, "invalid priority"
        if new_priority == t["priority"]:
            return True, None
        db.get_db().execute(
            "UPDATE jira_issues SET priority=?, updated_at=? WHERE id=?",
            (new_priority, now, iid))
        db.get_db().commit()
        _log(iid, user["id"], "priority_change", t["priority"], new_priority)
        sla.update_sla_on_priority(iid, t["category_id"], new_priority)
        return True, None

    return False, "unsupported action"