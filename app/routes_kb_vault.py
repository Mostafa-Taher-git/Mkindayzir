"""
Obsidian Knowledge Base API (Phase 3A + 3B - vault, wikilinks, graph).

Replaces the legacy routes_kb.py. Preserves the EXACT old contract that
tests/test_security.py depends on (/api/kb CRUD, /api/kb/<id>/publish,
/api/kb/<id>/feedback, /api/kb/<id>/versions, /api/kb/<id>/links,
/api/kb/collections, /api/kb/<id>/draft-from-ticket, /api/kb/suggest) while
adding the richer Obsidian surface (tree, folders, notes, graph, tags,
analytics, diff).

Helpers _serialize, _author_name, _folder_for_category and _draft_kb_body are
kept with identical signatures because routes_jira.promote_to_kb depends on them.
"""
import re
import json

from flask import Blueprint, request, jsonify

from . import db, config, helpers, notifications

kb_vault = Blueprint("kb_vault", __name__)

AGENT_ROLES = (config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)


def _serialize(a):
    """Note row -> JSON-safe dict. Emits a body alias for content (legacy compat)
    plus category_id derived from the folder so pre-Phase-0 clients keep working."""
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
    """Return the kb_folder used for notes of a given category. Idempotent."""
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


def _serialize_full(a):
    """Richer note serializer for the Obsidian endpoints."""
    d = dict(a)
    d["body"] = d.get("content")
    conn = db.get_db()
    d["author_name"] = _author_name(d.get("author_id"))
    d["helpful_count"] = conn.execute(
        "SELECT COALESCE(SUM(helpful),0) AS c FROM kb_note_feedback WHERE note_id=?",
        (d["id"],)).fetchone()["c"]
    d["feedback_count"] = conn.execute(
        "SELECT COUNT(*) AS c FROM kb_note_feedback WHERE note_id=?",
        (d["id"],)).fetchone()["c"]
    d["tags"] = [r["name"] for r in conn.execute(
        "SELECT t.name FROM kb_tags t JOIN kb_note_tags nt ON nt.tag_id=t.id "
        "WHERE nt.note_id=? ORDER BY t.name", (d["id"],)).fetchall()]
    if d.get("folder_id") is not None:
        f = conn.execute(
            "SELECT name FROM kb_folders WHERE id=?", (d["folder_id"],)).fetchone()
        d["folder_name"] = f["name"] if f else None
    else:
        d["folder_name"] = None
    d["link_count"] = conn.execute(
        "SELECT COUNT(*) AS c FROM kb_wikilinks "
        "WHERE source_note_id=? OR target_note_id=?",
        (d["id"], d["id"])).fetchone()["c"]
    return d


def _frontmatter_column_tags(fm_json):
    if not fm_json:
        return []
    try:
        d = json.loads(fm_json)
    except Exception:
        return []
    if isinstance(d, dict) and isinstance(d.get("tags"), list):
        return [str(t).strip().lower() for t in d["tags"] if str(t).strip()]
    return []


def _extract_frontmatter_tags(content):
    if not content:
        return []
    m = re.match(r"^\s*---\s*\n(.*?)\n---\s*", content, re.DOTALL)
    if not m:
        return []
    block = m.group(1)
    tags = []
    in_tags = False
    for line in block.splitlines():
        s = line.strip()
        if s.startswith("tags:"):
            rest = s[len("tags:"):].strip()
            if rest:
                inner = rest.strip("[]")
                for t in inner.split(","):
                    t = t.strip().strip("'\"")
                    if t:
                        tags.append(t)
            else:
                in_tags = True
            continue
        if in_tags:
            if s.startswith("- "):
                t = s[2:].strip().strip("'\"")
                if t:
                    tags.append(t)
            else:
                in_tags = False
    return [t.lower() for t in tags]


