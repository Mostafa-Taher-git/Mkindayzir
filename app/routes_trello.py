"""
Trello workspace routes (Phase 2A).

Endpoints (see Master Plan §5.2):
  GET/POST   /api/trello/workspaces
  PATCH      /api/trello/workspaces/<id>            (WS admin)
  GET/POST   /api/trello/workspaces/<id>/members
  DELETE     /api/trello/workspaces/<id>/members/<uid>
  GET        /api/trello/boards?workspace_id=&starred=1
  POST       /api/trello/boards
  GET/PATCH  /api/trello/boards/<id>
  POST       /api/trello/boards/<id>/lists
  PATCH      /api/trello/lists/<id>
  POST       /api/trello/cards
  PATCH/DELETE /api/trello/cards/<id>
  POST       /api/trello/cards/<id>/move
  POST/DELETE /api/trello/cards/<id>/members[/<uid>]
  POST       /api/trello/cards/<id>/comments
  POST       /api/trello/cards/<id>/checklists
  PATCH      /api/trello/checklists/<id>
  POST       /api/trello/checklists/<id>/items
  PATCH      /api/trello/checklist-items/<id>
  POST       /api/trello/boards/<id>/labels
  POST/DELETE /api/trello/cards/<id>/labels[/<lid>]

Access model: every board/card operation requires workspace membership
(_check_ws_member). Workspace roles: admin > member > viewer (viewers may
read; board/card writes need member+). Comments + activity use the shared
polymorphic tables with entity_type='trello_card'.

Position management: REAL positions. New/moved items get
(prev.position + next.position) / 2; when a position accumulates more than
10 decimal digits the group is rebalanced back to spaced integers.
"""
import json

from flask import Blueprint, request, jsonify

from . import db, config, helpers, notifications
from .helpers import login_required, csrf_protect

trello = Blueprint("trello", __name__)

CARD_TYPE = "trello_card"
WS_ROLES = ("admin", "member", "viewer")
POS_DEFAULT = 65535.0


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------
def _ws_row(ws_id):
    return db.get_db().execute(
        "SELECT * FROM trello_workspaces WHERE id=?", (ws_id,)).fetchone()


def _ws_member(ws_id, uid):
    return db.get_db().execute(
        "SELECT * FROM trello_workspace_members WHERE workspace_id=? AND user_id=?",
        (ws_id, uid)).fetchone()


def _ws_role(ws_id, uid):
    """Workspace role for a user; the owner counts as admin even if the
    membership row is missing (legacy safety)."""
    m = _ws_member(ws_id, uid)
    if m:
        return m["role"]
    owner = _ws_row(ws_id)
    if owner and owner["owner_id"] == uid:
        return "admin"
    return None


def _ws_member_or_403(ws_id, uid):
    """Return the membership row or a 403 response (no member -> 404 to
    avoid leaking workspace existence)."""
    m = _ws_member(ws_id, uid)
    if not m:
        return None
    return m


def _board_ws(board_id):
    """Fetch a board + its workspace row; None if the board is missing."""
    b = db.get_db().execute(
        "SELECT * FROM trello_boards WHERE id=?", (board_id,)).fetchone()
    if not b:
        return None, None
    return b, _ws_row(b["workspace_id"])


def _require_ws_member(ws_id, user):
    """Returns (workspace, member_row) or None; routes 404 when None so
    non-members cannot probe workspace ids."""
    ws = _ws_row(ws_id)
    if not ws:
        return None, None
    m = _ws_member(ws_id, user["id"])
    if not m and ws["owner_id"] != user["id"]:
        return None, None
    return ws, m


def _require_ws_admin(ws_id, user):
    """(ws, status): status is None for an admin, 403 for a member with a
    lesser role, 404 when the workspace is unknown or the user is not a
    member (no existence probing)."""
    ws = _ws_row(ws_id)
    if not ws:
        return None, 404
    m = _ws_member(ws_id, user["id"])
    if ws["owner_id"] == user["id"]:
        return ws, None
    if not m:
        return None, 404
    if m["role"] != "admin":
        return None, 403
    return ws, None


def _writable(user, ws_id):
    """member+ (viewers can read only)."""
    role = _ws_role(ws_id, user["id"])
    return role in ("admin", "member")


def _board_scope(board_id, user):
    """(board, ws) with membership verified; None tuple -> 404."""
    b, ws = _board_ws(board_id)
    if not b or not ws:
        return None, None
    if _ws_role(b["workspace_id"], user["id"]) is None:
        return None, None
    return b, ws


