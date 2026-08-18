"""
Knowledge Base API (Phase 2, migrated to Obsidian-style notes).

Self-service content for requesters plus authoring for agents/managers.

Endpoints (paths unchanged for Phase 0; data model now kb_notes/kb_folders/
kb_wikilinks/kb_note_versions/kb_note_feedback/kb_collections_v2):
  GET  /api/kb                 -> list notes (published for requesters; all for
                                 agents/managers). ?q=search&category_id=&folder_id=
  GET  /api/kb/<id>           -> one note; published views counter increments
  POST /api/kb                -> create (agent/manager); status defaults to 'draft'
  PATCH /api/kb/<id>          -> edit (author or agent/manager)
  POST /api/kb/<id>/publish  -> publish (agent/manager)
  DELETE /api/kb/<id>         -> delete (agent/manager)
  POST /api/kb/<id>/feedback -> "was this helpful?" (any logged-in user)
  GET  /api/kb/folders        -> folder tree
  POST /api/kb/folders        -> create folder (agent/manager)
  GET/POST/DELETE /api/kb/<id>/links (+ <target_id>)
  GET  /api/kb/<id>/versions
  GET/POST /api/kb/collections, GET/POST/DELETE collections/<cid>/notes

Python is kept thin; the editable surface (search UI, authoring form) lives in JS.
"""
from flask import Blueprint, request, jsonify

from . import db, config, helpers

kb = Blueprint("kb", __name__)


def _serialize(a):
    """Note row -> JSON-safe dict. author name resolved from meta users.

    Emits a `body` alias for `content` (legacy API compat) plus category_id
    derived from the folder so pre-Phase-0 clients keep working.
    """
    d = dict(a)
    d["body"] = d.get("content")
    if d.get("folder_id") is not None:
        cat = db.get_db().execute(
            """SELECT c.id FROM categories c
               JOIN kb_folders f ON f.name = c.name AND f.parent_id IS NOT NULL
              WHERE f.id = ?""", (d["folder_id"],)).fetchone()
        d["category_id"] = cat["id"] if cat else None
    return d


def _author_name(user_id):
    if user_id is None:
        return None
    u = db.get_db().execute(
        "SELECT name FROM users WHERE id=?", (user_id,)).fetchone()
    return u["name"] if u else None


def _folder_for_category(category_id):
    """Return the kb_folder used for notes of a given category.

    Creates the folder on first use (under General). Idempotent. Used by
    routes_jira.promote_to_kb too.
    """
    conn = db.get_db()
    if category_id is not None:
        cat = conn.execute(
            "SELECT name FROM categories WHERE id=?", (category_id,)).fetchone()
        if cat:
            row = conn.execute(
                "SELECT f.id FROM kb_folders f WHERE f.name=? AND f.parent_id IS NOT NULL",
                (cat["name"],)).fetchone()
            if row:
                return row["id"]
    row = conn.execute(
        "SELECT id FROM kb_folders WHERE name='General' AND parent_id IS NULL").fetchone()
    if not row:
        cur = conn.execute(
            "INSERT INTO kb_folders (name, parent_id) VALUES ('General', NULL)")
        conn.commit()
        return cur.lastrowid
    return row["id"]


@kb.route("/api/kb/suggest", methods=["GET"])
@helpers.login_required
def suggest_notes():
    """Top published notes by keyword overlap with a free-text query.

    Powers the pre-submit "does this already answer your request?" card on the
    New Request form. Published-only, ranked, top 5.
    """
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify(suggestions=[])
    from .routes_jira import _keyword_terms
    terms = _keyword_terms(q)
    if not terms:
        return jsonify(suggestions=[])
    rows = db.get_db().execute(
        "SELECT n.*, f.name AS folder_name FROM kb_notes n "
        "LEFT JOIN kb_folders f ON f.id = n.folder_id "
        "WHERE n.status='published'",
    ).fetchall()
    scored = []
    for r in rows:
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