def _sync_tags(content, frontmatter_json, note_id):
    """Extract tags from frontmatter column and/or content, upsert, sync."""
    conn = db.get_db()
    names = set()
    names.update(_frontmatter_column_tags(frontmatter_json))
    names.update(_extract_frontmatter_tags(content))
    names.discard("")
    ids = []
    for nm in names:
        row = conn.execute("SELECT id FROM kb_tags WHERE name=?", (nm,)).fetchone()
        if row:
            ids.append(row["id"])
        else:
            cur = conn.execute("INSERT INTO kb_tags (name) VALUES (?)", (nm,))
            ids.append(cur.lastrowid)
    conn.execute("DELETE FROM kb_note_tags WHERE note_id=?", (note_id,))
    for tid in ids:
        conn.execute(
            "INSERT OR IGNORE INTO kb_note_tags (note_id, tag_id) VALUES (?,?)",
            (note_id, tid))
    conn.commit()


def _extract_wikilinks(content, source_note_id):
    """Parse [[Target|alias]] wikilinks from content and (re)store them."""
    conn = db.get_db()
    conn.execute(
        "DELETE FROM kb_wikilinks WHERE source_note_id=?", (source_note_id,))
    if not content:
        conn.commit()
        return
    for m in re.finditer(r'\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]', content):
        title = (m.group(1) or "").strip()
        alias = (m.group(2) or "").strip() or None
        if not title:
            continue
        tgt = conn.execute(
            "SELECT id FROM kb_notes WHERE lower(title)=lower(?) LIMIT 1",
            (title,)).fetchone()
        if tgt:
            conn.execute(
                "INSERT OR IGNORE INTO kb_wikilinks "
                "(source_note_id, target_note_id, alias, created_at) "
                "VALUES (?,?,?,?)",
                (source_note_id, tgt["id"], alias, db.now_iso()))
    conn.commit()


def _build_tree():
    """Return the ordered folder tree (roots include the General folder)."""
    conn = db.get_db()
    folders = conn.execute("SELECT * FROM kb_folders ORDER BY name").fetchall()
    notes = conn.execute(
        "SELECT id, title, status, folder_id FROM kb_notes").fetchall()
    notes_by_folder = {}
    for n in notes:
        notes_by_folder.setdefault(n["folder_id"], []).append(
            {"id": n["id"], "title": n["title"], "status": n["status"]})
    folder_by_id = {f["id"]: dict(f) for f in folders}
    children_map = {}
    for f in folders:
        children_map.setdefault(f["parent_id"], []).append(f["id"])

    def build(fid):
        f = folder_by_id[fid]
        nts = notes_by_folder.get(fid, [])
        return {
            "id": f["id"],
            "name": f["name"],
            "parent_id": f["parent_id"],
            "note_count": len(nts),
            "notes": nts,
            "children": [build(cid) for cid in children_map.get(fid, [])],
        }

    return [build(rid) for rid in children_map.get(None, [])]


def _backlinks(note_id, title):
    """Linked (inbound wikilinks) + unlinked (plain-text mention) mentions."""
    conn = db.get_db()
    linked = [{"id": r["id"], "title": r["title"], "alias": r["alias"]}
              for r in conn.execute(
                  "SELECT n.id, n.title, l.alias FROM kb_wikilinks l "
                  "JOIN kb_notes n ON n.id = l.source_note_id "
                  "WHERE l.target_note_id=?", (note_id,)).fetchall()]
    unlinked = []
    if title:
        for r in conn.execute(
                "SELECT id, title FROM kb_notes "
                "WHERE id!=? AND content LIKE ?",
                (note_id, f"%{title}%")).fetchall():
            already = conn.execute(
                "SELECT 1 FROM kb_wikilinks "
                "WHERE source_note_id=? AND target_note_id=?",
                (r["id"], note_id)).fetchone()
            if not already:
                unlinked.append({"id": r["id"], "title": r["title"]})
    return {"linked": linked, "unlinked": unlinked}


def _would_create_cycle(folder_id, new_parent_id):
    if new_parent_id is None:
        return False
    if new_parent_id == folder_id:
        return True
    conn = db.get_db()
    cur = new_parent_id
    while cur is not None:
        if cur == folder_id:
            return True
        row = conn.execute(
            "SELECT parent_id FROM kb_folders WHERE id=?", (cur,)).fetchone()
        cur = row["parent_id"] if row else None
    return False