# ---------------------------------------------------------------------------
# Position management (plan §4.3: midpoint insertion + rebalance)
# ---------------------------------------------------------------------------
def _pos_midpoint(conn, table, group_col, group_id, pos_col, before_id=None,
                  after_id=None):
    """Compute the insertion position. `before_id`: existing row this one
    sits BEFORE (smaller position); `after_id`: row it sits AFTER. With
    neither, append at the end (between last and POS_DEFAULT)."""
    def _max_pos():
        last = conn.execute(
            f"SELECT MAX({pos_col}) p FROM {table} WHERE {group_col}=?",
            (group_id,)).fetchone()
        return last["p"] if last and last["p"] is not None else 0.0

    if before_id:
        nxt_row = conn.execute(
            f"SELECT {pos_col} p FROM {table} WHERE id=?", (before_id,)).fetchone()
        nxt = nxt_row["p"] if nxt_row else POS_DEFAULT
        prev_row = conn.execute(
            f"SELECT {pos_col} p FROM {table} WHERE {group_col}=? AND {pos_col}<? "
            f"ORDER BY {pos_col} DESC LIMIT 1", (group_id, nxt)).fetchone()
        prev = prev_row["p"] if prev_row else 0.0
    elif after_id:
        prev_row = conn.execute(
            f"SELECT {pos_col} p FROM {table} WHERE id=?", (after_id,)).fetchone()
        prev = prev_row["p"] if prev_row else 0.0
        nxt_row = conn.execute(
            f"SELECT {pos_col} p FROM {table} WHERE {group_col}=? AND {pos_col}>? "
            f"ORDER BY {pos_col} ASC LIMIT 1", (group_id, prev)).fetchone()
        nxt = nxt_row["p"] if nxt_row else POS_DEFAULT
    else:
        prev = _max_pos()
        nxt = POS_DEFAULT
    if prev >= nxt:
        # Invalid ordering hints: fall back to appending at the end.
        prev, nxt = _max_pos(), POS_DEFAULT
    return (prev + nxt) / 2.0


def _maybe_rebalance(conn, table, group_col, group_id, pos_col):
    """Renumber a group's positions to spaced integers when any position has
    more than 10 decimal digits (float precision loss from midpoints)."""
    rows = conn.execute(
        f"SELECT id, {pos_col} p FROM {table} WHERE {group_col}=? "
        f"ORDER BY {pos_col}, id", (group_id,)).fetchall()
    bad = False
    for r in rows:
        frac = str(r["p"]).split(".")
        if len(frac) == 2 and len(frac[1]) > 10:
            bad = True
            break
    if not bad:
        return
    for i, r in enumerate(rows, start=1):
        conn.execute(f"UPDATE {table} SET {pos_col}=? WHERE id=?",
                     (float(i * 65536), r["id"]))


def _place(conn, table, group_col, group_id, pos_col, before_id, after_id,
           item_id):
    """Set an item's position (midpoint or rebalance) and commit position
    integrity for its group."""
    if before_id is None and after_id is None:
        return
    pos = _pos_midpoint(conn, table, group_col, group_id, pos_col,
                        before_id=before_id, after_id=after_id)
    conn.execute(f"UPDATE {table} SET {pos_col}=? WHERE id=?", (pos, item_id))
    _maybe_rebalance(conn, table, group_col, group_id, pos_col)


def _card_activity(card_id, actor_id, action, **detail):
    helpers.log_activity(CARD_TYPE, card_id, actor_id, action, detail=detail)


# ---------------------------------------------------------------------------
# Workspaces
# ---------------------------------------------------------------------------
@trello.route("/api/trello/workspaces", methods=["GET"])
@login_required
def list_workspaces():
    """The user's workspaces (owned or member) with their role + board count."""
    user = request.current_user
    rows = db.get_db().execute(
        """SELECT w.*, m.role AS member_role,
                  (SELECT COUNT(*) FROM trello_boards b
                   WHERE b.workspace_id=w.id AND b.is_archived=0) AS board_count
           FROM trello_workspaces w
           LEFT JOIN trello_workspace_members m
                  ON m.workspace_id=w.id AND m.user_id=?
           WHERE w.owner_id=? OR m.user_id IS NOT NULL
           ORDER BY w.created_at DESC""",
        (user["id"], user["id"])).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["role"] = "admin" if r["owner_id"] == user["id"] else r["member_role"]
        out.append(d)
    return jsonify(workspaces=out)


@trello.route("/api/trello/workspaces", methods=["POST"])
@login_required
@csrf_protect
def create_workspace():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name or len(name) > 100:
        return jsonify(error="name is required"), 400
    visibility = data.get("visibility", "workspace")
    if visibility not in ("private", "workspace", "public"):
        return jsonify(error="Invalid visibility"), 400
    now = db.now_iso()
    cur = db.get_db().execute(
        """INSERT INTO trello_workspaces (name, description, owner_id, visibility, created_at)
           VALUES (?,?,?,?,?)""",
        (name, (data.get("description") or "").strip(), user["id"],
         visibility, now))
    ws_id = cur.lastrowid
    db.get_db().execute(
        """INSERT INTO trello_workspace_members (workspace_id, user_id, role, joined_at)
           VALUES (?,?,?,?)""",
        (ws_id, user["id"], "admin", now))
    db.get_db().commit()
    helpers.audit(user["id"], "workspace.create", entity_type="trello_workspace",
                  entity_id=ws_id, details={"name": name, "visibility": visibility})
    ws = _ws_row(ws_id)
    return jsonify(workspace=dict(ws, role="admin", board_count=0)), 201


