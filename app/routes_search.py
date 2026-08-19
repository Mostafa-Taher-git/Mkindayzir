"""
Cross-cutting endpoints (Master Plan 5.6 / Phase 6):

  GET  /api/search              global omnisearch across issues, cards, notes
  POST /api/entity-links        link two entities (issue/card/note/goal/chat)
  GET  /api/entity-links        list links originating from one entity
  DELETE /api/entity-links/<id> remove a link (creator or admin only)

All queries respect the same RBAC as the owning modules: requesters see only
their own issues and published notes; card search is limited to workspaces the
user belongs to. Search is best-effort and never errors on an empty query (the
command palette may call it with no text yet).
"""
from flask import Blueprint, request, jsonify

from . import db, config, helpers
from .helpers import login_required, csrf_protect

search = Blueprint("search", __name__)

# Entity types that may participate in a cross-entity link.
ALLOWED = {"jira_issue", "trello_card", "kb_note", "goal", "ai_chat"}


# ---------------------------------------------------------------------------
# Omnisearch
# ---------------------------------------------------------------------------
@search.route("/api/search", methods=["GET"])
@login_required
def omnisearch():
    user = request.current_user
    q = (request.args.get("q") or "").strip()
    scope = request.args.get("scope", "all")
    if scope not in ("all", "issues", "cards", "notes"):
        scope = "all"
    try:
        limit = int(request.args.get("limit", 5))
    except (TypeError, ValueError):
        limit = 5
    limit = max(1, min(limit, 25))

    # Empty query: return empty groups so the palette can pre-render nothing.
    if not q:
        return jsonify(issues=[], cards=[], notes=[])

    like = "%" + q + "%"
    out = {"issues": [], "cards": [], "notes": []}

    # --- Issues -------------------------------------------------------------
    if scope in ("all", "issues"):
        sql = ("SELECT id, issue_key, summary, status FROM jira_issues "
               "WHERE (summary || ' ' || COALESCE(description, '')) LIKE ?")
        params = [like]
        # Requesters only see issues they raised or are assigned to.
        if user["role"] == config.ROLE_REQUESTER:
            sql += " AND (requester_id = ? OR assignee_id = ?)"
            params += [user["id"], user["id"]]
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        out["issues"] = [dict(r) for r in
                         db.get_db().execute(sql, params).fetchall()]

    # --- Cards --------------------------------------------------------------
    if scope in ("all", "cards"):
        sql = ("SELECT c.id, c.title, b.title AS board_name "
               "FROM trello_cards c "
               "JOIN trello_lists l ON l.id = c.list_id "
               "JOIN trello_boards b ON b.id = l.board_id "
               "JOIN trello_workspaces w ON w.id = b.workspace_id "
               "JOIN trello_workspace_members m "
               "  ON m.workspace_id = w.id AND m.user_id = ? "
               "WHERE (c.title || ' ' || COALESCE(c.description, '')) LIKE ? "
               "ORDER BY c.id DESC LIMIT ?")
        out["cards"] = [dict(r) for r in
                        db.get_db().execute(sql, [user["id"], like, limit]).fetchall()]

    # --- Notes --------------------------------------------------------------
    if scope in ("all", "notes"):
        sql = ("SELECT id, title, status FROM kb_notes "
               "WHERE (title || ' ' || COALESCE(content, '')) LIKE ?")
        params = [like]
        # Requesters only see published knowledge.
        if user["role"] == config.ROLE_REQUESTER:
            sql += " AND status = 'published'"
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        out["notes"] = [dict(r) for r in
                        db.get_db().execute(sql, params).fetchall()]

    return jsonify(**out)


# ---------------------------------------------------------------------------
# Cross-entity links
# ---------------------------------------------------------------------------
@search.route("/api/entity-links", methods=["POST"])
@login_required
@csrf_protect
def create_entity_link():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    st = data.get("source_type")
    si = data.get("source_id")
    tt = data.get("target_type")
    ti = data.get("target_id")
    if st not in ALLOWED or tt not in ALLOWED:
        return jsonify(error="Invalid entity type"), 400
    if st == tt and si == ti:
        return jsonify(error="An entity cannot link to itself"), 400
    try:
        si, ti = int(si), int(ti)
    except (TypeError, ValueError):
        return jsonify(error="Invalid entity id"), 400

    conn = db.get_db()
    # UNIQUE(source_type, source_id, target_type, target_id) blocks dupes.
    cur = conn.execute(
        """INSERT OR IGNORE INTO entity_links
           (source_type, source_id, target_type, target_id, created_by, created_at)
           VALUES (?,?,?,?,?,?)""",
        (st, si, tt, ti, user["id"], db.now_iso()))
    conn.commit()
    existed = cur.rowcount == 0
    row = conn.execute(
        "SELECT id, source_type, source_id, target_type, target_id, created_at "
        "FROM entity_links "
        "WHERE source_type=? AND source_id=? AND target_type=? AND target_id=?",
        (st, si, tt, ti)).fetchone()
    return jsonify(link=dict(row)), (200 if existed else 201)


@search.route("/api/entity-links", methods=["GET"])
@login_required
def list_entity_links():
    st = request.args.get("source_type")
    si = request.args.get("source_id")
    if st is None or si is None:
        return jsonify(error="source_type and source_id are required"), 400
    if st not in ALLOWED:
        return jsonify(error="Invalid entity type"), 400
    try:
        si = int(si)
    except (TypeError, ValueError):
        return jsonify(error="Invalid source_id"), 400
    rows = db.get_db().execute(
        "SELECT id, source_type, source_id, target_type, target_id, created_at "
        "FROM entity_links WHERE source_type=? AND source_id=? ORDER BY id",
        (st, si)).fetchall()
    return jsonify(links=[dict(r) for r in rows])


@search.route("/api/entity-links/<int:link_id>", methods=["DELETE"])
@login_required
@csrf_protect
def delete_entity_link(link_id):
    user = request.current_user
    conn = db.get_db()
    row = conn.execute("SELECT * FROM entity_links WHERE id=?", (link_id,)).fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    # Only the creator or an admin may remove a link.
    if row["created_by"] != user["id"] and user["role"] != config.ROLE_ADMIN:
        return jsonify(error="Forbidden"), 403
    conn.execute("DELETE FROM entity_links WHERE id=?", (link_id,))
    conn.commit()
    return jsonify(ok=True)