def _local_graph(note_id, hops):
    """BFS over kb_wikilinks up to hops from note_id."""
    conn = db.get_db()
    adj = {}
    for e in conn.execute(
            "SELECT source_note_id, target_note_id FROM kb_wikilinks").fetchall():
        adj.setdefault(e["source_note_id"], set()).add(e["target_note_id"])
        adj.setdefault(e["target_note_id"], set()).add(e["source_note_id"])

    visited = {note_id}
    frontier = {note_id}
    for _ in range(max(0, int(hops))):
        nxt = set()
        for node in frontier:
            for nb in adj.get(node, ()):
                if nb not in visited:
                    visited.add(nb)
                    nxt.add(nb)
        frontier = nxt

    id_list = list(visited)
    nodes = []
    if id_list:
        ph = ",".join("?" * len(id_list))
        for n in conn.execute(
                f"SELECT n.id, n.title FROM kb_notes n WHERE n.id IN ({ph})",
                id_list).fetchall():
            lc = conn.execute(
                "SELECT COUNT(*) AS c FROM kb_wikilinks "
                "WHERE source_note_id=? OR target_note_id=?",
                (n["id"], n["id"])).fetchone()["c"]
            nodes.append({"id": n["id"], "title": n["title"], "link_count": lc})
        edges = []
        for e in conn.execute(
                f"SELECT source_note_id, target_note_id FROM kb_wikilinks "
                f"WHERE source_note_id IN ({ph}) AND target_note_id IN ({ph})",
                id_list + id_list).fetchall():
            edges.append({"source": e["source_note_id"],
                          "target": e["target_note_id"]})
    else:
        edges = []
    return {"nodes": nodes, "edges": edges}


def _line_diff(a_text, b_text):
    """Simple LCS line diff -> [{type:'context'|'add'|'del', text}]."""
    a = (a_text or "").split("\n")
    b = (b_text or "").split("\n")
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i][j] = dp[i + 1][j + 1] + 1 if a[i] == b[j] \
                else max(dp[i + 1][j], dp[i][j + 1])
    i = j = 0
    out = []
    while i < n and j < m:
        if a[i] == b[j]:
            out.append({"type": "context", "text": a[i]})
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            out.append({"type": "del", "text": a[i]})
            i += 1
        else:
            out.append({"type": "add", "text": b[j]})
            j += 1
    while i < n:
        out.append({"type": "del", "text": a[i]})
        i += 1
    while j < m:
        out.append({"type": "add", "text": b[j]})
        j += 1
    return out


# ===========================================================================
# PRESERVED OLD CONTRACT (do not change behavior)
# ===========================================================================
@kb_vault.route("/api/kb/suggest", methods=["GET"])
@helpers.login_required
def suggest_notes():
    """Top published notes by keyword overlap with a free-text query."""
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


@kb_vault.route("/api/kb", methods=["GET"])
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


@kb_vault.route("/api/kb/<int:nid>", methods=["GET"])
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


@kb_vault.route("/api/kb", methods=["POST"])
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
        return jsonify(error=f"Body must be <= {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be <= {config.MAX_KB_TITLE} characters"), 400
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


@kb_vault.route("/api/kb/<int:nid>", methods=["PATCH"])
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
        return jsonify(error=f"Body must be <= {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be <= {config.MAX_KB_TITLE} characters"), 400
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


@kb_vault.route("/api/kb/<int:nid>/publish", methods=["POST"])
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
    # Phase 6: alert staff (agent/manager/admin) that a new article is live.
    try:
        staff = db.get_db().execute(
            "SELECT id FROM users WHERE role IN ('agent','manager','admin')").fetchall()
        for r in staff:
            notifications.notify(r["id"], "kb_note", nid, "note_published",
                                 f"New article published: {a['title']}")
    except Exception:
        pass
    return jsonify(ok=True, note=_serialize(db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()))


@kb_vault.route("/api/kb/<int:nid>", methods=["DELETE"])
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


@kb_vault.route("/api/kb/<int:nid>/feedback", methods=["POST"])
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
    db.get_db().execute(
        "DELETE FROM kb_note_feedback WHERE note_id=? AND user_id=?", (nid, user["id"]))
    db.get_db().execute(
        "INSERT INTO kb_note_feedback (note_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?)",
        (nid, user["id"], helpful, (data.get("comment") or "")[:1000] or None, db.now_iso()))
    db.get_db().commit()
    return jsonify(ok=True)


