"""
Notification API (Phase 1).

Endpoints (all require login):
  GET  /api/notifications            -> my notifications (newest first, includes
                                         unread_count so the bell can badge)
  POST /api/notifications/<id>/read  -> mark one read (must belong to caller)
  POST /api/notifications/read-all   -> mark all of mine read

In-app notifications are the source of truth; email (if configured) is a
best-effort mirror handled by app/notifications.py.
"""
from flask import Blueprint, request, jsonify

from . import db, helpers
from .helpers import login_required

notif = Blueprint("notif", __name__)


@notif.route("/api/notifications")
@login_required
def list_notifications():
    uid = request.current_user["id"]
    total = db.get_db().execute(
        "SELECT COUNT(*) AS c FROM notifications_v2 WHERE user_id=?", (uid,)
    ).fetchone()["c"]
    rows = db.get_db().execute(
        """SELECT n.*, ji.issue_key, ji.summary
             FROM notifications_v2 n
        LEFT JOIN jira_issues ji ON ji.id = n.entity_id
                               AND n.entity_type = 'jira_issue'
            WHERE n.user_id = ?
         ORDER BY n.created_at DESC
            LIMIT ?""",
        (uid, min(50, max(1, int(request.args.get("per_page", "25") or "25")))),
    ).fetchall()
    page = max(1, int(request.args.get("page", "1") or "1"))
    per_page = max(1, min(100, int(request.args.get("per_page", "25") or "25")))
    start = (page - 1) * per_page
    page_rows = rows[start:start + per_page]
    unread = db.get_db().execute(
        "SELECT COUNT(*) AS c FROM notifications_v2 WHERE user_id=? AND read=0", (uid,),
    ).fetchone()["c"]
    return jsonify(
        notifications=[_serialize(r) for r in page_rows],
        unread_count=unread,
        pagination={"page": page, "per_page": per_page, "total": total, "pages": max(1, (total + per_page - 1) // per_page)},
    )


@notif.route("/api/notifications/<int:nid>/read", methods=["POST"])
@login_required
@helpers.csrf_protect
def mark_read(nid):
    uid = request.current_user["id"]
    row = db.get_db().execute(
        "SELECT id FROM notifications_v2 WHERE id=? AND user_id=?", (nid, uid)
    ).fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    db.get_db().execute(
        "UPDATE notifications_v2 SET read=1 WHERE id=?", (nid,)
    )
    db.get_db().commit()
    return jsonify(ok=True)


@notif.route("/api/notifications/read-all", methods=["POST"])
@login_required
@helpers.csrf_protect
def mark_all_read():
    uid = request.current_user["id"]
    db.get_db().execute(
        "UPDATE notifications_v2 SET read=1 WHERE user_id=?", (uid,)
    )
    db.get_db().commit()
    return jsonify(ok=True)


def _serialize(n):
    return {
        "id": n["id"],
        "entity_type": n["entity_type"],
        "entity_id": n["entity_id"],
        "ticket_id": n["entity_id"] if n["entity_type"] == "jira_issue" else None,
        "issue_key": n["issue_key"],
        "summary": n["summary"],
        "kind": n["kind"],
        "message": n["message"],
        "read": bool(n["read"]),
        "created_at": n["created_at"],
    }