@trello.route("/api/trello/workspaces/<int:ws_id>", methods=["PATCH"])
@login_required
@csrf_protect
def update_workspace(ws_id):
    user = request.current_user
    ws, status = _require_ws_admin(ws_id, user)
    if status:
        return jsonify(error="Forbidden" if status == 403 else "Not found"), status
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or ws["name"]).strip()
    if not name:
        return jsonify(error="name is required"), 400
    visibility = data.get("visibility", ws["visibility"])
    if visibility not in ("private", "workspace", "public"):
        return jsonify(error="Invalid visibility"), 400
    db.get_db().execute(
        """UPDATE trello_workspaces SET name=?, description=?, visibility=?
           WHERE id=?""",
        (name, data.get("description", ws["description"]), visibility, ws_id))
    db.get_db().commit()
    helpers.audit(user["id"], "workspace.update", entity_type="trello_workspace",
                  entity_id=ws_id,
                  details={"name": name, "visibility": visibility})
    return jsonify(workspace=dict(db.get_db().execute(
        "SELECT * FROM trello_workspaces WHERE id=?", (ws_id,)).fetchone()))


@trello.route("/api/trello/workspaces/<int:ws_id>/members", methods=["GET"])
@login_required
def list_members(ws_id):
    user = request.current_user
    ws, m = _require_ws_member(ws_id, user)
    if not ws:
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        """SELECT u.id, u.name, u.email, u.role AS user_role, m.role AS ws_role
           FROM trello_workspace_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id=?
           ORDER BY (m.role='admin') DESC, u.name""",
        (ws_id,)).fetchall()
    return jsonify(members=[dict(r) for r in rows])


@trello.route("/api/trello/workspaces/<int:ws_id>/members", methods=["POST"])
@login_required
@csrf_protect
def add_member(ws_id):
    user = request.current_user
    ws, status = _require_ws_admin(ws_id, user)
    if status:
        return jsonify(error="Forbidden" if status == 403 else "Not found"), status
    data = request.get_json(silent=True) or {}
    try:
        uid = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify(error="user_id is required"), 400
    role = data.get("role", "member")
    if role not in WS_ROLES:
        return jsonify(error="Invalid role"), 400
    target = db.get_db().execute(
        "SELECT id, name FROM users WHERE id=?", (uid,)).fetchone()
    if not target:
        return jsonify(error="User not found"), 404
    if _ws_member(ws_id, uid):
        return jsonify(error="Already a member"), 409
    db.get_db().execute(
        """INSERT INTO trello_workspace_members (workspace_id, user_id, role, joined_at)
           VALUES (?,?,?,?)""",
        (ws_id, uid, role, db.now_iso()))
    db.get_db().commit()
    helpers.audit(user["id"], "workspace.member_add", entity_type="trello_workspace",
                  entity_id=ws_id, details={"user_id": uid, "role": role})
    return jsonify(member={"user_id": uid, "ws_role": role, "name": target["name"]}), 201


@trello.route("/api/trello/workspaces/<int:ws_id>/members/<int:uid>",
              methods=["DELETE"])
@login_required
@csrf_protect
def remove_member(ws_id, uid):
    user = request.current_user
    ws, status = _require_ws_admin(ws_id, user)
    if status:
        return jsonify(error="Forbidden" if status == 403 else "Not found"), status
    if ws["owner_id"] == uid:
        return jsonify(error="The owner cannot be removed"), 400
    cur = db.get_db().execute(
        "DELETE FROM trello_workspace_members WHERE workspace_id=? AND user_id=?",
        (ws_id, uid))
    db.get_db().commit()
    if not cur.rowcount:
        return jsonify(error="Not a member"), 404
    helpers.audit(user["id"], "workspace.member_remove",
                  entity_type="trello_workspace", entity_id=ws_id,
                  details={"user_id": uid})
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------
@trello.route("/api/trello/boards", methods=["GET"])
@login_required
def list_boards():
    """Boards for a workspace (members only). ?starred=1 filters starred."""
    user = request.current_user
    try:
        ws_id = int(request.args.get("workspace_id", 0))
    except (TypeError, ValueError):
        return jsonify(error="workspace_id is required"), 400
    ws, m = _require_ws_member(ws_id, user)
    if not ws:
        return jsonify(error="Not found"), 404
    q = ("SELECT b.*, (SELECT COUNT(*) FROM trello_lists l WHERE l.board_id=b.id "
         "AND l.is_archived=0) AS list_count FROM trello_boards b "
         "WHERE b.workspace_id=? AND b.is_archived=0")
    params = [ws_id]
    if request.args.get("starred") == "1":
        q += " AND b.is_starred=1"
    q += " ORDER BY b.is_starred DESC, b.title"
    return jsonify(boards=[dict(r) for r in
                           db.get_db().execute(q, params).fetchall()])


