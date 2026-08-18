"""
Ticket routes: the core lifecycle of OpsDesk.

Endpoints:
  GET  /api/tickets            -> list (filtered, RBAC-scoped)
  POST /api/tickets            -> create (requester or any)
  GET  /api/tickets/<id>       -> detail (RBAC)
  POST /api/tickets/<id>/assign
  POST /api/tickets/<id>/status
  POST /api/tickets/<id>/reopen
  POST /api/tickets/<id>/comments
  POST /api/tickets/<id>/attachments
  GET  /api/tickets/<id>/attachments/<att_id>
  GET  /api/dashboard          -> manager/agent aggregates
  GET  /api/meta               -> teams, categories, statuses, priorities (for forms)
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

tickets = Blueprint("tickets", __name__)

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
@tickets.route("/api/tickets")
@login_required
def list_tickets():
    user = request.current_user
    # Select ticket columns plus the SLA/policy columns via the LEFT JOIN so the
    # list serializes SLA state without a per-row extra SELECT (no N+1).
    # NOTE: SQLite requires JOINs before the WHERE clause.
    q = ["SELECT t.*, ts.first_response_at, ts.breach_at, ts.breached, "
         "ts.response_met, ts.resolution_met, sp.name AS policy_name "
         "FROM tickets t "
         "LEFT JOIN ticket_sla ts ON ts.ticket_id = t.id "
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
        where.append("(t.subject LIKE ? OR t.description LIKE ? OR t.ticket_ref LIKE ?)")
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
        tickets=[_serialize(t, sla_row=t) for t in page_rows],
        pagination={"page": page, "per_page": per_page, "total": total, "pages": max(1, (total + per_page - 1) // per_page)},
    )


@tickets.route("/api/tickets/<int:tid>")
@login_required
def get_ticket(tid):
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    out = _serialize(t)
    out["comments"] = _comments_for(tid, user)
    out["attachments"] = _attachments_for(tid)
    out["activity"] = _activity_for(tid)
    out["allowed_transitions"] = lifecycle.next_statuses(t["status"])
    return jsonify(ticket=out)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets", methods=["POST"])
@login_required
@csrf_protect
def create_ticket():
    data = request.get_json(silent=True) or {}
    subject = (data.get("subject") or "").strip()
    description = data.get("description") or ""
    category_id = data.get("category_id")
    priority = data.get("priority") or config.PRIORITY_NORMAL
    team_id = data.get("team_id")

    if not subject:
        return jsonify(error="Subject is required"), 400
    if len(subject) > config.MAX_SUBJECT:
        return jsonify(error=f"Subject must be {config.MAX_SUBJECT} characters or fewer"), 400
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
    # them) so a Hardware ticket can't be parked in Finance.
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

    ref = _next_ref()
    now = db.now_iso()
    cur = db.get_db().execute(
        """INSERT INTO tickets
           (ticket_ref, subject, description, category_id, requester_id,
            assignee_id, team_id, priority, status, reopen_count,
            created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (ref, subject, description, category_id, requester_id, None, team_id,
         priority, config.STATUS_NEW, 0, now, now),
    )
    db.get_db().commit()
    tid = cur.lastrowid
    helpers.log_activity(tid, request.current_user["id"], "created",
                         note=f"Ticket {ref} created")
    # Phase 3: attach the matching SLA policy (once) at creation time.
    sla.attach_sla(_fetch(tid))
    return jsonify(ticket=_serialize(_fetch(tid))), 201


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/assign", methods=["POST"])
@login_required
@csrf_protect
def assign(tid):
    t = _fetch(tid)
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
        "UPDATE tickets SET assignee_id=?, team_id=?, status=?,\
         updated_at=? WHERE id=?",
        (assignee_id, team_id, to_status, db.now_iso(), tid),
    )
    db.get_db().commit()
    who = "self" if data.get("self") else (f"user {assignee_id}" if assignee_id else "unassigned")
    helpers.log_activity(tid, user["id"], "assigned", t["status"],
                         to_status, note=f"Assigned to {who}")
    # Phase 3: an agent acting on the ticket counts as the first response.
    if assignee_id and t["requester_id"] != user["id"]:
        sla.record_first_response(tid)
    # Phase 1: tell the requester their ticket was picked up.
    if assignee_id and t["requester_id"] != user["id"]:
        assignee_name = db.get_db().execute(
            "SELECT name FROM users WHERE id=?", (assignee_id,)).fetchone()
        an = assignee_name["name"] if assignee_name else "an agent"
        notifications.notify(
            t["requester_id"], tid, "assigned",
            f"Your ticket “{t['subject']}” was assigned to {an}.",
            email_subject=f"OpsDesk: ticket {t['ticket_ref']} assigned",
            email_body=f"Hi,\n\nYour ticket '{t['subject']}' ({t['ticket_ref']}) was assigned to {an}.\nView it here: {config.APP_BASE_URL}/#/ticket/{tid}\n")
    return jsonify(ticket=_serialize(_fetch(tid)))


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/status", methods=["POST"])
@login_required
@csrf_protect
def change_status(tid):
    t = _fetch(tid)
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
    # erasing why a ticket had been blocked.
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

    # reopen_count: bump for ANY newly-reopened ticket (requester path already
    # bumps in /reopen, so don't double-count there). This keeps the reopen
    # SLA metric accurate for manager/admin reopened tickets too.
    reopen_bump = 1 if (reopened and t["status"] != config.STATUS_REOPENED) else 0

    final_status = config.STATUS_ASSIGNED if reopened else to

    db.get_db().execute(
        """UPDATE tickets SET status=?, blocked_reason=?, resolved_at=?,
           closed_at=?, reopen_count = reopen_count + ?, updated_at=? WHERE id=?""",
        (final_status, blocked_reason, resolved_at, closed_at, reopen_bump, now, tid),
    )
    db.get_db().commit()
    helpers.log_activity(tid, user["id"], "status_change",
                         t["status"], final_status, note=note or None)
    # Phase 3: evaluate SLA when the ticket is resolved or closed (closed
    # without resolving is still a terminal state that must lock in SLA results).
    if final_status in (config.STATUS_RESOLVED, config.STATUS_CLOSED):
        sla.evaluate_on_resolve(tid)
    # Phase 1: notify the requester when their ticket is resolved.
    if to == config.STATUS_RESOLVED and t["requester_id"] != user["id"]:
        notifications.notify(
            t["requester_id"], tid, "resolved",
            f"Your ticket “{t['subject']}” was marked resolved. Reply if it’s not fixed.",
            email_subject=f"OpsDesk: ticket {t['ticket_ref']} resolved",
            email_body=f"Hi,\n\nYour ticket '{t['subject']}' ({t['ticket_ref']}) was marked resolved.\nIf the issue isn't actually fixed, just reply in the ticket: {config.APP_BASE_URL}/#/ticket/{tid}\n")
    # Phase 1: notify the requester when their ticket is blocked.
    if to == config.STATUS_BLOCKED and t["requester_id"] != user["id"] and note:
        notifications.notify(
            t["requester_id"], tid, "blocked",
            f"Your ticket “{t['subject']}” is now blocked: {note}.")
    # Phase 1: notify the requester when their ticket is reopened by an agent.
    if to == config.STATUS_REOPENED and t["requester_id"] != user["id"]:
        notifications.notify(
            t["requester_id"], tid, "reopened",
            f"Your ticket “{t['subject']}” was reopened. It is back in the queue.")
    return jsonify(ticket=_serialize(_fetch(tid)))