@kb_vault.route("/api/kb/folders", methods=["GET"])
@helpers.login_required
def list_folders():
    rows = db.get_db().execute(
        "SELECT * FROM kb_folders ORDER BY parent_id IS NOT NULL, name").fetchall()
    return jsonify(folders=[dict(r) for r in rows])


@kb_vault.route("/api/kb/folders", methods=["POST"])
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
    conn = db.get_db()
    if parent_id is None:
        dup = conn.execute(
            "SELECT 1 FROM kb_folders WHERE name=? AND parent_id IS NULL",
            (name,)).fetchone()
    else:
        dup = conn.execute(
            "SELECT 1 FROM kb_folders WHERE name=? AND parent_id=?",
            (name, parent_id)).fetchone()
    if dup:
        return jsonify(error="Folder already exists"), 409
    try:
        cur = conn.execute(
            "INSERT INTO kb_folders (name, parent_id) VALUES (?,?)",
            (name, parent_id or None))
        db.get_db().commit()
    except Exception:
        db.get_db().execute("ROLLBACK")
        return jsonify(error="Folder already exists"), 409
    return jsonify(folder=dict(db.get_db().execute(
        "SELECT * FROM kb_folders WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@kb_vault.route("/api/kb/collections", methods=["GET"])
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


@kb_vault.route("/api/kb/collections", methods=["POST"])
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


@kb_vault.route("/api/kb/collections/<int:cid>/notes", methods=["GET"])
@kb_vault.route("/api/kb/collections/<int:cid>/articles", methods=["GET"], endpoint="list_collection_notes_alias")
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


@kb_vault.route("/api/kb/collections/<int:cid>/notes", methods=["POST"])
@kb_vault.route("/api/kb/collections/<int:cid>/articles", methods=["POST"], endpoint="add_collection_note_alias")
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


@kb_vault.route("/api/kb/collections/<int:cid>/notes/<int:nid>", methods=["DELETE"])
@kb_vault.route("/api/kb/collections/<int:cid>/articles/<int:nid>", methods=["DELETE"], endpoint="remove_collection_note_alias")
@helpers.login_required
@helpers.csrf_protect
def remove_collection_note(cid, nid):
    user = request.current_user
    if user["role"] == "requester":
        return jsonify(error="Forbidden"), 403
    db.get_db().execute("DELETE FROM kb_collection_notes WHERE collection_id=? AND note_id=?", (cid, nid))
    db.get_db().commit()
    return jsonify(ok=True)


@kb_vault.route("/api/kb/<int:nid>/versions", methods=["GET"])
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


@kb_vault.route("/api/kb/<int:nid>/links", methods=["GET"])
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


@kb_vault.route("/api/kb/<int:nid>/links", methods=["POST"])
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


@kb_vault.route("/api/kb/<int:nid>/links/<int:target_id>", methods=["DELETE"])
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
    """AI-draft a KB body from an issue using the user's own OpenRouter key."""
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


@kb_vault.route("/api/kb/<int:nid>/draft-from-issue", methods=["POST"])
@kb_vault.route("/api/kb/<int:nid>/draft-from-ticket", methods=["POST"], endpoint="draft_from_ticket_alias")
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


# ===========================================================================
# NEW OBSIDIAN SURFACE (Phase 3A + 3B)
# ===========================================================================
@kb_vault.route("/api/kb/tree", methods=["GET"])
@helpers.login_required
def kb_tree():
    """Full folder/note hierarchy tree (roots include the General folder)."""
    return jsonify(tree=_build_tree())


@kb_vault.route("/api/kb/folders/<int:fid>", methods=["PATCH"])
@helpers.login_required
@helpers.csrf_protect
def patch_folder(fid):
    user = request.current_user
    if user["role"] not in AGENT_ROLES:
        return jsonify(error="Not allowed"), 403
    conn = db.get_db()
    f = conn.execute("SELECT * FROM kb_folders WHERE id=?", (fid,)).fetchone()
    if not f:
        return jsonify(error="Folder not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or f["name"]).strip()
    parent_id = data.get("parent_id", f["parent_id"])
    if parent_id is not None and parent_id == fid:
        return jsonify(error="Cycle detected"), 400
    if _would_create_cycle(fid, parent_id):
        return jsonify(error="Cycle detected"), 400
    if not name:
        return jsonify(error="name is required"), 400
    if parent_id is None:
        dup = conn.execute(
            "SELECT 1 FROM kb_folders WHERE name=? AND parent_id IS NULL AND id!=?",
            (name, fid)).fetchone()
    else:
        dup = conn.execute(
            "SELECT 1 FROM kb_folders WHERE name=? AND parent_id=? AND id!=?",
            (name, parent_id, fid)).fetchone()
    if dup:
        return jsonify(error="Folder already exists"), 409
    conn.execute(
        "UPDATE kb_folders SET name=?, parent_id=? WHERE id=?",
        (name, parent_id, fid))
    conn.commit()
    return jsonify(folder=dict(conn.execute(
        "SELECT * FROM kb_folders WHERE id=?", (fid,)).fetchone()))


@kb_vault.route("/api/kb/folders/<int:fid>", methods=["DELETE"])
@helpers.role_required(config.ROLE_ADMIN)
def delete_folder(fid):
    conn = db.get_db()
    f = conn.execute("SELECT * FROM kb_folders WHERE id=?", (fid,)).fetchone()
    if not f:
        return jsonify(error="Folder not found"), 400
    if f["parent_id"] is None and f["name"] == "General":
        return jsonify(error="Cannot delete the root folder"), 400
    general = conn.execute(
        "SELECT id FROM kb_folders WHERE name='General' AND parent_id IS NULL").fetchone()
    target_parent = f["parent_id"] if f["parent_id"] is not None \
        else (general["id"] if general else None)
    moved_notes = conn.execute(
        "SELECT COUNT(*) AS c FROM kb_notes WHERE folder_id=?", (fid,)).fetchone()["c"]
    try:
        conn.execute(
            "UPDATE kb_notes SET folder_id=? WHERE folder_id=?",
            (target_parent, fid))
        conn.execute(
            "UPDATE kb_folders SET parent_id=? WHERE parent_id=?",
            (target_parent, fid))
        conn.execute("DELETE FROM kb_folders WHERE id=?", (fid,))
        conn.commit()
    except Exception:
        conn.execute("ROLLBACK")
        return jsonify(error="Cannot delete folder (name conflict)"), 400
    return jsonify(ok=True, moved_notes=moved_notes)


@kb_vault.route("/api/kb/notes", methods=["GET"])
@helpers.login_required
def list_notes_v2():
    """List/search/filter notes (paginated, RBAC: requester -> published only)."""
    user = request.current_user
    conn = db.get_db()
    params = []
    where = []
    if user["role"] == config.ROLE_REQUESTER:
        where.append("n.status='published'")
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        where.append("(n.title LIKE ? OR n.content LIKE ?)")
        params += [like, like]
    folder_id = request.args.get("folder_id", type=int)
    if folder_id:
        where.append("n.folder_id=?")
        params.append(folder_id)
    status = request.args.get("status")
    if status in ("published", "draft"):
        where.append("n.status=?")
        params.append(status)
    author_id = request.args.get("author_id", type=int)
    if author_id:
        where.append("n.author_id=?")
        params.append(author_id)
    tag = (request.args.get("tag") or "").strip().lower()
    join_tag = ""
    if tag:
        join_tag = ("JOIN kb_note_tags nt ON nt.note_id=n.id "
                    "JOIN kb_tags t ON t.id=nt.tag_id")
        where.append("lower(t.name)=?")
        params.append(tag)
    base = (f"FROM kb_notes n {join_tag} WHERE "
            + (" AND ".join(where) if where else "1=1"))
    total = conn.execute(
        f"SELECT COUNT(DISTINCT n.id) AS c {base}", params).fetchone()["c"]
    page = max(1, request.args.get("page", type=int) or 1)
    per_page = min(100, max(1, request.args.get("per_page", type=int) or 25))
    rows = conn.execute(
        f"SELECT DISTINCT n.* {base} ORDER BY n.updated_at DESC LIMIT ? OFFSET ?",
        params + [per_page, (page - 1) * per_page]).fetchall()
    items = [_serialize_full(r) for r in rows]
    return jsonify(items=items, total=total, page=page, per_page=per_page)


@kb_vault.route("/api/kb/notes", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def create_note_v2():
    user = request.current_user
    if user["role"] not in AGENT_ROLES:
        return jsonify(error="Only agents, managers and admins can author notes"), 403
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        return jsonify(error="Title and content are required"), 400
    if len(content) > config.MAX_KB_BODY:
        return jsonify(error=f"Content must be <= {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be <= {config.MAX_KB_TITLE} characters"), 400
    folder_id = data.get("folder_id")
    if folder_id is not None:
        f = db.get_db().execute(
            "SELECT 1 FROM kb_folders WHERE id=?", (folder_id,)).fetchone()
        if not f:
            return jsonify(error="Unknown folder"), 400
    else:
        folder_id = _folder_for_category(None)
    now = db.now_iso()
    cur = db.get_db().execute(
        """INSERT INTO kb_notes (folder_id, title, content, author_id, status, views, created_at, updated_at)
           VALUES (?,?,?,?, 'draft', 0, ?, ?)""",
        (folder_id, title, content, user["id"], now, now))
    db.get_db().commit()
    nid = cur.lastrowid
    db.get_db().execute(
        "INSERT INTO kb_note_versions (note_id, title, body, saved_by_id, change_note, saved_at) "
        "VALUES (?,?,?,?,?,?)",
        (nid, title, content, user["id"], "Created", now))
    db.get_db().commit()
    note = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    _extract_wikilinks(content, nid)
    _sync_tags(content, note["frontmatter"], nid)
    return jsonify(note=_serialize_full(db.get_db().execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone())), 201


@kb_vault.route("/api/kb/notes/<int:nid>", methods=["GET"])
@helpers.login_required
def get_note_v2(nid):
    user = request.current_user
    conn = db.get_db()
    a = conn.execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if user["role"] == config.ROLE_REQUESTER and a["status"] != "published":
        return jsonify(error="Note not found"), 404
    if a["status"] == "published":
        conn.execute("UPDATE kb_notes SET views = views + 1 WHERE id=?", (nid,))
        conn.commit()
        a = conn.execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    note = _serialize_full(a)
    backlinks = _backlinks(nid, a["title"])
    local_graph = _local_graph(nid, 2)
    note["backlinks"] = backlinks
    note["local_graph"] = local_graph
    return jsonify(note=note, backlinks=backlinks, local_graph=local_graph)


@kb_vault.route("/api/kb/notes/<int:nid>", methods=["PATCH"])
@helpers.login_required
@helpers.csrf_protect
def edit_note_v2(nid):
    user = request.current_user
    if user["role"] not in AGENT_ROLES:
        return jsonify(error="Not allowed"), 403
    conn = db.get_db()
    a = conn.execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if not (a["author_id"] == user["id"] or user["role"] in AGENT_ROLES):
        return jsonify(error="Not allowed to edit this note"), 403
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") if data.get("title") is not None
             else a["title"]).strip()
    content = data.get("content")
    if content is not None:
        content = content.strip()
    else:
        content = a["content"]
    folder_id = a["folder_id"] if "folder_id" not in data else data.get("folder_id")
    if not title or not content:
        return jsonify(error="Title and content are required"), 400
    if len(content) > config.MAX_KB_BODY:
        return jsonify(error=f"Content must be <= {config.MAX_KB_BODY} characters"), 400
    if len(title) > config.MAX_KB_TITLE:
        return jsonify(error=f"Title must be <= {config.MAX_KB_TITLE} characters"), 400
    if folder_id is not None:
        f = conn.execute("SELECT 1 FROM kb_folders WHERE id=?", (folder_id,)).fetchone()
        if not f:
            return jsonify(error="Unknown folder"), 400
    now = db.now_iso()
    conn.execute(
        "INSERT INTO kb_note_versions (note_id, title, body, saved_by_id, change_note, saved_at) "
        "VALUES (?,?,?,?,?,?)",
        (nid, a["title"], a["content"], user["id"], "Edited", now))
    conn.execute(
        "UPDATE kb_notes SET title=?, content=?, folder_id=?, updated_at=? WHERE id=?",
        (title, content, folder_id, now, nid))
    conn.commit()
    _extract_wikilinks(content, nid)
    fm = conn.execute(
        "SELECT frontmatter FROM kb_notes WHERE id=?", (nid,)).fetchone()["frontmatter"]
    _sync_tags(content, fm, nid)
    return jsonify(note=_serialize_full(conn.execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()))


@kb_vault.route("/api/kb/notes/<int:nid>", methods=["DELETE"])
@helpers.login_required
@helpers.csrf_protect
def delete_note_v2(nid):
    user = request.current_user
    if user["role"] not in AGENT_ROLES:
        return jsonify(error="Not allowed"), 403
    conn = db.get_db()
    a = conn.execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    if not (a["author_id"] == user["id"] or user["role"] in AGENT_ROLES):
        return jsonify(error="Not allowed to delete this note"), 403
    conn.execute("DELETE FROM kb_notes WHERE id=?", (nid,))
    conn.commit()
    return jsonify(ok=True)


@kb_vault.route("/api/kb/notes/<int:nid>/publish", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def publish_note_v2(nid):
    user = request.current_user
    if user["role"] not in AGENT_ROLES:
        return jsonify(error="Not allowed"), 403
    conn = db.get_db()
    a = conn.execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    now = db.now_iso()
    conn.execute(
        "INSERT INTO kb_note_versions (note_id, title, body, saved_by_id, change_note, saved_at) "
        "VALUES (?,?,?,?,?,?)",
        (nid, a["title"], a["content"], user["id"], "Published", now))
    conn.execute(
        "UPDATE kb_notes SET status='published', updated_at=? WHERE id=?",
        (now, nid))
    conn.commit()
    # Phase 6: alert staff (agent/manager/admin) that a new article is live.
    try:
        staff = conn.execute(
            "SELECT id FROM users WHERE role IN ('agent','manager','admin')").fetchall()
        for r in staff:
            notifications.notify(r["id"], "kb_note", nid, "note_published",
                                 f"New article published: {a['title']}")
    except Exception:
        pass
    return jsonify(ok=True, note=_serialize_full(conn.execute(
        "SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()))


@kb_vault.route("/api/kb/notes/<int:nid>/feedback", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def feedback_v2(nid):
    user = request.current_user
    a = db.get_db().execute("SELECT id FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Note not found"), 404
    data = request.get_json(force=True, silent=True) or {}
    helpful = data.get("helpful")
    if helpful not in (0, 1, True, False):
        return jsonify(error="helpful must be true/false"), 400
    helpful = 1 if helpful else 0
    db.get_db().execute(
        "DELETE FROM kb_note_feedback WHERE note_id=? AND user_id=?", (nid, user["id"]))
    db.get_db().execute(
        "INSERT INTO kb_note_feedback (note_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?)",
        (nid, user["id"], helpful, (data.get("comment") or "")[:1000] or None, db.now_iso()))
    db.get_db().commit()
    return jsonify(ok=True)


@kb_vault.route("/api/kb/notes/<int:nid>/versions", methods=["GET"])
@helpers.login_required
def list_versions_v2(nid):
    a = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    if request.current_user["role"] == config.ROLE_REQUESTER and a["status"] != "published":
        return jsonify(error="Not found"), 404
    rows = db.get_db().execute(
        "SELECT id, title, body, saved_by_id, saved_at, change_note "
        "FROM kb_note_versions WHERE note_id=? ORDER BY saved_at DESC",
        (nid,)).fetchall()
    return jsonify(versions=[dict(r) for r in rows])


@kb_vault.route("/api/kb/notes/<int:nid>/versions/<int:vid>/diff", methods=["GET"])
@helpers.login_required
def version_diff_v2(nid, vid):
    a = db.get_db().execute("SELECT * FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    if request.current_user["role"] == config.ROLE_REQUESTER and a["status"] != "published":
        return jsonify(error="Not found"), 404
    v = db.get_db().execute(
        "SELECT * FROM kb_note_versions WHERE id=? AND note_id=?",
        (vid, nid)).fetchone()
    if not v:
        return jsonify(error="Version not found"), 404
    from_body = {"title": v["title"], "body": v["body"]}
    to_body = {"title": a["title"], "body": a["content"]}
    diff = _line_diff(v["body"], a["content"])
    return jsonify({"from": from_body, "to": to_body, "diff": diff})




@kb_vault.route("/api/kb/graph", methods=["GET"])
@helpers.login_required
def kb_graph():
    conn = db.get_db()
    nodes = []
    for n in conn.execute(
            "SELECT n.id, n.title, f.name AS folder_name FROM kb_notes n "
            "LEFT JOIN kb_folders f ON f.id = n.folder_id").fetchall():
        tags = [r["name"] for r in conn.execute(
            "SELECT t.name FROM kb_tags t JOIN kb_note_tags nt ON nt.tag_id=t.id "
            "WHERE nt.note_id=?", (n["id"],)).fetchall()]
        lc = conn.execute(
            "SELECT COUNT(*) AS c FROM kb_wikilinks "
            "WHERE source_note_id=? OR target_note_id=?",
            (n["id"], n["id"])).fetchone()["c"]
        nodes.append({"id": n["id"], "title": n["title"],
                      "folder": n["folder_name"], "tags": tags,
                      "link_count": lc})
    edges = [{"source": r["source_note_id"], "target": r["target_note_id"],
              "alias": r["alias"]}
             for r in conn.execute(
                 "SELECT source_note_id, target_note_id, alias FROM kb_wikilinks").fetchall()]
    return jsonify(nodes=nodes, edges=edges)


@kb_vault.route("/api/kb/graph/local/<int:nid>", methods=["GET"])
@helpers.login_required
def kb_graph_local(nid):
    hops = request.args.get("hops", type=int) or 2
    if hops not in (1, 2):
        hops = 2
    a = db.get_db().execute("SELECT id FROM kb_notes WHERE id=?", (nid,)).fetchone()
    if not a:
        return jsonify(error="Not found"), 404
    g = _local_graph(nid, hops)
    return jsonify(nodes=g["nodes"], edges=g["edges"])


@kb_vault.route("/api/kb/tags", methods=["GET"])
@helpers.login_required
def kb_tags():
    rows = db.get_db().execute(
        "SELECT t.id, t.name, COUNT(nt.note_id) AS count FROM kb_tags t "
        "LEFT JOIN kb_note_tags nt ON nt.tag_id = t.id "
        "GROUP BY t.id ORDER BY t.name").fetchall()
    return jsonify(tags=[dict(r) for r in rows])


@kb_vault.route("/api/kb/analytics", methods=["GET"])
@helpers.role_required(config.ROLE_MANAGER, config.ROLE_ADMIN)
def kb_analytics():
    conn = db.get_db()
    total = conn.execute("SELECT COUNT(*) AS c FROM kb_notes").fetchone()["c"]
    published = conn.execute(
        "SELECT COUNT(*) AS c FROM kb_notes WHERE status='published'").fetchone()["c"]
    drafts = total - published
    total_views = conn.execute(
        "SELECT COALESCE(SUM(views),0) AS c FROM kb_notes").fetchone()["c"]
    helpful_yes = conn.execute(
        "SELECT COALESCE(SUM(helpful_yes),0) AS c FROM kb_notes").fetchone()["c"]
    helpful_no = conn.execute(
        "SELECT COALESCE(SUM(helpful_no),0) AS c FROM kb_notes").fetchone()["c"]
    top_notes = [dict(r) for r in conn.execute(
        "SELECT id, title, views FROM kb_notes ORDER BY views DESC LIMIT 5").fetchall()]
    tag_counts = [dict(r) for r in conn.execute(
        "SELECT t.name AS name, COUNT(nt.note_id) AS count FROM kb_tags t "
        "JOIN kb_note_tags nt ON nt.tag_id = t.id GROUP BY t.id ORDER BY count DESC").fetchall()]
    return jsonify(total=total, published=published, drafts=drafts,
                   total_views=total_views, helpful_yes=helpful_yes,
                   helpful_no=helpful_no, top_notes=top_notes,
                   tag_counts=tag_counts)


@kb_vault.route("/api/kb/notes/<int:nid>/draft-from-ticket", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def draft_from_ticket_v2(nid):
    user = request.current_user
    if user["role"] not in AGENT_ROLES:
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
        (issue_id,)).fetchone()
    if not t:
        return jsonify(error="Issue not found"), 404
    body, _ai_used = _draft_kb_body(user, t)
    return jsonify(title=t["summary"], body=body,
                   category_id=t["category_id"], source_issue_id=issue_id), 200
