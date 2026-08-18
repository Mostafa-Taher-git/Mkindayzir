"""
Knowledge Base API (Phase 2).

Self-service content for requesters plus authoring for agents/managers.

Endpoints:
  GET  /api/kb                 -> list articles (published for requesters; all for
                                 agents/managers). ?q=search&category_id=
  GET  /api/kb/<id>           -> one article; published views counter increments
  POST /api/kb                -> create (agent/manager); status defaults to 'draft'
  PATCH /api/kb/<id>          -> edit (author or agent/manager)
  POST /api/kb/<id>/publish  -> publish (agent/manager)
  DELETE /api/kb/<id>         -> delete (agent/manager)
  POST /api/kb/<id>/feedback -> "was this helpful?" (any logged-in user)

Python is kept thin; the editable surface (search UI, authoring form) lives in JS.
"""
from flask import Blueprint, request, jsonify

from . import db, config, helpers

kb = Blueprint("kb", __name__)


def _serialize(a):
    """Article row -> JSON-safe dict. author name resolved from meta users."""
    d = dict(a)
    return d


def _author_name(user_id):
    if user_id is None:
        return None
    u = db.get_db().execute(
        "SELECT name FROM users WHERE id=?", (user_id,)).fetchone()
    return u["name"] if u else None


@kb.route("/api/kb", methods=["GET"])
@helpers.login_required
def list_articles():
    user = request.current_user
    sql = "SELECT * FROM kb_articles WHERE 1=1"
    params = []
    if user["role"] == "requester":
        sql += " AND status='published'"
    q = (request.args.get("q") or "").strip()
    published_only = request.args.get("published_only") == "1"
    if user["role"] == "requester" or published_only:
        sql += " AND status='published'"
    if q:
        like = f"%{q}%"
        sql += " AND (title LIKE ? OR body LIKE ?)"
        params += [like, like]
    cat = request.args.get("category_id")
    if cat:
        try:
            cat = int(cat)
        except (TypeError, ValueError):
            cat = None
        if cat is not None:
            sql += " AND category_id=?"
            params.append(cat)
    status = request.args.get("status")
    if status in ("draft", "published"):
        sql += " AND status=?"
        params.append(status)
    author_id = request.args.get("author_id", type=int)
    if author_id:
        sql += " AND author_id=?"
        params.append(author_id)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        sql += " AND created_at >= ?"
        params.append(date_from + " 00:00:00")
    if date_to:
        sql += " AND created_at <= ?"
        params.append(date_to + " 23:59:59")
    sort = request.args.get("sort")
    if sort == "views":
        sql += " ORDER BY views DESC"
    elif sort == "helpful":
        sql += " ORDER BY (SELECT COALESCE(SUM(helpful),0) FROM kb_feedback WHERE kb_feedback.article_id=kb_articles.id) DESC"
    else:
        sql += " ORDER BY updated_at DESC"
    rows = db.get_db().execute(sql, params).fetchall()
    out = []
    for r in rows:
        a = _serialize(r)
        a["author_name"] = _author_name(a["author_id"])
        a["helpful_count"] = db.get_db().execute(
            "SELECT COALESCE(SUM(helpful),0) AS c FROM kb_feedback WHERE article_id=?", (a["id"],)
        ).fetchone()["c"]
        a["feedback_count"] = db.get_db().execute(
            "SELECT COUNT(*) AS c FROM kb_feedback WHERE article_id=?", (a["id"],)
        ).fetchone()["c"]
        out.append(a)
    return jsonify(articles=out)