@trello.route("/api/trello/boards", methods=["POST"])
@login_required
@csrf_protect
def create_board():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    try:
        ws_id = int(data.get("workspace_id"))
    except (TypeError, ValueError):
        return jsonify(error="workspace_id is required"), 400
    ws, m = _require_ws_member(ws_id, user)
    if not ws:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws_id):
        return jsonify(error="Forbidden"), 403
    title = (data.get("title") or "").strip()
    if not title or len(title) > 120:
        return jsonify(error="title is required"), 400
    cur = db.get_db().execute(
        """INSERT INTO trello_boards (workspace_id, title, description, background, created_at)
           VALUES (?,?,?,?,?)""",
        (ws_id, title, (data.get("description") or "").strip(),
         data.get("background") or "#0079BF", db.now_iso()))
    db.get_db().commit()
    helpers.audit(user["id"], "board.create", entity_type="trello_board",
                  entity_id=cur.lastrowid,
                  details={"title": title, "workspace_id": ws_id})
    return jsonify(board=dict(db.get_db().execute(
        "SELECT * FROM trello_boards WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@trello.route("/api/trello/boards/<int:bid>", methods=["GET"])
@login_required
def get_board(bid):
    """Full board: lists (with cards), labels, workspace, members."""
    user = request.current_user
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    dbc = db.get_db()
    labels = [dict(r) for r in dbc.execute(
        "SELECT * FROM trello_labels WHERE board_id=? ORDER BY name", (bid,))]
    lists_rows = dbc.execute(
        "SELECT * FROM trello_lists WHERE board_id=? AND is_archived=0 "
        "ORDER BY position, id", (bid,)).fetchall()
    cards = [dict(r) for r in dbc.execute(
        """SELECT c.*, l.title AS list_title
           FROM trello_cards c JOIN trello_lists l ON l.id=c.list_id
           WHERE l.board_id=? AND l.is_archived=0
           ORDER BY l.position, c.position, c.id""", (bid,)).fetchall()]
    labels_by_card = {}
    members_by_card = {}
    checklists_by_card = {}
    for c in cards:
        labels_by_card[c["id"]] = [dict(r) for r in dbc.execute(
            """SELECT l.* FROM trello_card_labels cl
               JOIN trello_labels l ON l.id=cl.label_id
               WHERE cl.card_id=? ORDER BY l.name""", (c["id"],)).fetchall()]
        members_by_card[c["id"]] = [dict(r) for r in dbc.execute(
            """SELECT u.id, u.name, u.email FROM trello_card_members cm
               JOIN users u ON u.id=cm.user_id
               WHERE cm.card_id=? ORDER BY u.name""", (c["id"],)).fetchall()]
        checklists_by_card[c["id"]] = [dict(r) for r in dbc.execute(
            """SELECT cl.*,
                      (SELECT COUNT(*) FROM trello_checklist_items i
                       WHERE i.checklist_id=cl.id AND i.is_checked=1) AS done,
                      (SELECT COUNT(*) FROM trello_checklist_items i
                       WHERE i.checklist_id=cl.id) AS total
               FROM trello_checklists cl WHERE cl.card_id=?
               ORDER BY cl.position, cl.id""", (c["id"],)).fetchall()]
        for cl in checklists_by_card[c["id"]]:
            cl["items"] = [dict(r) for r in dbc.execute(
                "SELECT * FROM trello_checklist_items WHERE checklist_id=? "
                "ORDER BY position, id", (cl["id"],)).fetchall()]
    members = [dict(r) for r in dbc.execute(
        """SELECT u.id, u.name, u.email, m.role
           FROM trello_workspace_members m JOIN users u ON u.id=m.user_id
           WHERE m.workspace_id=? ORDER BY u.name""", (ws["id"],)).fetchall()]
    return jsonify(
        board=dict(b),
        workspace={"id": ws["id"], "name": ws["name"], "owner_id": ws["owner_id"]},
        labels=labels,
        members=members,
        lists=[dict(r, cards=[{
            **c, "labels": labels_by_card.get(c["id"], []),
            "card_members": members_by_card.get(c["id"], []),
            "checklists": checklists_by_card.get(c["id"], []),
        } for c in cards if c["list_id"] == r["id"]]) for r in lists_rows])


@trello.route("/api/trello/boards/<int:bid>", methods=["PATCH"])
@login_required
@csrf_protect
def update_board(bid):
    user = request.current_user
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or b["title"]).strip()
    if not title:
        return jsonify(error="title is required"), 400
    db.get_db().execute(
        """UPDATE trello_boards SET title=?, description=?, background=?,
           is_starred=?, is_archived=? WHERE id=?""",
        (title, data.get("description", b["description"]),
         data.get("background", b["background"]),
         1 if data.get("is_starred", b["is_starred"]) else 0,
         1 if data.get("is_archived", b["is_archived"]) else 0, bid))
    db.get_db().commit()
    helpers.audit(user["id"], "board.update", entity_type="trello_board",
                  entity_id=bid,
                  details={"title": title,
                           "is_archived": bool(data.get("is_archived", b["is_archived"]))})
    return jsonify(board=dict(db.get_db().execute(
        "SELECT * FROM trello_boards WHERE id=?", (bid,)).fetchone()))


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------
@trello.route("/api/trello/boards/<int:bid>/lists", methods=["POST"])
@login_required
@csrf_protect
def create_list(bid):
    user = request.current_user
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title or len(title) > 120:
        return jsonify(error="title is required"), 400
    dbc = db.get_db()
    pos = _pos_midpoint(dbc, "trello_lists", "board_id", bid, "position",
                        before_id=data.get("before_id"),
                        after_id=data.get("after_id"))
    cur = dbc.execute(
        """INSERT INTO trello_lists (board_id, title, position, created_at)
           VALUES (?,?,?,?)""",
        (bid, title, pos, db.now_iso()))
    _maybe_rebalance(dbc, "trello_lists", "board_id", bid, "position")
    dbc.commit()
    return jsonify(list=dict(dbc.execute(
        "SELECT * FROM trello_lists WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@trello.route("/api/trello/lists/<int:lid>", methods=["PATCH"])
@login_required
@csrf_protect
def update_list(lid):
    user = request.current_user
    row = db.get_db().execute("SELECT * FROM trello_lists WHERE id=?", (lid,)).fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    b, ws = _board_scope(row["board_id"], user)
    if not b:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or row["title"]).strip()
    if not title:
        return jsonify(error="title is required"), 400
    dbc = db.get_db()
    dbc.execute(
        "UPDATE trello_lists SET title=?, is_archived=? WHERE id=?",
        (title, 1 if data.get("is_archived", row["is_archived"]) else 0, lid))
    _place(dbc, "trello_lists", "board_id", row["board_id"], "position",
           data.get("before_id"), data.get("after_id"), lid)
    dbc.commit()
    return jsonify(list=dict(dbc.execute(
        "SELECT * FROM trello_lists WHERE id=?", (lid,)).fetchone()))


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------
def _card_scope(card_id, user):
    """(card, board, ws) or None tuple."""
    c = db.get_db().execute("SELECT * FROM trello_cards WHERE id=?", (card_id,)).fetchone()
    if not c:
        return None, None, None
    l = db.get_db().execute("SELECT * FROM trello_lists WHERE id=?", (c["list_id"],)).fetchone()
    if not l:
        return None, None, None
    b, ws = _board_scope(l["board_id"], user)
    if not b:
        return None, None, None
    return c, b, ws


@trello.route("/api/trello/cards", methods=["POST"])
@login_required
@csrf_protect
def create_card():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    try:
        list_id = int(data.get("list_id"))
    except (TypeError, ValueError):
        return jsonify(error="list_id is required"), 400
    row = db.get_db().execute("SELECT * FROM trello_lists WHERE id=?", (list_id,)).fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    b, ws = _board_scope(row["board_id"], user)
    if not b:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    title = (data.get("title") or "").strip()
    if not title or len(title) > 120:
        return jsonify(error="title is required"), 400
    dbc = db.get_db()
    pos = _pos_midpoint(dbc, "trello_cards", "list_id", list_id, "position",
                        before_id=data.get("before_id"),
                        after_id=data.get("after_id"))
    due = data.get("due_date") or None
    if due:
        try:
            from datetime import datetime
            datetime.strptime(due, "%Y-%m-%d")
        except ValueError:
            return jsonify(error="due_date must be YYYY-MM-DD"), 400
    now = db.now_iso()
    cur = dbc.execute(
        """INSERT INTO trello_cards (list_id, title, description, position,
           due_date, cover_color, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (list_id, title, (data.get("description") or "").strip(), pos, due,
         data.get("cover_color"), now, now))
    _maybe_rebalance(dbc, "trello_cards", "list_id", list_id, "position")
    dbc.commit()
    _card_activity(cur.lastrowid, user["id"], "created", title=title)
    return jsonify(card=dict(dbc.execute(
        "SELECT * FROM trello_cards WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@trello.route("/api/trello/cards/<int:cid>", methods=["PATCH"])
@login_required
@csrf_protect
def update_card(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or c["title"]).strip()
    if not title:
        return jsonify(error="title is required"), 400
    due = data.get("due_date", c["due_date"]) or None
    if due:
        try:
            from datetime import datetime
            datetime.strptime(due, "%Y-%m-%d")
        except ValueError:
            return jsonify(error="due_date must be YYYY-MM-DD"), 400
    db.get_db().execute(
        """UPDATE trello_cards SET title=?, description=?, due_date=?,
           is_complete=?, cover_color=?, updated_at=? WHERE id=?""",
        (title, data.get("description", c["description"]), due,
         1 if data.get("is_complete", c["is_complete"]) else 0,
         data.get("cover_color", c["cover_color"]), db.now_iso(), cid))
    db.get_db().commit()
    _card_activity(cid, user["id"], "updated", title=title)
    return jsonify(card=dict(db.get_db().execute(
        "SELECT * FROM trello_cards WHERE id=?", (cid,)).fetchone()))


@trello.route("/api/trello/cards/<int:cid>/move", methods=["POST"])
@login_required
@csrf_protect
def move_card(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    try:
        target_list = int(data.get("list_id", c["list_id"]))
    except (TypeError, ValueError):
        return jsonify(error="Invalid list"), 400
    tl = db.get_db().execute("SELECT * FROM trello_lists WHERE id=?", (target_list,)).fetchone()
    if not tl or tl["board_id"] != b["id"]:
        return jsonify(error="Unknown list on this board"), 400
    dbc = db.get_db()
    dbc.execute("UPDATE trello_cards SET list_id=?, updated_at=? WHERE id=?",
                (target_list, db.now_iso(), cid))
    _place(dbc, "trello_cards", "list_id", target_list, "position",
           data.get("before_id"), data.get("after_id"), cid)
    dbc.commit()
    _card_activity(cid, user["id"], "moved",
                   from_list=c["list_id"], to_list=target_list)
    return jsonify(card=dict(dbc.execute(
        "SELECT * FROM trello_cards WHERE id=?", (cid,)).fetchone()))


@trello.route("/api/trello/cards/<int:cid>", methods=["DELETE"])
@login_required
@csrf_protect
def delete_card(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    db.get_db().execute("DELETE FROM trello_cards WHERE id=?", (cid,))
    db.get_db().commit()
    helpers.audit(user["id"], "card.delete", entity_type="trello_card",
                  entity_id=cid, details={"title": c["title"], "board_id": b["id"]})
    return jsonify(ok=True)


@trello.route("/api/trello/cards/<int:cid>/members", methods=["POST"])
@login_required
@csrf_protect
def add_card_member(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    try:
        uid = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify(error="user_id is required"), 400
    if not _ws_member(ws["id"], uid):
        return jsonify(error="User is not a workspace member"), 400
    db.get_db().execute(
        "INSERT OR IGNORE INTO trello_card_members (card_id, user_id) VALUES (?,?)",
        (cid, uid))
    db.get_db().commit()
    _card_activity(cid, user["id"], "member_added", user_id=uid)
    # Phase 6: tell the added member they were assigned to this card.
    try:
        notifications.notify(uid, CARD_TYPE, cid, "card_assigned",
                             f"You were added to card '{c['title']}'")
    except Exception:
        pass
    return jsonify(ok=True)


@trello.route("/api/trello/cards/<int:cid>/members/<int:uid>", methods=["DELETE"])
@login_required
@csrf_protect
def remove_card_member(cid, uid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    db.get_db().execute(
        "DELETE FROM trello_card_members WHERE card_id=? AND user_id=?",
        (cid, uid))
    db.get_db().commit()
    _card_activity(cid, user["id"], "member_removed", user_id=uid)
    return jsonify(ok=True)


@trello.route("/api/trello/cards/<int:cid>/comments", methods=["POST"])
@login_required
@csrf_protect
def add_card_comment(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    body = (request.get_json(silent=True) or {}).get("body") or ""
    body = body.strip()
    if not body or len(body) > 2000:
        return jsonify(error="body is required"), 400
    cur = db.get_db().execute(
        """INSERT INTO entity_comments (entity_type, entity_id, author_id, body, visibility, created_at)
           VALUES (?,?,?,?,?,?)""",
        (CARD_TYPE, cid, user["id"], body, "public", db.now_iso()))
    db.get_db().commit()
    _card_activity(cid, user["id"], "comment_added")
    row = db.get_db().execute(
        "SELECT * FROM entity_comments WHERE id=?", (cur.lastrowid,)).fetchone()
    author = db.get_db().execute(
        "SELECT name FROM users WHERE id=?", (row["author_id"],)).fetchone()
    return jsonify(comment={**dict(row), "author_name": author["name"]}), 201


# ---------------------------------------------------------------------------
# Checklists
# ---------------------------------------------------------------------------
@trello.route("/api/trello/cards/<int:cid>/checklists", methods=["POST"])
@login_required
@csrf_protect
def add_checklist(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "Checklist").strip()
    dbc = db.get_db()
    nxt = dbc.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 p FROM trello_checklists WHERE card_id=?",
        (cid,)).fetchone()["p"]
    cur = dbc.execute(
        "INSERT INTO trello_checklists (card_id, title, position) VALUES (?,?,?)",
        (cid, title, nxt))
    dbc.commit()
    return jsonify(checklist=dict(dbc.execute(
        "SELECT * FROM trello_checklists WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@trello.route("/api/trello/checklists/<int:clid>", methods=["PATCH"])
@login_required
@csrf_protect
def update_checklist(clid):
    user = request.current_user
    cl = db.get_db().execute("SELECT * FROM trello_checklists WHERE id=?", (clid,)).fetchone()
    if not cl:
        return jsonify(error="Not found"), 404
    c, b, ws = _card_scope(cl["card_id"], user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    title = ((request.get_json(silent=True) or {}).get("title") or cl["title"]).strip()
    if not title:
        return jsonify(error="title is required"), 400
    db.get_db().execute("UPDATE trello_checklists SET title=? WHERE id=?",
                        (title, clid))
    db.get_db().commit()
    return jsonify(checklist=dict(db.get_db().execute(
        "SELECT * FROM trello_checklists WHERE id=?", (clid,)).fetchone()))


@trello.route("/api/trello/checklists/<int:clid>/items", methods=["POST"])
@login_required
@csrf_protect
def add_checklist_item(clid):
    user = request.current_user
    cl = db.get_db().execute("SELECT * FROM trello_checklists WHERE id=?", (clid,)).fetchone()
    if not cl:
        return jsonify(error="Not found"), 404
    c, b, ws = _card_scope(cl["card_id"], user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    content = ((request.get_json(silent=True) or {}).get("content") or "").strip()
    if not content or len(content) > 300:
        return jsonify(error="content is required"), 400
    dbc = db.get_db()
    nxt = dbc.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 p FROM trello_checklist_items WHERE checklist_id=?",
        (clid,)).fetchone()["p"]
    cur = dbc.execute(
        "INSERT INTO trello_checklist_items (checklist_id, content, position) VALUES (?,?,?)",
        (clid, content, nxt))
    dbc.commit()
    return jsonify(item=dict(dbc.execute(
        "SELECT * FROM trello_checklist_items WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@trello.route("/api/trello/checklist-items/<int:iid>", methods=["PATCH"])
@login_required
@csrf_protect
def update_checklist_item(iid):
    user = request.current_user
    it = db.get_db().execute(
        "SELECT * FROM trello_checklist_items WHERE id=?", (iid,)).fetchone()
    if not it:
        return jsonify(error="Not found"), 404
    cl = db.get_db().execute("SELECT * FROM trello_checklists WHERE id=?",
                             (it["checklist_id"],)).fetchone()
    c, b, ws = _card_scope(cl["card_id"], user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or it["content"]).strip()
    if not content:
        return jsonify(error="content is required"), 400
    db.get_db().execute(
        "UPDATE trello_checklist_items SET content=?, is_checked=? WHERE id=?",
        (content, 1 if data.get("is_checked", it["is_checked"]) else 0, iid))
    db.get_db().commit()
    return jsonify(item=dict(db.get_db().execute(
        "SELECT * FROM trello_checklist_items WHERE id=?", (iid,)).fetchone()))


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
@trello.route("/api/trello/boards/<int:bid>/labels", methods=["POST"])
@login_required
@csrf_protect
def create_label(bid):
    user = request.current_user
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    color = (data.get("color") or "").strip()
    if not name or not color:
        return jsonify(error="name and color are required"), 400
    cur = db.get_db().execute(
        "INSERT INTO trello_labels (board_id, name, color) VALUES (?,?,?)",
        (bid, name, color))
    db.get_db().commit()
    return jsonify(label=dict(db.get_db().execute(
        "SELECT * FROM trello_labels WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@trello.route("/api/trello/cards/<int:cid>/labels", methods=["POST"])
@login_required
@csrf_protect
def attach_label(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    data = request.get_json(silent=True) or {}
    try:
        lid = int(data.get("label_id"))
    except (TypeError, ValueError):
        return jsonify(error="label_id is required"), 400
    label = db.get_db().execute(
        "SELECT * FROM trello_labels WHERE id=? AND board_id=?", (lid, b["id"])).fetchone()
    if not label:
        return jsonify(error="Unknown label on this board"), 400
    db.get_db().execute(
        "INSERT OR IGNORE INTO trello_card_labels (card_id, label_id) VALUES (?,?)",
        (cid, lid))
    db.get_db().commit()
    return jsonify(label=dict(label)), 201


@trello.route("/api/trello/cards/<int:cid>/labels/<int:lid>", methods=["DELETE"])
@login_required
@csrf_protect
def detach_label(cid, lid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    db.get_db().execute(
        "DELETE FROM trello_card_labels WHERE card_id=? AND label_id=?", (cid, lid))
    db.get_db().commit()
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Activity (card-level, used by the card modal)
# ---------------------------------------------------------------------------
@trello.route("/api/trello/cards/<int:cid>/activity", methods=["GET"])
@login_required
def card_activity(cid):
    user = request.current_user
    c, b, ws = _card_scope(cid, user)
    if not c:
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        """SELECT a.*, u.name AS actor_name FROM entity_activity a
           LEFT JOIN users u ON u.id=a.actor_id
           WHERE a.entity_type=? AND a.entity_id=? ORDER BY a.created_at DESC""",
        (CARD_TYPE, cid)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["detail"] = json.loads(d["detail"]) if d["detail"] else {}
        except (ValueError, TypeError):
            d["detail"] = {"note": d["detail"]}
        out.append(d)
    return jsonify(activity=out)


# ---------------------------------------------------------------------------
# Phase 2B — Calendar, bulk edits, board activity
# ---------------------------------------------------------------------------
@trello.route("/api/trello/boards/<int:bid>/calendar", methods=["GET"])
@login_required
def board_calendar(bid):
    """Cards with a due date in the requested month (YYYY-MM), plus the
    board's undated cards (for the side panel)."""
    user = request.current_user
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    month = request.args.get("month") or ""
    if month and (len(month) != 7 or month[4] != "-"):
        return jsonify(error="month must be YYYY-MM"), 400
    dbc = db.get_db()
    where = "l.board_id=?"
    params = [bid]
    if month:
        where += " AND c.due_date LIKE ?"
        params.append(month + "-%")
    rows = dbc.execute(
        f"""SELECT c.id, c.title, c.due_date, c.is_complete, c.list_id, c.position,
                   l.title AS list_title
            FROM trello_cards c JOIN trello_lists l ON l.id=c.list_id
            WHERE {where} AND l.is_archived=0
            ORDER BY c.due_date, l.position, c.position""",
        params).fetchall()
    cards = []
    for r in rows:
        d = dict(r)
        d["labels"] = [dict(x) for x in dbc.execute(
            """SELECT l.* FROM trello_card_labels cl
               JOIN trello_labels l ON l.id=cl.label_id
               WHERE cl.card_id=? ORDER BY l.name""", (r["id"],)).fetchall()]
        d["card_members"] = [dict(x) for x in dbc.execute(
            """SELECT u.id, u.name, u.email FROM trello_card_members cm
               JOIN users u ON u.id=cm.user_id
               WHERE cm.card_id=? ORDER BY u.name""", (r["id"],)).fetchall()]
        cards.append(d)
    if month:
        dated = [c for c in cards if c["due_date"]]
        undated = []
    else:
        dated = [c for c in cards if c["due_date"]]
        undated = [c for c in cards if not c["due_date"]]
    return jsonify(month=month, cards=dated, undated=undated)


@trello.route("/api/trello/cards/bulk", methods=["POST"])
@login_required
@csrf_protect
def bulk_cards():
    """Bulk edit cards on one board: move to a list, set due date, toggle
    complete. At least one editable field is required."""
    user = request.current_user
    data = request.get_json(silent=True) or {}
    try:
        bid = int(data.get("board_id"))
        card_ids = [int(i) for i in data.get("card_ids") or []]
    except (TypeError, ValueError):
        return jsonify(error="board_id and card_ids are required"), 400
    if not card_ids:
        return jsonify(error="card_ids is required"), 400
    if len(card_ids) > 200:
        return jsonify(error="Too many cards (max 200)"), 400
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    if not _writable(user, ws["id"]):
        return jsonify(error="Forbidden"), 403
    target_list = None
    if data.get("list_id") is not None:
        try:
            target_list = int(data["list_id"])
        except (TypeError, ValueError):
            return jsonify(error="Invalid list_id"), 400
        row = db.get_db().execute(
            "SELECT * FROM trello_lists WHERE id=?", (target_list,)).fetchone()
        if not row or row["board_id"] != bid:
            return jsonify(error="Unknown list on this board"), 400
    due = data.get("due_date", "KEEP")
    if due != "KEEP" and due is not None:
        try:
            from datetime import datetime
            datetime.strptime(due, "%Y-%m-%d")
        except (ValueError, TypeError):
            return jsonify(error="due_date must be YYYY-MM-DD"), 400
    if target_list is None and due == "KEEP" and data.get("is_complete") is None:
        return jsonify(error="Nothing to update"), 400

    dbc = db.get_db()
    rows = dbc.execute(
        """SELECT c.id, c.list_id FROM trello_cards c
           JOIN trello_lists l ON l.id=c.list_id
           WHERE l.board_id=? AND c.id IN (%s)"""
        % ",".join("?" * len(card_ids)), [bid] + card_ids).fetchall()
    if len(rows) != len(set(card_ids)):
        return jsonify(error="Some cards are not on this board"), 400
    now = db.now_iso()
    for r in rows:
        changes = []
        if target_list is not None and target_list != r["list_id"]:
            pos = _pos_midpoint(dbc, "trello_cards", "list_id", target_list,
                                "position")
            dbc.execute(
                "UPDATE trello_cards SET list_id=?, position=?, updated_at=? WHERE id=?",
                (target_list, pos, now, r["id"]))
            _maybe_rebalance(dbc, "trello_cards", "list_id", target_list,
                             "position")
            changes.append("moved")
        if due != "KEEP":
            dbc.execute("UPDATE trello_cards SET due_date=?, updated_at=? WHERE id=?",
                        (due, now, r["id"]))
            changes.append("due_date")
        if data.get("is_complete") is not None:
            dbc.execute("UPDATE trello_cards SET is_complete=?, updated_at=? WHERE id=?",
                        (1 if data["is_complete"] else 0, now, r["id"]))
            changes.append("complete")
        if changes:
            _card_activity(r["id"], user["id"], "bulk_" + "_".join(changes))
    dbc.commit()
    return jsonify(ok=True, updated=len(rows))


@trello.route("/api/trello/boards/<int:bid>/activity", methods=["GET"])
@login_required
def board_activity(bid):
    """Unified activity feed for a board: card events (entity_activity) plus
    board-level audit entries (create/update/delete)."""
    user = request.current_user
    b, ws = _board_scope(bid, user)
    if not b:
        return jsonify(error="Not found"), 404
    dbc = db.get_db()
    card_ids = [r["id"] for r in dbc.execute(
        """SELECT c.id FROM trello_cards c
           JOIN trello_lists l ON l.id=c.list_id WHERE l.board_id=?""",
        (bid,)).fetchall()]
    events = []
    if card_ids:
        ph = ",".join("?" * len(card_ids))
        events += [dict(r) for r in dbc.execute(
            f"""SELECT a.*, u.name AS actor_name FROM entity_activity a
                LEFT JOIN users u ON u.id=a.actor_id
                WHERE a.entity_type=? AND a.entity_id IN ({ph})""",
            [CARD_TYPE] + card_ids).fetchall()]
    events += [dict(r) for r in dbc.execute(
        """SELECT al.*, u.name AS actor_name, 'board' AS entity_kind,
                  al.details AS detail
           FROM audit_log al LEFT JOIN users u ON u.id=al.user_id
           WHERE al.entity_type='trello_board' AND al.entity_id=? """,
        (bid,)).fetchall()]
    # Card audit entries: current cards by id, plus deleted cards whose audit
    # details record the board they lived on.
    events += [dict(r) for r in dbc.execute(
        f"""SELECT al.*, u.name AS actor_name, 'card' AS entity_kind,
                   al.details AS detail
            FROM audit_log al LEFT JOIN users u ON u.id=al.user_id
            WHERE al.entity_type='trello_card'
              AND (al.entity_id IN ({ph}) OR al.details LIKE ?)"""
        if card_ids else
        """SELECT al.*, u.name AS actor_name, 'card' AS entity_kind,
                  al.details AS detail
           FROM audit_log al LEFT JOIN users u ON u.id=al.user_id
           WHERE al.entity_type='trello_card' AND al.details LIKE ?""",
        (card_ids if card_ids else []) + [f'%"board_id": {bid}%']).fetchall()]
    for e in events:
        try:
            e["detail"] = json.loads(e["detail"]) if e["detail"] else {}
        except (ValueError, TypeError):
            e["detail"] = {"note": e["detail"]}
        e["source"] = "audit" if e.get("entity_kind") in ("board", "card") else "card"
    events.sort(key=lambda e: (e.get("created_at") or ""), reverse=True)
    return jsonify(activity=events[:200])