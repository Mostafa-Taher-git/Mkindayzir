"""
Backend test suite for the Obsidian Knowledge Base module (Phase 2B).

Covers the NEW vault endpoints implemented in app/routes_kb_vault.py:
  * GET  /api/kb/tree                 -> hierarchical folder tree
  * POST /api/kb/folders              (agent+)  201 / 409 dup / 403 requester
  * PATCH /api/kb/folders/<id>        (agent+)  404 / 400 cycle
  * DELETE /api/kb/folders/<id>       (admin)   reparents notes / 400 General / 403
  * GET  /api/kb/notes                -> paginated {items,total,page,per_page}
  * POST /api/kb/notes                (agent+)  201 / 400 required / length caps
  * GET  /api/kb/notes/<id>           -> detail w/ backlinks + local_graph
  * PATCH/DELETE /api/kb/notes/<id>   (agent+)  re-extract / 403 / 404
  * POST /api/kb/notes/<id>/publish   (agent+)  403 requester
  * POST /api/kb/notes/<id>/feedback  -> {ok}, upsert
  * GET  /api/kb/notes/<id>/versions  + .../versions/<vid>/diff
  * wikilink + tag extraction, backlinks, graph, analytics, collections,
    suggest, draft-from-ticket

Run with:  pytest tests/test_kb.py   (project root, venv activated)
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, config, db


@pytest.fixture
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["OPERADESK_SECRET"] = "test-secret"
    config.DB_PATH = path
    application = create_app()
    application.config["TESTING"] = True
    yield application
    os.remove(path)
    for ext in ("-wal", "-shm"):
        try:
            os.remove(path + ext)
        except OSError:
            pass


@pytest.fixture
def client(app):
    return app.test_client()


def _csrf(client):
    return client.get("/api/auth/csrf").get_json()["csrf_token"]


def _login(client, email, password="password"):
    token = _csrf(client)
    return client.post("/api/auth/login",
                       json={"email": email, "password": password},
                       headers={"X-CSRF-Token": token})


def _token(client, email="agent@opsdesk.local", password="password"):
    _login(client, email, password)
    return _csrf(client)


def _h(token):
    return {"X-CSRF-Token": token}


def _q(app, sql, params=()):
    with app.app_context():
        return db.get_db().execute(sql, params).fetchall()


def _create_note(client, token, title, content, folder_id=None):
    body = {"title": title, "content": content}
    if folder_id is not None:
        body["folder_id"] = folder_id
    return client.post("/api/kb/notes", json=body, headers=_h(token)).get_json()


def _create_folder(client, token, name, parent_id=None):
    body = {"name": name}
    if parent_id is not None:
        body["parent_id"] = parent_id
    return client.post("/api/kb/folders", json=body, headers=_h(token)).get_json()


def _find_general(app):
    rows = _q(app, "SELECT id FROM kb_folders WHERE name='General' AND parent_id IS NULL")
    return rows[0]["id"] if rows else None


# ---------------------------------------------------------------------------
# Auth / tree
# ---------------------------------------------------------------------------
class TestAuthAndTree:
    def test_tree_requires_login(self, client):
        assert client.get("/api/kb/tree").status_code == 401

    def test_tree_shape(self, client):
        tok = _token(client)
        r = client.get("/api/kb/tree", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        assert "tree" in data and isinstance(data["tree"], list)
        for node in data["tree"]:
            for k in ("id", "name", "parent_id", "note_count", "notes", "children"):
                assert k in node

    def test_tree_includes_created_folder(self, client):
        tok = _token(client)
        _create_folder(client, tok, "MyFolder", None)
        tree = client.get("/api/kb/tree", headers=_h(tok)).get_json()["tree"]
        names = [n["name"] for n in tree]
        assert "MyFolder" in names

    def test_notes_list_requires_login(self, client):
        assert client.get("/api/kb/notes").status_code == 401


# ---------------------------------------------------------------------------
# Folders: create
# ---------------------------------------------------------------------------
class TestFolderCreate:
    def test_agent_can_create(self, client):
        tok = _token(client)
        r = client.post("/api/kb/folders",
                        json={"name": "FolderA", "parent_id": None},
                        headers=_h(tok))
        assert r.status_code == 201
        folder = r.get_json()["folder"]
        assert folder["name"] == "FolderA"
        assert folder["parent_id"] is None

    def test_duplicate_is_409(self, client):
        tok = _token(client)
        parent = _create_folder(client, tok, "ParentDup", None)["folder"]
        client.post("/api/kb/folders",
                    json={"name": "Dup", "parent_id": parent["id"]},
                    headers=_h(tok))
        r = client.post("/api/kb/folders",
                        json={"name": "Dup", "parent_id": parent["id"]},
                        headers=_h(tok))
        assert r.status_code == 409

    def test_requester_forbidden(self, client):
        tok = _token(client, "sam@opsdesk.local")
        r = client.post("/api/kb/folders", json={"name": "X"}, headers=_h(tok))
        assert r.status_code == 403

    def test_child_folder(self, client):
        tok = _token(client)
        parent = _create_folder(client, tok, "Parent", None)["folder"]
        child = client.post("/api/kb/folders",
                            json={"name": "Child", "parent_id": parent["id"]},
                            headers=_h(tok)).get_json()["folder"]
        assert child["parent_id"] == parent["id"]


# ---------------------------------------------------------------------------
# Folders: patch
# ---------------------------------------------------------------------------
class TestFolderPatch:
    def test_missing_is_404(self, client):
        tok = _token(client)
        r = client.patch("/api/kb/folders/999999", json={"name": "x"}, headers=_h(tok))
        assert r.status_code == 404

    def test_cycle_is_400(self, client):
        tok = _token(client)
        a = _create_folder(client, tok, "A", None)["folder"]
        b = _create_folder(client, tok, "B", a["id"])["folder"]
        r = client.patch(f"/api/kb/folders/{a['id']}",
                         json={"parent_id": b["id"]}, headers=_h(tok))
        assert r.status_code == 400

    def test_rename_works(self, client):
        tok = _token(client)
        a = _create_folder(client, tok, "RenameMe", None)["folder"]
        r = client.patch(f"/api/kb/folders/{a['id']}",
                         json={"name": "Renamed"}, headers=_h(tok))
        assert r.status_code == 200
        assert r.get_json()["folder"]["name"] == "Renamed"


# ---------------------------------------------------------------------------
# Folders: delete (admin only)
# ---------------------------------------------------------------------------
class TestFolderDelete:
    def test_requester_cannot(self, client):
        tok = _token(client, "sam@opsdesk.local")
        admin = _token(client)
        f = _create_folder(client, admin, "ToDel", None)["folder"]
        r = client.delete(f"/api/kb/folders/{f['id']}", headers=_h(tok))
        assert r.status_code == 403

    def test_non_admin_forbidden(self, client):
        agent = _token(client, "agent@opsdesk.local")
        admin = _token(client)
        f = _create_folder(client, admin, "ToDel2", None)["folder"]
        r = client.delete(f"/api/kb/folders/{f['id']}", headers=_h(agent))
        assert r.status_code == 403

    def test_delete_general_is_400(self, client, app):
        admin = _token(client, "admin@opsdesk.local")
        gid = _find_general(app)
        if gid is None:
            _create_note(client, admin, "Gen", "body")
            gid = _find_general(app)
        r = client.delete(f"/api/kb/folders/{gid}", headers=_h(admin))
        assert r.status_code == 400

    def test_delete_reparents_notes(self, client, app):
        admin = _token(client, "admin@opsdesk.local")
        f = _create_folder(client, admin, "Holder", None)["folder"]
        note = _create_note(client, admin, "InHolder", "body", folder_id=f["id"])["note"]
        r = client.delete(f"/api/kb/folders/{f['id']}", headers=_h(admin))
        assert r.status_code == 200
        after = client.get(f"/api/kb/notes/{note['id']}", headers=_h(admin)).get_json()["note"]
        assert after["folder_id"] != f["id"]


# ---------------------------------------------------------------------------
# Notes: list + pagination + requester visibility
# ---------------------------------------------------------------------------
class TestNotesList:
    def test_pagination_shape(self, client):
        tok = _token(client)
        r = client.get("/api/kb/notes?page=1&per_page=10", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        for k in ("items", "total", "page", "per_page"):
            assert k in data
        assert isinstance(data["items"], list)

    def test_requester_sees_only_published(self, client):
        agent = _token(client, "agent@opsdesk.local")
        draft = _create_note(client, agent, "DraftNote", "draft body")["note"]
        published = _create_note(client, agent, "PubNote", "pub body")["note"]
        client.post(f"/api/kb/notes/{published['id']}/publish", json={},
                    headers=_h(agent))
        sam = _token(client, "sam@opsdesk.local")
        data = client.get("/api/kb/notes", headers=_h(sam)).get_json()
        titles = [n["title"] for n in data["items"]]
        assert "PubNote" in titles
        assert "DraftNote" not in titles

    def test_filter_status(self, client):
        agent = _token(client, "agent@opsdesk.local")
        _create_note(client, agent, "S1", "x")
        p = _create_note(client, agent, "S2", "y")["note"]
        client.post(f"/api/kb/notes/{p['id']}/publish", json={}, headers=_h(agent))
        r = client.get("/api/kb/notes?status=published", headers=_h(agent)).get_json()
        assert all(n["status"] == "published" for n in r["items"])

    def test_filter_q(self, client):
        agent = _token(client, "agent@opsdesk.local")
        _create_note(client, agent, "UniqueTitleZZZ", "some content")
        r = client.get("/api/kb/notes?q=UniqueTitleZZZ", headers=_h(agent)).get_json()
        assert any(n["title"] == "UniqueTitleZZZ" for n in r["items"])

    def test_filter_author(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "ByAgent", "c")["note"]
        r = client.get(f"/api/kb/notes?author_id={n['author_id']}",
                       headers=_h(agent)).get_json()
        assert all(n2["author_id"] == n["author_id"] for n2 in r["items"])

    def test_filter_tag(self, client):
        agent = _token(client, "agent@opsdesk.local")
        _create_note(client, agent, "TaggedNote",
                     "---\ntags: [filtertag]\n---")
        r = client.get("/api/kb/notes?tag=filtertag", headers=_h(agent)).get_json()
        assert any(n["title"] == "TaggedNote" for n in r["items"])


# ---------------------------------------------------------------------------
# Notes: create
# ---------------------------------------------------------------------------
class TestNoteCreate:
    def test_agent_creates(self, client):
        tok = _token(client)
        r = client.post("/api/kb/notes",
                        json={"title": "T1", "content": "C1"}, headers=_h(tok))
        assert r.status_code == 201
        assert "note" in r.get_json()

    def test_requires_title_and_content(self, client):
        tok = _token(client)
        assert client.post("/api/kb/notes", json={"title": ""},
                           headers=_h(tok)).status_code == 400
        assert client.post("/api/kb/notes", json={"content": ""},
                           headers=_h(tok)).status_code == 400

    def test_length_caps(self, client):
        tok = _token(client)
        too_long = "x" * (config.MAX_KB_BODY + 1)
        r = client.post("/api/kb/notes",
                        json={"title": "long", "content": too_long},
                        headers=_h(tok))
        assert r.status_code == 400

    def test_requester_forbidden(self, client):
        tok = _token(client, "sam@opsdesk.local")
        r = client.post("/api/kb/notes",
                        json={"title": "nope", "content": "x"}, headers=_h(tok))
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Notes: detail, backlinks, local_graph
# ---------------------------------------------------------------------------
class TestNoteDetail:
    def test_detail_shape(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "DetailNote", "body")["note"]
        r = client.get(f"/api/kb/notes/{n['id']}", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        assert "note" in data
        assert "backlinks" in data
        assert "local_graph" in data

    def test_backlinks_linked(self, client):
        tok = _token(client)
        b = _create_note(client, tok, "Note B", "body of B")["note"]
        c = _create_note(client, tok, "Note C", "body of C")["note"]
        a = _create_note(client, tok, "Note A",
                         "See [[Note B]] and [[Note C|alias]]")["note"]
        client.patch(f"/api/kb/notes/{a['id']}",
                     json={"title": "Note A",
                           "content": "See [[Note B]] and [[Note C|alias]]"},
                     headers=_h(tok))
        detail = client.get(f"/api/kb/notes/{b['id']}", headers=_h(tok)).get_json()
        linked = detail["backlinks"]["linked"]
        ids = [x["id"] for x in linked]
        assert a["id"] in ids

    def test_backlinks_unlinked(self, client):
        tok = _token(client)
        b = _create_note(client, tok, "TargetPlain", "b")["note"]
        d = _create_note(client, tok, "Mentioner",
                         "this text mentions TargetPlain plainly")["note"]
        client.patch(f"/api/kb/notes/{d['id']}",
                     json={"title": "Mentioner",
                           "content": "this text mentions TargetPlain plainly"},
                     headers=_h(tok))
        detail = client.get(f"/api/kb/notes/{b['id']}", headers=_h(tok)).get_json()
        unlinked_ids = [x["id"] for x in detail["backlinks"].get("unlinked", [])]
        assert d["id"] in unlinked_ids

    def test_404_missing(self, client):
        tok = _token(client)
        assert client.get("/api/kb/notes/999999", headers=_h(tok)).status_code == 404


# ---------------------------------------------------------------------------
# Notes: patch / delete / publish
# ---------------------------------------------------------------------------
class TestNoteMutations:
    def test_patch_creates_version(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "VerNote", "v1")["note"]
        client.patch(f"/api/kb/notes/{n['id']}",
                     json={"title": "VerNote", "content": "v2"}, headers=_h(tok))
        vers = client.get(f"/api/kb/notes/{n['id']}/versions",
                          headers=_h(tok)).get_json()["versions"]
        assert len(vers) >= 1

    def test_patch_extracts_wikilinks(self, client, app):
        tok = _token(client)
        b = _create_note(client, tok, "LinkTargetB", "b")["note"]
        c = _create_note(client, tok, "LinkTargetC", "c")["note"]
        a = _create_note(client, tok, "LinkSrc", "nothing yet")["note"]
        client.patch(f"/api/kb/notes/{a['id']}",
                     json={"title": "LinkSrc",
                           "content": "See [[LinkTargetB]] and [[LinkTargetC|alias]]"},
                     headers=_h(tok))
        rows = _q(app,
                  "SELECT target_note_id FROM kb_wikilinks WHERE source_note_id=?",
                  (a["id"],))
        targets = {r["target_note_id"] for r in rows}
        assert b["id"] in targets and c["id"] in targets

    def test_delete_requester_forbidden(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "DelNote", "x")["note"]
        sam = _token(client, "sam@opsdesk.local")
        r = client.delete(f"/api/kb/notes/{n['id']}", headers=_h(sam))
        assert r.status_code == 403

    def test_delete_missing(self, client):
        tok = _token(client)
        assert client.delete("/api/kb/notes/999999", headers=_h(tok)).status_code == 404

    def test_publish_sets_status(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "PubMe", "x")["note"]
        assert n["status"] == "draft"
        r = client.post(f"/api/kb/notes/{n['id']}/publish", json={}, headers=_h(agent))
        assert r.status_code == 200
        assert r.get_json()["note"]["status"] == "published"

    def test_publish_requester_forbidden(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "PubForbidden", "x")["note"]
        sam = _token(client, "sam@opsdesk.local")
        r = client.post(f"/api/kb/notes/{n['id']}/publish", json={}, headers=_h(sam))
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
class TestFeedback:
    def test_requires_helpful(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "FbNote", "x")["note"]
        r = client.post(f"/api/kb/notes/{n['id']}/feedback", json={}, headers=_h(agent))
        assert r.status_code == 400

    def test_submit_ok(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "FbNote2", "x")["note"]
        r = client.post(f"/api/kb/notes/{n['id']}/feedback",
                        json={"helpful": True}, headers=_h(agent))
        assert r.status_code == 200
        assert r.get_json().get("ok") is True

    def test_upsert_one_vote(self, client, app):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "FbNote3", "x")["note"]
        client.post(f"/api/kb/notes/{n['id']}/feedback",
                    json={"helpful": True}, headers=_h(agent))
        client.post(f"/api/kb/notes/{n['id']}/feedback",
                    json={"helpful": False}, headers=_h(agent))
        rows = _q(app,
                  "SELECT helpful FROM kb_note_feedback WHERE note_id=?",
                  (n["id"],))
        assert len(rows) == 1
        assert rows[0]["helpful"] == 0


# ---------------------------------------------------------------------------
# Versions + diff
# ---------------------------------------------------------------------------
class TestVersions:
    def test_versions_list(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "VList", "orig")["note"]
        client.patch(f"/api/kb/notes/{n['id']}",
                     json={"title": "VList", "content": "changed"}, headers=_h(tok))
        r = client.get(f"/api/kb/notes/{n['id']}/versions", headers=_h(tok))
        assert r.status_code == 200
        assert isinstance(r.get_json()["versions"], list)

    def test_diff_shape(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "VDiff", "line one\nline two")["note"]
        client.patch(f"/api/kb/notes/{n['id']}",
                     json={"title": "VDiff", "content": "line one\nline three"},
                     headers=_h(tok))
        vers = client.get(f"/api/kb/notes/{n['id']}/versions",
                          headers=_h(tok)).get_json()["versions"]
        vid = vers[0]["id"]
        r = client.get(f"/api/kb/notes/{n['id']}/versions/{vid}/diff", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        assert "from" in data and "to" in data
        assert isinstance(data["diff"], list)
        for seg in data["diff"]:
            assert seg["type"] in ("add", "del", "context")
            assert "text" in seg


# ---------------------------------------------------------------------------
# Tag extraction
# ---------------------------------------------------------------------------
class TestTags:
    def test_frontmatter_tags(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "Tagged",
                         "---\ntags: [alpha, beta]\n---\nbody")["note"]
        detail = client.get(f"/api/kb/notes/{n['id']}", headers=_h(tok)).get_json()["note"]
        tags = detail.get("tags", [])
        tag_names = {t if isinstance(t, str) else t.get("name") for t in tags}
        assert "alpha" in tag_names and "beta" in tag_names

    def test_tags_endpoint_counts(self, client):
        tok = _token(client)
        _create_note(client, tok, "Tagged2",
                     "---\ntags: [countme]\n---\nbody")
        r = client.get("/api/kb/tags", headers=_h(tok))
        assert r.status_code == 200
        assert "tags" in r.get_json()


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------
class TestGraph:
    def test_graph_shape(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "GraphNode", "body")["note"]
        r = client.get("/api/kb/graph", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        assert "nodes" in data and "edges" in data
        node = next(x for x in data["nodes"] if x["id"] == n["id"])
        for k in ("title", "folder", "tags", "link_count"):
            assert k in node
        for e in data["edges"]:
            assert "source" in e and "target" in e

    def test_local_graph(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "LocalCenter", "body")["note"]
        r = client.get(f"/api/kb/graph/local/{n['id']}?hops=2", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        assert "nodes" in data and "edges" in data


# ---------------------------------------------------------------------------
# Analytics (manager/admin only)
# ---------------------------------------------------------------------------
class TestAnalytics:
    def test_agent_forbidden(self, client):
        tok = _token(client, "agent@opsdesk.local")
        assert client.get("/api/kb/analytics", headers=_h(tok)).status_code == 403

    def test_requester_forbidden(self, client):
        tok = _token(client, "sam@opsdesk.local")
        assert client.get("/api/kb/analytics", headers=_h(tok)).status_code == 403

    def test_manager_ok(self, client):
        tok = _token(client, "manager@opsdesk.local")
        r = client.get("/api/kb/analytics", headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        for k in ("total", "published", "drafts"):
            assert k in data

    def test_admin_ok(self, client):
        tok = _token(client, "admin@opsdesk.local")
        r = client.get("/api/kb/analytics", headers=_h(tok))
        assert r.status_code == 200
        assert "total" in r.get_json()


# ---------------------------------------------------------------------------
# Collections
# ---------------------------------------------------------------------------
class TestCollections:
    def test_list_empty(self, client):
        tok = _token(client)
        r = client.get("/api/kb/collections", headers=_h(tok))
        assert r.status_code == 200
        assert "collections" in r.get_json()

    def test_create_and_requester_forbidden(self, client):
        tok = _token(client)
        r = client.post("/api/kb/collections", json={"name": "ColA"},
                        headers=_h(tok))
        assert r.status_code == 201
        cid = r.get_json()["collection"]["id"]
        sam = _token(client, "sam@opsdesk.local")
        bad = client.post("/api/kb/collections", json={"name": "ColB"},
                          headers=_h(sam))
        assert bad.status_code == 403

    def test_add_remove_notes(self, client):
        tok = _token(client)
        col = client.post("/api/kb/collections", json={"name": "ColC"},
                          headers=_h(tok)).get_json()["collection"]
        n = _create_note(client, tok, "InCol", "x")["note"]
        add = client.post(f"/api/kb/collections/{col['id']}/notes",
                          json={"note_id": n["id"]}, headers=_h(tok))
        assert add.status_code in (200, 201)
        listed = client.get(f"/api/kb/collections/{col['id']}/notes",
                            headers=_h(tok)).get_json()["notes"]
        assert any(x["id"] == n["id"] for x in listed)
        rem = client.delete(f"/api/kb/collections/{col['id']}/notes/{n['id']}",
                            headers=_h(tok))
        assert rem.status_code == 200

    def test_requester_cannot_modify_notes(self, client):
        tok = _token(client)
        col = client.post("/api/kb/collections", json={"name": "ColD"},
                          headers=_h(tok)).get_json()["collection"]
        n = _create_note(client, tok, "InCol2", "x")["note"]
        sam = _token(client, "sam@opsdesk.local")
        r = client.post(f"/api/kb/collections/{col['id']}/notes",
                        json={"note_id": n["id"]}, headers=_h(sam))
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Suggest
# ---------------------------------------------------------------------------
class TestSuggest:
    def test_returns_suggestions(self, client):
        tok = _token(client, "agent@opsdesk.local")
        _create_note(client, tok, "VPN Setup Guide",
                     "how to configure the vpn client")
        r = client.get("/api/kb/suggest?q=vpn", headers=_h(tok))
        assert r.status_code == 200
        assert "suggestions" in r.get_json()

    def test_empty_query(self, client):
        tok = _token(client)
        r = client.get("/api/kb/suggest", headers=_h(tok))
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Draft from ticket
# ---------------------------------------------------------------------------
class TestDraftFromTicket:
    def _make_issue(self, app):
        with app.app_context():
            conn = db.get_db()
            proj = conn.execute(
                "SELECT id FROM jira_projects LIMIT 1").fetchone()
            pid = proj["id"] if proj else None
            now = db.now_iso()
            cur = conn.execute(
                """INSERT INTO jira_issues
                   (issue_key, project_id, summary, description, status,
                    requester_id, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                ("TESTKB-1", pid, "Broken printer", "The printer is broken",
                 "new", 1, now, now))
            conn.commit()
            return cur.lastrowid

    def test_requester_forbidden(self, client):
        agent = _token(client, "agent@opsdesk.local")
        n = _create_note(client, agent, "DraftHost", "x")["note"]
        sam = _token(client, "sam@opsdesk.local")
        r = client.post(f"/api/kb/notes/{n['id']}/draft-from-ticket",
                        json={"issue_id": 1}, headers=_h(sam))
        assert r.status_code == 403

    def test_missing_issue(self, client):
        tok = _token(client)
        n = _create_note(client, tok, "DraftHost2", "x")["note"]
        r = client.post(f"/api/kb/notes/{n['id']}/draft-from-ticket",
                        json={"issue_id": 999999}, headers=_h(tok))
        assert r.status_code == 404

    def test_valid_issue(self, client, app):
        tok = _token(client)
        n = _create_note(client, tok, "DraftHost3", "x")["note"]
        iid = self._make_issue(app)
        r = client.post(f"/api/kb/notes/{n['id']}/draft-from-ticket",
                        json={"issue_id": iid}, headers=_h(tok))
        assert r.status_code == 200
        data = r.get_json()
        assert "title" in data and "body" in data