@kb.route("/api/kb", methods=["GET"])
@helpers.login_required
def list_notes():
    user = request.current_user
    sql = "SELECT n.*, f.name AS folder_name, f.parent_id AS folder_parent_id FROM kb_notes n LEFT JOIN kb_folders f ON f.id = n.folder_id WHERE 1=1"
    params = []
    if user["role"] == "requester":
        sql += " AND status='published'"
    q = (request.args.get("q") or "").strip()
    published_only = request.args.get("published_only") == "1"
    if user["role"] == "requester" or published_only:
        sql += " AND n.status='published'"
    if q:
        like = f"%{q}%"
        sql += " AND (n.title LIKE ? OR n.content LIKE ?)"
        params += [like, like]
    cat = request.args.get("category_id")
    if cat:
        try:
            cat = int(cat)
        except (TypeError, ValueError):
            cat = None
        if cat is not None:
            # kb_notes dropped category_id (Phase 0): categories map to folders.
            sql += " AND n.folder_id=?"
            params.append(_folder_for_category(cat))
    folder_id = request.args.get("folder_id", type=int)
    if folder_id:
        sql += " AND n.folder_id=?"
        params.append(folder_id)
    status = request.args.get("status")
    if status in ("draft", "published"):
        sql += " AND n.status=?"
        params.append(status)
    author_id = request.args.get("author_id", type=int)
    if author_id:
        sql += " AND n.author_id=?"
        params.append(author_id)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        sql += " AND n.created_at >= ?"
        params.append(date_from + " 00:00:00")
    if date_to:
        sql += " AND n.created_at <= ?"
        params.append(date_to + " 23:59:59")
    sort = request.args.get("sort")
    if sort == "views":
        sql += " ORDER BY n.views DESC"
    elif sort == "helpful":
        sql += " ORDER BY (SELECT COALESCE(SUM(helpful),0) FROM kb_note_feedback WHERE kb_note_feedback.note_id=n.id) DESC"
    else:
        sql += " ORDER BY n.updated_at DESC"
    rows = db.get_db().execute(sql, params).fetchall()
    out = []
    for r in rows:
        a = _serialize(r)
        a["author_name"] = _author_name(a["author_id"])
        a["helpful_count"] = db.get_db().execute(
            "SELECT COALESCE(SUM(helpful),0) AS c FROM kb_note_feedback WHERE note_id=?", (a["id"],)
        ).fetchone()["c"]
        a["feedback_count"] = db.get_db().execute(
            "SELECT COUNT(*) AS c FROM kb_note_feedback WHERE note_id=?", (a["id"],)
        ).fetchone()["c"]
        out.append(a)
    return jsonify(notes=out)


