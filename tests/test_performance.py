"""
Backend performance suite for Phase 7 — behaviour at scale.

These tests seed large datasets with direct SQL inserts (fast) and then hit
the real endpoints to confirm the system behaves well at scale. Response-time
assertions use a GENEROUS bound (10s) to avoid flakiness; if a query is
genuinely slow (>10s) that is a real finding and the bound is left intact.

Run with:  pytest tests/test_performance.py   (project root, venv activated)
"""
import os
import sys
import tempfile
import time

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


def _token(client, email="admin@opsdesk.local", password="password"):
    _login(client, email, password)
    return _csrf(client)


def _now():
    return db.now_iso()


class TestAtScale:
    def test_kb_graph_500_nodes(self, app, client):
        tok = _token(client)
        with app.app_context():
            conn = db.get_db()
            conn.execute("INSERT INTO kb_folders (name, parent_id) "
                         "VALUES ('Perf Folder', NULL)")
            folder_id = conn.execute(
                "SELECT id FROM kb_folders WHERE name='Perf Folder' "
                "AND parent_id IS NULL").fetchone()["id"]
            now = _now()
            for i in range(600):
                conn.execute(
                    "INSERT INTO kb_notes (folder_id, title, content, author_id, "
                    "status, views, created_at, updated_at) "
                    "VALUES (?,?,?,?, 'published', 0, ?, ?)",
                    (folder_id, f"Perf note {i}", f"body {i}", 1, now, now))
            # a handful of wikilinks between the notes
            for i in range(0, 100, 2):
                conn.execute(
                    "INSERT INTO kb_wikilinks (source_note_id, target_note_id, "
                    "created_at) VALUES (?,?,?)",
                    (i + 1, i + 2, now))
            conn.commit()

        t0 = time.time()
        r = client.get("/api/kb/graph", headers={"X-CSRF-Token": tok})
        elapsed = time.time() - t0
        assert r.status_code == 200
        nodes = r.get_json()["nodes"]
        assert len(nodes) >= 500
        assert elapsed < 10, f"graph took {elapsed:.2f}s (>=500 nodes)"

    def test_board_200_cards(self, app, client):
        tok = _token(client)
        # build the workspace/board/list via the real API
        ws = client.post("/api/trello/workspaces", json={"name": "Perf WS"},
                         headers={"X-CSRF-Token": tok}).get_json()["workspace"]
        board = client.post("/api/trello/boards",
                            json={"workspace_id": ws["id"], "title": "Perf Board"},
                            headers={"X-CSRF-Token": tok}).get_json()["board"]
        lst = client.post(f"/api/trello/boards/{board['id']}/lists",
                          json={"title": "Perf List"},
                          headers={"X-CSRF-Token": tok}).get_json()["list"]

        with app.app_context():
            conn = db.get_db()
            now = _now()
            for i in range(250):
                conn.execute(
                    "INSERT INTO trello_cards (list_id, title, description, "
                    "position, is_complete, created_at, updated_at) "
                    "VALUES (?,?,?,?,0,?,?)",
                    (lst["id"], f"Perf card {i}", f"desc {i}", float(i), now, now))
            conn.commit()

        t0 = time.time()
        r = client.get(f"/api/trello/boards/{board['id']}",
                       headers={"X-CSRF-Token": tok})
        elapsed = time.time() - t0
        assert r.status_code == 200
        total = sum(len(l["cards"]) for l in r.get_json()["lists"])
        assert total >= 200
        assert elapsed < 10, f"board load took {elapsed:.2f}s (>=200 cards)"

    def test_kb_tree_at_scale(self, app, client):
        tok = _token(client)
        with app.app_context():
            conn = db.get_db()
            now = _now()
            parent = conn.execute(
                "INSERT INTO kb_folders (name, parent_id) VALUES ('Perf Root', NULL)"
            ).lastrowid
            child_ids = []
            for i in range(20):
                cid = conn.execute(
                    "INSERT INTO kb_folders (name, parent_id) VALUES (?,?)",
                    (f"Perf Sub {i}", parent)).lastrowid
                child_ids.append(cid)
            for i in range(300):
                conn.execute(
                    "INSERT INTO kb_notes (folder_id, title, content, author_id, "
                    "status, views, created_at, updated_at) "
                    "VALUES (?,?,?,?, 'published', 0, ?, ?)",
                    (child_ids[i % len(child_ids)], f"Tree note {i}", f"body {i}",
                     1, now, now))
            conn.commit()

        t0 = time.time()
        r = client.get("/api/kb/tree", headers={"X-CSRF-Token": tok})
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert elapsed < 10, f"tree took {elapsed:.2f}s"

    def test_search_at_scale(self, app, client):
        tok = _token(client)
        with app.app_context():
            conn = db.get_db()
            now = _now()
            for i in range(300):
                conn.execute(
                    "INSERT INTO jira_issues (requester_id, assignee_id, project_id, "
                    "issue_key, summary, description, status, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?, 'new', ?, ?)",
                    (1, None, 1, f"PERF-{i:04d}", f"Perf issue {i}", f"desc {i}",
                     now, now))
            conn.commit()

        t0 = time.time()
        r = client.get("/api/search?q=Perf issue&scope=issues&limit=25",
                       headers={"X-CSRF-Token": tok})
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert len(r.get_json()["issues"]) > 0
        assert elapsed < 10, f"search took {elapsed:.2f}s (300 issues)"