@kb.route("/api/kb/<int:aid>", methods=["GET"])
@helpers.login_required
def get_article(aid):
    user = request.current_user
    a = db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    if user["role"] == "requester" and a["status"] != "published":
        return jsonify(error="Article not found"), 404
    # Count a view only when a published article is read.
    if a["status"] == "published":
        db.get_db().execute(
            "UPDATE kb_articles SET views = views + 1 WHERE id=?", (aid,))
        db.get_db().commit()
        a = dict(db.get_db().execute(
            "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone())
    a["author_name"] = _author_name(a["author_id"])
    return jsonify(article=a)


@kb.route("/api/kb", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def create_article():
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Only agents and managers can author articles"), 403
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
    cur = db.get_db().execute(
        """INSERT INTO kb_articles (title, body, category_id, author_id, status, views, created_at, updated_at)
           VALUES (?,?,?,?, 'draft', 0, ?, ?)""",
        (title, body, data.get("category_id") or None, user["id"], now, now))
    db.get_db().commit()
    return jsonify(article=dict(db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@kb.route("/api/kb/<int:aid>", methods=["PATCH"])
@helpers.login_required
@helpers.csrf_protect
def edit_article(aid):
    user = request.current_user
    a = db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    if user["role"] not in ("agent", "manager", "admin") or (
            user["role"] == "agent" and a["author_id"] != user["id"]):
        return jsonify(error="Not allowed to edit this article"), 403
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or a["title"]).strip()
    body = (data.get("body") or a["body"]).strip()
    if not title or not body:
        return jsonify(error="Title and body are required"), 400
    if len(body) > config.MAX_KB_BODY:
        return jsonify(error=f"Body must be ≤ {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be ≤ {config.MAX_KB_TITLE} characters"), 400
    cid = data.get("category_id", a["category_id"])
    if cid is not None:
        cat = db.get_db().execute(
            "SELECT 1 FROM categories WHERE id=?", (cid,)).fetchone()
        if not cat:
            return jsonify(error="Unknown category"), 400
    now = db.now_iso()
    db.get_db().execute(
        "INSERT INTO kb_article_versions (article_id, title, body, category_id, status, created_by, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (aid, a["title"], a["body"], a["category_id"], a["status"], user["id"], now),
    )
    db.get_db().execute(
        "UPDATE kb_articles SET title=?, body=?, category_id=?, updated_at=? WHERE id=?",
        (title, body, data.get("category_id", a["category_id"]), now, aid))
    db.get_db().commit()
    return jsonify(article=dict(db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()))


@kb.route("/api/kb/<int:aid>/publish", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def publish_article(aid):
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Not allowed"), 403
    a = db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    if user["role"] == "agent" and a["author_id"] != user["id"]:
        return jsonify(error="Not allowed to publish this article"), 403
    db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    now = db.now_iso()
    db.get_db().execute(
        "INSERT INTO kb_article_versions (article_id, title, body, category_id, status, created_by, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (aid, a["title"], a["body"], a["category_id"], a["status"], user["id"], now),
    )
    db.get_db().execute(
        "UPDATE kb_articles SET status='published', updated_at=? WHERE id=?",
        (now, aid))
    db.get_db().commit()
    return jsonify(ok=True, article=dict(db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()))


@kb.route("/api/kb/<int:aid>", methods=["DELETE"])
@helpers.login_required
@helpers.csrf_protect
def delete_article(aid):
    user = request.current_user
    if user["role"] not in ("agent", "manager", "admin"):
        return jsonify(error="Not allowed"), 403
    a = db.get_db().execute(
        "SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    if user["role"] == "agent" and a["author_id"] != user["id"]:
        return jsonify(error="Not allowed to delete this article"), 403
    db.get_db().execute("DELETE FROM kb_articles WHERE id=?", (aid,))
    db.get_db().commit()
    return jsonify(ok=True)


@kb.route("/api/kb/<int:aid>/feedback", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def feedback(aid):
    user = request.current_user
    a = db.get_db().execute(
        "SELECT id FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    helpful = data.get("helpful")
    if helpful not in (0, 1, True, False):
        return jsonify(error="helpful must be true/false"), 400
    helpful = 1 if helpful else 0
    # One vote per user per article (upsert by replacing prior vote).
    db.get_db().execute(
        "DELETE FROM kb_feedback WHERE article_id=? AND user_id=?", (aid, user["id"]))
    db.get_db().execute(
        "INSERT INTO kb_feedback (article_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?)",
        (aid, user["id"], helpful, (data.get("comment") or "")[:1000] or None, db.now_iso()))
    db.get_db().commit()
    return jsonify(ok=True)


@kb.route("/api/kb/collections", methods=["GET"])
@helpers.login_required
def list_collections():
    user = request.current_user
    rows = db.get_db().execute(
        "SELECT * FROM kb_collections ORDER BY updated_at DESC"
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
        "INSERT INTO kb_collections (name, description, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)",
        (name, description, user["id"], now, now))
    db.get_db().commit()
    return jsonify(collection=dict(db.get_db().execute(
        "SELECT * FROM kb_collections WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@kb.route("/api/kb/collections/<int:cid>/articles", methods=["GET"])
@helpers.login_required
def list_collection_articles(cid):
    rows = db.get_db().execute(
        "SELECT a.*, ca.position FROM kb_collection_articles ca "
        "JOIN kb_articles a ON a.id = ca.article_id WHERE ca.collection_id=? ORDER BY ca.position ASC, a.updated_at DESC",
        (cid,)
    ).fetchall()
    out = []
    for r in rows:
        a = dict(r)
        a["author_name"] = _author_name(a.get("author_id"))
        out.append(a)
    return jsonify(articles=out)


@kb.route("/api/kb/collections/<int:cid>/articles", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def add_collection_article(cid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    c = db.get_db().execute("SELECT * FROM kb_collections WHERE id=?", (cid,)).fetchone()
    if not c:
        return jsonify(error="Collection not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    article_id = data.get("article_id")
    if not article_id:
        return jsonify(error="article_id is required"), 400
    a = db.get_db().execute("SELECT * FROM kb_articles WHERE id=?", (article_id,)).fetchone()
    if not a:
        return jsonify(error="Article not found"), 404
    try:
        db.get_db().execute(
            "INSERT INTO kb_collection_articles (collection_id, article_id, position, created_at) VALUES (?,?,?,?)",
            (cid, article_id, 0, db.now_iso()))
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Already in collection"), 409
    return jsonify(ok=True), 201


@kb.route("/api/kb/collections/<int:cid>/articles/<int:aid>", methods=["DELETE"])
@helpers.login_required
@helpers.csrf_protect
def remove_collection_article(cid, aid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    db.get_db().execute("DELETE FROM kb_collection_articles WHERE collection_id=? AND article_id=?", (cid, aid))
    db.get_db().commit()
    return jsonify(ok=True)


@kb.route("/api/kb/<int:aid>/versions", methods=["GET"])
@helpers.login_required
def list_versions(aid):
    a = db.get_db().execute("SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    if request.current_user["role"] == "requester" and a["status"] != "published":
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        "SELECT * FROM kb_article_versions WHERE article_id=? ORDER BY created_at DESC",
        (aid,),
    ).fetchall()
    return jsonify(versions=[dict(r) for r in rows])


@kb.route("/api/kb/<int:aid>/draft-from-ticket", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def draft_from_ticket(aid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    a = db.get_db().execute("SELECT * FROM kb_articles WHERE id=?", (aid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    ticket_id = data.get("ticket_id")
    if not ticket_id:
        return jsonify(error="ticket_id is required"), 400
    t = db.get_db().execute(
        "SELECT id, subject, description, category_id, status FROM tickets WHERE id=?",
        (ticket_id,),
    ).fetchone()
    if not t:
        return jsonify(error="Ticket not found"), 404
    # Use existing AI client if configured; otherwise return a plain draft.
    try:
        from app.ai import client as ai_client
        if user.get("ai_key") and user.get("ai_model"):
            prompt = (
                "You are an internal helpdesk knowledge assistant. "
                "Write a concise internal KB article draft from this ticket thread. "
                "Return markdown only.\n\n"
                f"Subject: {t['subject']}\nDescription: {t['description'] or ''}"
            )
            # Best-effort AI; never block drafting on AI failures.
            body = ai_client.chat(user["ai_model"], [{"role": "user", "content": prompt}])
        else:
            body = f"# {t['subject']}\n\n{t['description'] or ''}\n\n<!-- TODO: expand from ticket {t['id']} -->"
    except Exception:
        body = f"# {t['subject']}\n\n{t['description'] or ''}\n\n<!-- AI draft unavailable; please edit before publishing. -->"
    return jsonify(title=t["subject"], body=body, category_id=t["category_id"], source_ticket_id=ticket_id), 200