@kb.route("/api/kb/<int:nid>", methods=["GET"])
@helpers.login_required
def get_note(nid):
    user = request.current_user
    a = db.get_db().execute(
        "SELECT n.*, f.name AS folder_name FROM kb_notes n "
        "LEFT JOIN kb_folders f ON f.id = n.folder_id WHERE n.id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if user["role"] == "requester" and a["status"] != "published":
        return jsonify(error="Note not found"), 404
    # Count a view only when a published note is read.
    if a["status"] == "published":
        db.get_db().execute(
            "UPDATE kb_notes SET views = views + 1 WHERE id=?", (nid,))
        db.get_db().commit()
        a = db.get_db().execute(
            "SELECT n.*, f.name AS folder_name FROM kb_notes n "
            "LEFT JOIN kb_folders f ON f.id = n.folder_id WHERE n.id=?", (nid,)).fetchone()
    a = _serialize(a)
    a["author_name"] = _author_name(a["author_id"])
    a["helpful_count"] = db.get_db().execute(
        "SELECT COALESCE(SUM(helpful),0) AS c FROM kb_note_feedback WHERE note_id=?", (nid,)
    ).fetchone()["c"]
    a["feedback_count"] = db.get_db().execute(
        "SELECT COUNT(*) AS c FROM kb_note_feedback WHERE note_id=?", (nid,)
    ).fetchone()["c"]
    return jsonify(note=a)


@kb.route("/api/kb", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def create_note():
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Only agents and managers can author notes"), 403
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        return jsonify(error="Title and body are required"), 400
    if len(body) > config.MAX_KB_BODY:
        return jsonify(error=f"Body must be ≤ {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be ≤ {config.MAX_KB_TITLE} characters"), 400
    now = db.now_iso()
    cid = data.get("category_id") or None
    if cid is not None:
        cat = db.get_db().execute(
            "SELECT 1 FROM categories WHERE id=?", (cid,)).fetchone()
        if not cat:
            return jsonify(error="Unknown category"), 400
    folder_id = data.get("folder_id")
    if not folder_id:
        folder_id = _folder_for_category(cid)
    cur = db.get_db().execute(
        """INSERT INTO kb_notes (folder_id, title, content, author_id, status, views, created_at, updated_at)
           VALUES (?,?,?,?, 'draft', 0, ?, ?)""",
        (folder_id, title, body, user["id"], now, now))
    db.get_db().commit()
    return jsonify(note=_serialize(db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@kb.route("/api/kb/<int:nid>", methods=["PATCH"])
@helpers.login_required
@helpers.csrf_protect
def edit_note(nid):
    user = request.current_user
    a = db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if user["role"] not in ("agent", "manager", "admin") or (
            user["role"] == "agent" and a["author_id"] != user["id"]):
        return jsonify(error="Not allowed to edit this note"), 403
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or a["title"]).strip()
    body = (data.get("body") or a["content"]).strip()
    if not title or not body:
        return jsonify(error="Title and body are required"), 400
    if len(body) > config.MAX_KB_BODY:
        return jsonify(error=f"Body must be ≤ {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be ≤ {config.MAX_KB_TITLE} characters"), 400
    now = db.now_iso()
    db.get_db().execute(
        "INSERT INTO kb_note_versions (note_id, title, body, saved_by_id, change_note, saved_at) "
        "VALUES (?,?,?,?,?,?)",
        (nid, a["title"], a["content"], user["id"], "", now),
    )
    db.get_db().execute(
        "UPDATE kb_notes SET title=?, content=?, updated_at=? WHERE id=?",
        (title, body, now, nid))
    db.get_db().commit()
    return jsonify(note=_serialize(db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()))


@kb.route("/api/kb/<int:nid>/publish", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def publish_note(nid):
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Not allowed"), 403
    a = db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if user["role"] == "agent" and a["author_id"] != user["id"]:
        return jsonify(error="Not allowed to publish this note"), 403
    now = db.now_iso()
    db.get_db().execute(
        "INSERT INTO kb_note_versions (note_id, title, body, saved_by_id, change_note, saved_at) "
        "VALUES (?,?,?,?,?,?)",
        (nid, a["title"], a["content"], user["id"], "", now),
    )
    db.get_db().execute(
        "UPDATE kb_notes SET status='published', updated_at=? WHERE id=?",
        (now, nid))
    db.get_db().commit()
    return jsonify(ok=True, note=_serialize(db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()))


@kb.route("/api/kb/<int:nid>", methods=["DELETE"])
@helpers.login_required
@helpers.csrf_protect
def delete_note(nid):
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Not allowed"), 403
    a = db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if user["role"] == "agent" and a["author_id"] != user["id"]:
        return jsonify(error="Not allowed to delete this note"), 403
    db.get_db().execute("DELETE FROM kb_notes WHERE id=?", (nid,))
    db.get_db().commit()
    return jsonify(ok=True)


@kb.route("/api/kb/<int:nid>/feedback", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def feedback(nid):
    user = request.current_user
    a = db.get_db().execute(
        "SELECT id FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    helpful = data.get("helpful")
    if helpful not in (0, 1, True, False):
        return jsonify(error="helpful must be true/false"), 400
    helpful = 1 if helpful else 0
    # One vote per user per note (upsert by replacing prior vote).
    db.get_db().execute(
        "DELETE FROM kb_note_feedback WHERE note_id=? AND user_id=?", (nid, user["id"]))
    db.get_db().execute(
        "INSERT INTO kb_note_feedback (note_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?)",
        (nid, user["id"], helpful, (data.get("comment") or "")[:1000] or None, db.now_iso()))
    db.get_db().commit()
    return jsonify(ok=True)


@kb.route("/api/kb/folders", methods=["GET"])
@helpers.login_required
def list_folders():
    rows = db.get_db().execute(
        "SELECT * FROM kb_folders ORDER BY parent_id IS NOT NULL, name").fetchall()
    return jsonify(folders=[dict(r) for r in rows])


@kb.route("/api/kb/folders", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def create_folder():
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Not allowed"), 403
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 400
    parent_id = data.get("parent_id")
    try:
        cur = db.get_db().execute(
            "INSERT INTO kb_folders (name, parent_id) VALUES (?,?)",
            (name, parent_id or None))
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Folder already exists"), 409
    return jsonify(folder=dict(db.get_db().execute(
        "SELECT * FROM kb_folders WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@kb.route("/api/kb/collections", methods=["GET"])
@helpers.login_required
def list_collections():
    rows = db.get_db().execute(
        "SELECT * FROM kb_collections_v2 ORDER BY updated_at DESC"
    ).fetchall()
    out = []
    for c in rows:
        d = dict(c)
        d["owner_name"] = _author_name(d.get("owner_id"))
        out.append(d)
    return jsonify(collections=out)


@kb.route("/api/kb/collections", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def create_collection():
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip() or None
    if not name:
        return jsonify(error="name is required"), 400
    now = db.now_iso()
    cur = db.get_db().execute(
        "INSERT INTO kb_collections_v2 (name, description, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)",
        (name, description, user["id"], now, now))
    db.get_db().commit()
    return jsonify(collection=dict(db.get_db().execute(
        "SELECT * FROM kb_collections_v2 WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@kb.route("/api/kb/collections/<int:cid>/notes", methods=["GET"])
@kb.route("/api/kb/collections/<int:cid>/articles", methods=["GET"], endpoint="list_collection_notes_alias")
@helpers.login_required
def list_collection_notes(cid):
    rows = db.get_db().execute(
        "SELECT n.*, cn.position FROM kb_collection_notes cn "
        "JOIN kb_notes n ON n.id = cn.note_id WHERE cn.collection_id=? ORDER BY cn.position ASC, n.updated_at DESC",
        (cid,)
    ).fetchall()
    out = []
    for r in rows:
        a = dict(r)
        a["author_name"] = _author_name(a.get("author_id"))
        out.append(a)
    return jsonify(notes=out)


@kb.route("/api/kb/collections/<int:cid>/notes", methods=["POST"])
@kb.route("/api/kb/collections/<int:cid>/articles", methods=["POST"], endpoint="add_collection_note_alias")
@helpers.login_required
@helpers.csrf_protect
def add_collection_note(cid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    c = db.get_db().execute("SELECT * FROM kb_collections_v2 WHERE id=?", (cid,)).fetchone()
    if not c:
        return jsonify(error="Collection not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    note_id = data.get("note_id") or data.get("article_id")
    if not note_id:
        return jsonify(error="note_id is required"), 400
    a = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (note_id,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    try:
        db.get_db().execute(
            "INSERT INTO kb_collection_notes (collection_id, note_id, position, created_at) VALUES (?,?,?,?)",
            (cid, note_id, 0, db.now_iso()))
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Already in collection"), 409
    return jsonify(ok=True), 201


@kb.route("/api/kb/collections/<int:cid>/notes/<int:nid>", methods=["DELETE"])
@kb.route("/api/kb/collections/<int:cid>/articles/<int:nid>", methods=["DELETE"], endpoint="remove_collection_note_alias")
@helpers.login_required
@helpers.csrf_protect
def remove_collection_note(cid, nid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    db.get_db().execute("DELETE FROM kb_collection_notes WHERE collection_id=? AND note_id=?", (cid, nid))
    db.get_db().commit()
    return jsonify(ok=True)


@kb.route("/api/kb/<int:nid>/versions", methods=["GET"])
@helpers.login_required
def list_versions(nid):
    a = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    if request.current_user["role"] == "requester" and a["status"] != "published":
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        "SELECT * FROM kb_note_versions WHERE note_id=? ORDER BY saved_at DESC",
        (nid,),
    ).fetchall()
    return jsonify(versions=[dict(r) for r in rows])


@kb.route("/api/kb/<int:nid>/links", methods=["GET"])
@helpers.login_required
def list_links(nid):
    a = db.get_db().execute("SELECT id FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    outbound = db.get_db().execute(
        "SELECT n.*, l.created_at AS linked_at FROM kb_wikilinks l "
        "JOIN kb_notes n ON n.id = l.target_note_id WHERE l.source_note_id=?",
        (nid,),
    ).fetchall()
    inbound = db.get_db().execute(
        "SELECT n.*, l.created_at AS linked_at FROM kb_wikilinks l "
        "JOIN kb_notes n ON n.id = l.source_note_id WHERE l.target_note_id=?",
        (nid,),
    ).fetchall()
    return jsonify(outbound=[dict(r) for r in outbound], inbound=[dict(r) for r in inbound])


@kb.route("/api/kb/<int:nid>/links", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def add_link(nid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    src = db.get_db().execute("SELECT id FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not src:
        return jsonify(error="Not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    target_id = data.get("target_id")
    if not target_id:
        return jsonify(error="target_id is required"), 400
    if int(target_id) == nid:
        return jsonify(error="A note cannot link to itself"), 400
    tgt = db.get_db().execute("SELECT id FROM kb_notes WHERE id=?", (target_id,)).fetchone()
    if not tgt:
        return jsonify(error="Target not found"), 404
    try:
        db.get_db().execute(
            "INSERT INTO kb_wikilinks (source_note_id, target_note_id, alias, created_at) VALUES (?,?,?,?)",
            (nid, target_id, data.get("alias") or None, db.now_iso()))
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Already linked"), 409
    return jsonify(ok=True), 201


@kb.route("/api/kb/<int:nid>/links/<int:target_id>", methods=["DELETE"])
@helpers.login_required
@helpers.csrf_protect
def remove_link(nid, target_id):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    db.get_db().execute("DELETE FROM kb_wikilinks WHERE source_note_id=? AND target_note_id=?", (nid, target_id))
    db.get_db().commit()
    return jsonify(ok=True)


def _draft_kb_body(user, issue):
    """AI-draft a KB body from an issue using the user's own OpenRouter key.

    Returns (body, ai_used). Fails closed: no key, network failure, or any
    exception falls back to a plaintext skeleton so drafting never blocks.
    """
    plain = f"# {issue['summary']}\n\n{issue['description'] or ''}\n\n<!-- TODO: expand from issue {issue['id']} -->"
    try:
        from app.ai import client as ai_client
        key = helpers.decrypt_secret(user.get("ai_key"))
        if not key or not user.get("ai_model"):
            return plain, False
        prompt = (
            "You are an internal helpdesk knowledge assistant. "
            "Write a concise internal KB note draft from this issue thread. "
            "Return markdown only.\n\n"
            f"Summary: {issue['summary']}\nDescription: {issue['description'] or ''}"
        )
        body = ai_client.chat(user["ai_model"],
                              [{"role": "user", "content": prompt}],
                              api_key=key, max_tokens=600)
        if body:
            return body, True
    except Exception:
        pass
    return plain + "\n\n<!-- AI draft unavailable; please edit before publishing. -->", False


@kb.route("/api/kb/<int:nid>/draft-from-issue", methods=["POST"])
@kb.route("/api/kb/<int:nid>/draft-from-ticket", methods=["POST"], endpoint="draft_from_ticket_alias")
@helpers.login_required
@helpers.csrf_protect
def draft_from_issue(nid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    a = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    issue_id = data.get("issue_id") or data.get("ticket_id")
    if not issue_id:
        return jsonify(error="issue_id is required"), 400
    t = db.get_db().execute(
        "SELECT id, summary, description, category_id, status FROM jira_issues WHERE id=?",
        (issue_id,),
    ).fetchone()
    if not t:
        return jsonify(error="Issue not found"), 404
    body, _ai_used = _draft_kb_body(user, t)
    return jsonify(title=t["summary"], body=body, category_id=t["category_id"], source_issue_id=issue_id), 200