# ---------------------------------------------------------------------------
# Reopen (requester path, separate & explicit per FR-07)
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/reopen", methods=["POST"])
@login_required
@csrf_protect
def reopen(tid):
    t = _fetch(tid)
    if not t:
        return jsonify(error="Not found"), 404
    user = request.current_user
    if user["role"] == config.ROLE_REQUESTER and t["requester_id"] != user["id"]:
        return jsonify(error="Forbidden"), 403
    if t["status"] not in (config.STATUS_RESOLVED, config.STATUS_CLOSED):
        return jsonify(error="Only resolved/closed tickets can be reopened"), 400
    if user["role"] == config.ROLE_REQUESTER and not _within_reopen_window(t):
        return jsonify(error="Reopen window has passed"), 400

    now = db.now_iso()
    db.get_db().execute(
        """UPDATE tickets SET status=?, reopen_count = reopen_count + 1,
           updated_at=? WHERE id=?""",
        (config.STATUS_REOPENED, now, tid),
    )
    db.get_db().commit()
    helpers.log_activity(tid, user["id"], "reopened", t["status"],
                         config.STATUS_REOPENED)
    # Phase 1: notify the requester that their ticket was reopened by a staff member.
    if t["requester_id"] != user["id"]:
        notifications.notify(
            t["requester_id"], tid, "reopened",
            f"Your ticket “{t['subject']}” was reopened. It is back in the queue.")
    # After reopen it sits in 'reopened'; assign routes it onward.
    return jsonify(ticket=_serialize(_fetch(tid)))


# ---------------------------------------------------------------------------
# Priority change (agent/manager only)
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/priority", methods=["POST"])
@login_required
@csrf_protect
def change_priority(tid):
    t = _fetch(tid)
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
        return jsonify(ticket=_serialize(_fetch(tid)))

    old_priority = t["priority"]
    now = db.now_iso()
    db.get_db().execute(
        "UPDATE tickets SET priority=?, updated_at=? WHERE id=?",
        (new_priority, now, tid),
    )
    db.get_db().commit()
    helpers.log_activity(tid, user["id"], "priority_change",
                         old_priority, new_priority)
    # Re-evaluate SLA policy if priority changed (policy may differ).
    updated = _fetch(tid)
    sla.update_sla_on_priority(tid, updated["category_id"], new_priority)
    # Notify the requester when an agent changes the priority.
    if updated["requester_id"] != user["id"]:
        notifications.notify(
            updated["requester_id"], tid, "priority",
            f"Your ticket “{t['subject']}” priority was set to {new_priority}.")
    return jsonify(ticket=_serialize(updated))


# ---------------------------------------------------------------------------
# Comments / notes
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/comments", methods=["POST"])
@login_required
@csrf_protect
def add_comment(tid):
    t = _fetch(tid)
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
        """INSERT INTO ticket_comments
           (ticket_id, author_id, body, visibility, created_at)
           VALUES (?,?,?,?,?)""",
        (tid, user["id"], body, visibility, db.now_iso()),
    )
    db.get_db().commit()
    c = db.get_db().execute(
        "SELECT * FROM ticket_comments WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    # Phase 1: an internal note is hidden from the requester, but we still alert
    # them that the team is actively working the ticket (without leaking content).
    if visibility == config.VIS_INTERNAL and t["requester_id"] != user["id"] and is_agent_or_manager(user):
        notifications.notify(
            t["requester_id"], tid, "internal_note",
            f"A private note was added to your ticket “{t['subject']}”.")
    # Phase 1: when an agent/manager posts a PUBLIC comment, notify the requester
    # so they see the reply without polling.
    if visibility == config.VIS_PUBLIC and t["requester_id"] != user["id"] and is_agent_or_manager(user):
        notifications.notify(
            t["requester_id"], tid, "comment",
            f"{user['name']} replied to your ticket “{t['subject']}”.")
    # Phase 3: an agent/manager touching the ticket (public reply or internal
    # note) is the first response; record it exactly once.
    if is_agent_or_manager(user) and t["requester_id"] != user["id"]:
        sla.record_first_response(tid)
    return jsonify(comment=_serialize_comment(c)), 201


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/attachments", methods=["POST"])
@login_required
@csrf_protect
def upload_attachment(tid):
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404

    file = request.files.get("file")
    if not file:
        return jsonify(error="No file provided"), 400
    # (E) Path-traversal fix: the client-supplied filename is untrusted. Strip
    # any directory components and reject names that escape the upload root,
    # then force the extension to one of the allowed ones so a crafted
    # "..%2fevil.sh" or "x.php" can never be written outside UPLOAD_DIR/<tid>.
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
    # store under ticket folder to avoid collisions
    folder = os.path.join(config.UPLOAD_DIR, str(tid))
    os.makedirs(folder, exist_ok=True)
    # Keep the original basename but re-assert it stays inside `folder`.
    safe_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{base}"
    path = os.path.normpath(os.path.join(folder, safe_name))
    if not path.startswith(os.path.normpath(folder) + os.sep):
        return jsonify(error="Invalid filename"), 400
    file.save(path)

    cur = db.get_db().execute(
        """INSERT INTO ticket_attachments
           (ticket_id, uploaded_by, filename, file_size, storage_path, created_at)
           VALUES (?,?,?,?,?,?)""",
        (tid, request.current_user["id"], file.filename,
         os.path.getsize(path), path, db.now_iso()),
    )
    db.get_db().commit()
    a = db.get_db().execute(
        "SELECT * FROM ticket_attachments WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(attachment=_serialize_attachment(a)), 201


@tickets.route("/api/tickets/<int:tid>/attachments/<int:att_id>")
@login_required
def download_attachment(tid, att_id):
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    a = db.get_db().execute(
        "SELECT * FROM ticket_attachments WHERE id=? AND ticket_id=?",
        (att_id, tid),
    ).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    # The file may have been removed from disk (e.g. manual cleanup). Don't 500.
    if not os.path.exists(a["storage_path"]):
        return jsonify(error="Attachment file is missing on the server"), 410
    return send_file(a["storage_path"], download_name=a["filename"])


# ---------------------------------------------------------------------------
# Ticket <-> Knowledge links
# ---------------------------------------------------------------------------
@tickets.route("/api/tickets/<int:tid>/knowledge", methods=["GET"])
@login_required
def list_ticket_knowledge(tid):
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        "SELECT a.*, u.name AS author_name, tkl.note, tkl.created_at AS linked_at "
        "FROM ticket_kb_links tkl "
        "JOIN kb_articles a ON a.id = tkl.article_id "
        "LEFT JOIN users u ON u.id = a.author_id "
        "WHERE tkl.ticket_id=? ORDER BY tkl.created_at DESC",
        (tid,),
    ).fetchall()
    out = []
    for r in rows:
        out.append(dict(r))
    return jsonify(articles=out)


@tickets.route("/api/tickets/<int:tid>/knowledge", methods=["POST"])
@login_required
@csrf_protect
def link_ticket_knowledge(tid):
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    if not is_agent_or_manager(request.current_user):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(force=True, silent=True) or {}
    article_id = data.get("article_id")
    if not article_id:
        return jsonify(error="article_id is required"), 400
    a = db.get_db().execute("SELECT * FROM kb_articles WHERE id=?", (article_id,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    note = (data.get("note") or "")[:1000] or None
    try:
        db.get_db().execute(
            "INSERT INTO ticket_kb_links (ticket_id, article_id, linked_by_id, note, created_at) VALUES (?,?,?,?,?)",
            (tid, article_id, request.current_user["id"], note, db.now_iso()),
        )
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Already linked"), 409
    return jsonify(ok=True), 201


@tickets.route("/api/tickets/<int:tid>/knowledge/<int:aid>", methods=["DELETE"])
@login_required
@csrf_protect
def unlink_ticket_knowledge(tid, aid):
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    if not is_agent_or_manager(request.current_user):
        return jsonify(error="Forbidden"), 403
    db.get_db().execute("DELETE FROM ticket_kb_links WHERE ticket_id=? AND article_id=?", (tid, aid))
    db.get_db().commit()
    return jsonify(ok=True)


@tickets.route("/api/tickets/<int:tid>/knowledge/suggested", methods=["GET"])
@login_required
def suggested_ticket_knowledge(tid):
    """Published KB articles ranked by keyword overlap with the ticket's
    subject + description; already-linked articles are excluded."""
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    terms = _keyword_terms(t["subject"] + " " + (t["description"] or ""))
    if not terms:
        return jsonify(suggestions=[])
    linked = {r["article_id"] for r in db.get_db().execute(
        "SELECT article_id FROM ticket_kb_links WHERE ticket_id=?", (tid,)).fetchall()}
    rows = db.get_db().execute(
        "SELECT a.*, c.name AS category_name FROM kb_articles a "
        "LEFT JOIN categories c ON c.id = a.category_id "
        "WHERE a.status='published'",
    ).fetchall()
    scored = []
    for r in rows:
        if r["id"] in linked:
            continue
        hay = _keyword_terms(r["title"] + " " + r["body"])
        if not hay:
            continue
        score = sum(terms.get(w, 0) * hay.get(w, 0) for w in terms)
        if score > 0:
            scored.append((score, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = [{"id": r["id"], "title": r["title"], "category_name": r["category_name"], "score": s}
           for s, r in scored[:5]]
    return jsonify(suggestions=out)


@tickets.route("/api/tickets/<int:tid>/promote-kb", methods=["POST"])
@login_required
@csrf_protect
def promote_to_kb(tid):
    """Create a new KB draft article from a ticket (staff only).

    Uses the user's own OpenRouter key when configured (via routes_kb's
    shared helper); falls back to a plaintext skeleton. The draft article is
    returned so the SPA can jump straight into the editor.
    """
    t = _fetch(tid)
    if not t or not can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    user = request.current_user
    if not is_agent_or_manager(user):
        return jsonify(error="Forbidden"), 403

    from .routes_kb import _draft_kb_body
    body, _ai_used = _draft_kb_body(user, t)
    now = db.now_iso()
    cur = db.get_db().execute(
        """INSERT INTO kb_articles (title, body, category_id, author_id, status, views, created_at, updated_at)
           VALUES (?,?,?,?, 'draft', 0, ?, ?)""",
        (t["subject"], body, t["category_id"], user["id"], now, now),
    )
    db.get_db().commit()
    article = dict(db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (cur.lastrowid,)).fetchone())
    # The new draft starts life linked to the ticket it came from.
    db.get_db().execute(
        "INSERT INTO ticket_kb_links (ticket_id, article_id, linked_by_id, note, created_at) VALUES (?,?,?,?,?)",
        (tid, article["id"], user["id"], "Promoted from ticket", now))
    db.get_db().commit()
    return jsonify(article=article), 201


# ---------------------------------------------------------------------------
# Dashboard aggregates (FR-16, FR-17)
# ---------------------------------------------------------------------------
@tickets.route("/api/dashboard")
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
            f"SELECT COUNT(*) c FROM tickets t {where} {'AND' if where else 'WHERE'} t.status = ?",
            wparams + [st],
        ).fetchone()
        counts[st] = row["c"]

    unassigned = dbc.execute(
        f"SELECT COUNT(*) c FROM tickets t {where} "
        f"{'AND' if where else 'WHERE'} t.assignee_id IS NULL AND t.status != ?",
        wparams + [config.STATUS_CLOSED],
    ).fetchone()["c"]

    urgent = dbc.execute(
        f"SELECT COUNT(*) c FROM tickets t {where} "
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
            FROM tickets t {where}
            {'AND' if where else 'WHERE'} t.resolved_at IS NOT NULL
            AND t.resolved_at >= datetime('now','-7 days','utc')""",
        wparams,
    ).fetchone()["av"]
    avg_resolution_hours = round(avg, 1) if avg is not None else None

    # Aged tickets (FR-17)
    aged = _aged_tickets(where, wparams)

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
            "SELECT COUNT(*) c FROM tickets t "
            "WHERE t.assignee_id = ? AND t.status NOT IN (?,?)",
            (uid, config.STATUS_RESOLVED, config.STATUS_CLOSED),
        ).fetchone()["c"]
        my_assigned_today = dbc.execute(
            "SELECT COUNT(*) c FROM tickets t "
            "WHERE t.assignee_id = ? AND date(t.created_at,'utc') = ?",
            (uid, today),
        ).fetchone()["c"]
        my_urgent = dbc.execute(
            "SELECT COUNT(*) c FROM tickets t "
            "WHERE t.assignee_id = ? AND t.priority = ? AND t.status NOT IN (?,?)",
            (uid, config.PRIORITY_URGENT, config.STATUS_RESOLVED, config.STATUS_CLOSED),
        ).fetchone()["c"]
        my_blocked = dbc.execute(
            "SELECT COUNT(*) c FROM tickets t "
            "WHERE t.assignee_id = ? AND t.status = ?",
            (uid, config.STATUS_BLOCKED),
        ).fetchone()["c"]
        my_resolved_today = dbc.execute(
            "SELECT COUNT(*) c FROM tickets t "
            "WHERE t.assignee_id = ? AND t.resolved_at IS NOT NULL "
            "AND date(t.resolved_at,'utc') = ?",
            (uid, today),
        ).fetchone()["c"]
        my_rated = dbc.execute(
            "SELECT COUNT(*) c FROM tickets t "
            "WHERE t.assignee_id = ? AND t.csat IS NOT NULL",
            (uid,),
        ).fetchone()["c"]
        first_response_avg = dbc.execute(
            "SELECT AVG((julianday(ts.first_response_at) - julianday(t.created_at)) * 24.0) av "
            "FROM ticket_sla ts JOIN tickets t ON ts.ticket_id = t.id "
            "WHERE t.assignee_id = ? AND ts.first_response_at IS NOT NULL",
            (uid,),
        ).fetchone()["av"]
        resolution_avg = dbc.execute(
            "SELECT AVG((julianday(t.resolved_at) - julianday(t.created_at)) * 24.0) av "
            "FROM tickets t "
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


@tickets.route("/api/meta")
@login_required
def meta():
    dbc = db.get_db()
    teams = [dict(r) for r in dbc.execute("SELECT * FROM teams ORDER BY name")]
    cats = [dict(r) for r in dbc.execute(
        "SELECT * FROM categories WHERE active=1 ORDER BY name")]
    # SECURITY: a requester must NOT receive the full staff directory.
    # Only agents/managers (who assign tickets) need the user list.
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
def _fetch(tid):
    return db.get_db().execute(
        "SELECT * FROM tickets WHERE id = ?", (tid,)
    ).fetchone()


def _next_ref():
    # OPS-<sequential> based on max id (simple & readable).
    row = db.get_db().execute(
        "SELECT COALESCE(MAX(id),0)+1 AS n FROM tickets"
    ).fetchone()
    return f"OPS-{row['n']:04d}"


def _within_reopen_window(t):
    # Tickets closed without ever being resolved have no resolved_at; fall
    # back to closed_at so the reopen window still applies from closure.
    ref = t["resolved_at"] or t["closed_at"]
    if not ref:
        return False
    rt = datetime.fromisoformat(ref)
    return datetime.now(timezone.utc) - rt < timedelta(
        hours=config.REOPEN_WINDOW_HOURS)


def _aged_tickets(where, wparams):
    """Return tickets matching the aged definition (FR-17)."""
    dbc = db.get_db()
    # New & unassigned > 4h, OR in_progress with no update > 48h.
    rows = dbc.execute(
        f"""SELECT * FROM tickets t {where}
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


def _comments_for(tid, user):
    rows = db.get_db().execute(
        "SELECT * FROM ticket_comments WHERE ticket_id=? ORDER BY created_at ASC",
        (tid,),
    ).fetchall()
    out = []
    for r in rows:
        # Requesters never see internal notes.
        if r["visibility"] == config.VIS_INTERNAL and \
           user["role"] == config.ROLE_REQUESTER:
            continue
        out.append(_serialize_comment(r))
    return out


def _attachments_for(tid):
    rows = db.get_db().execute(
        "SELECT * FROM ticket_attachments WHERE ticket_id=? ORDER BY created_at ASC",
        (tid,),
    ).fetchall()
    return [_serialize_attachment(r) for r in rows]


def _activity_for(tid):
    rows = db.get_db().execute(
        "SELECT * FROM ticket_activity WHERE ticket_id=? ORDER BY created_at ASC",
        (tid,),
    ).fetchall()
    return [dict(r) for r in rows]


def _serialize(t, sla_row=None):
    name_row = lambda uid: db.get_db().execute(
        "SELECT name FROM users WHERE id=?", (uid,)
    ).fetchone()
    requester_name = name_row(t["requester_id"])["name"] if t["requester_id"] else None
    assignee_name = name_row(t["assignee_id"])["name"] if t["assignee_id"] else None
    return {
        "id": t["id"],
        "ticket_ref": t["ticket_ref"],
        "subject": t["subject"],
        "description": t["description"],
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

def _sla_summary(tid, sla_row=None):
    """Lightweight SLA readout for ticket serialization.

    Delegates to routes_sla.summarize, which computes breach LIVE (overdue open
    tickets are reported as breached) so the badge is accurate without a sweep.
    If the list query already JOINed the SLA row (sla_row), pass it through to
    avoid a per-row extra SELECT (N+1).
    The caller has already authorized the ticket.
    """
    return sla.summarize(tid, sla_row)


def _serialize_comment(c):
    author_name = None
    if c["author_id"]:
        row = db.get_db().execute("SELECT name FROM users WHERE id=?", (c["author_id"],)).fetchone()
        author_name = row["name"] if row else None
    return {
        "id": c["id"], "ticket_id": c["ticket_id"], "author_id": c["author_id"],
        "author_name": author_name, "body": c["body"], "visibility": c["visibility"],
        "created_at": c["created_at"],
    }


def _serialize_attachment(a):
    return {
        "id": a["id"], "ticket_id": a["ticket_id"], "filename": a["filename"],
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
