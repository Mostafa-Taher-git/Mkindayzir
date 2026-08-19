"""
Backend test suite for Phase 5 — Help Center.

Covers:
  * GET  /api/help/guides            -> 5 fixed tabs with seeded note counts
  * GET  /api/help/guides/<tab>      -> published notes for a known tab / 404
  * lazy seeding of the __help__ KB folder + subtree
  * GET  /api/help/progress          -> total of 6 milestones
  * POST /api/help/progress          -> record + idempotent milestone
  * GET  /api/help/shortcuts         -> non-empty keyboard shortcut list
  * GET  /api/help/tours/<tour>      -> tour steps / 404
  * milestone hook: creating a Jira issue records "created_first_issue"

Run with:  pytest tests/test_help.py   (project root, venv activated)
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, config


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


# ---------------------------------------------------------------------------
# Guides
# ---------------------------------------------------------------------------
class TestGuides:
    def test_list_has_five_tabs(self, client):
        _login(client, "agent@opsdesk.local")
        data = client.get("/api/help/guides").get_json()
        guides = data["guides"]
        assert len(guides) == 5
        keys = [g["key"] for g in guides]
        assert keys == ["jira", "trello", "kb", "ai", "admin"]
        for g in guides:
            assert "note_count" in g

    def test_seeded_tabs_have_notes(self, client):
        _login(client, "agent@opsdesk.local")
        data = client.get("/api/help/guides").get_json()
        guides = {g["key"]: g for g in data["guides"]}
        assert guides["jira"]["note_count"] > 0

    def test_single_tab_returns_published_notes(self, client):
        _login(client, "agent@opsdesk.local")
        data = client.get("/api/help/guides/jira").get_json()
        assert data["tab"] == "jira"
        assert data["label"] == "Jira"
        notes = data["notes"]
        assert isinstance(notes, list)
        for n in notes:
            assert "title" in n and "content" in n
        titles = [n["title"] for n in notes]
        assert titles == sorted(titles)

    def test_unknown_tab_404(self, client):
        _login(client, "agent@opsdesk.local")
        assert client.get("/api/help/guides/nope").status_code == 404


# ---------------------------------------------------------------------------
# Lazy seeding (DB-level assertions)
# ---------------------------------------------------------------------------
class TestSeeding:
    def test_help_folder_and_notes_seeded(self, client):
        _login(client, "agent@opsdesk.local")
        client.get("/api/help/guides")
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        conn.row_factory = sqlite3.Row
        root = conn.execute(
            "SELECT id FROM kb_folders WHERE name='__help__' AND parent_id IS NULL"
        ).fetchone()
        assert root is not None
        root_id = root["id"]
        subfolders = conn.execute(
            "SELECT id FROM kb_folders WHERE parent_id=?", (root_id,)
        ).fetchall()
        assert len(subfolders) == 5
        sub_ids = [r["id"] for r in subfolders]
        placeholders = ",".join("?" for _ in sub_ids)
        count = conn.execute(
            f"SELECT COUNT(*) AS c FROM kb_notes WHERE folder_id IN ({placeholders})",
            sub_ids,
        ).fetchone()["c"]
        assert count > 0


# ---------------------------------------------------------------------------
# Onboarding progress
# ---------------------------------------------------------------------------
class TestProgress:
    def test_progress_total_is_six(self, client):
        _login(client, "agent@opsdesk.local")
        data = client.get("/api/help/progress").get_json()
        assert data["total"] == 6

    def test_record_milestone(self, client):
        _login(client, "agent@opsdesk.local")
        tok = _csrf(client)
        r = client.post("/api/help/progress",
                        json={"milestone_key": "invited_a_member"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        body = r.get_json()
        assert body["ok"] is True
        assert body["milestone_key"] == "invited_a_member"
        assert body["completed_at"]

    def test_milestone_idempotent(self, client):
        _login(client, "agent@opsdesk.local")
        tok = _csrf(client)
        client.post("/api/help/progress",
                    json={"milestone_key": "invited_a_member"},
                    headers={"X-CSRF-Token": tok})
        tok2 = _csrf(client)
        r2 = client.post("/api/help/progress",
                         json={"milestone_key": "invited_a_member"},
                         headers={"X-CSRF-Token": tok2})
        assert r2.status_code == 200
        data = client.get("/api/help/progress").get_json()
        assert data["completed"].count("invited_a_member") == 1
        assert "invited_a_member" in data["completed"]


# ---------------------------------------------------------------------------
# Shortcuts & tours
# ---------------------------------------------------------------------------
class TestShortcuts:
    def test_shortcuts_list(self, client):
        _login(client, "agent@opsdesk.local")
        data = client.get("/api/help/shortcuts").get_json()
        shortcuts = data["shortcuts"]
        assert isinstance(shortcuts, list) and len(shortcuts) > 0
        for s in shortcuts:
            assert "keys" in s and "description" in s


class TestTours:
    def test_known_tour_has_steps(self, client):
        _login(client, "agent@opsdesk.local")
        for tour_key in ("getting_started", "kb-basics"):
            data = client.get(f"/api/help/tours/{tour_key}").get_json()
            tour = data["tour"]
            assert tour["key"] == tour_key
            assert isinstance(tour["steps"], list)
            assert len(tour["steps"]) > 0
            for step in tour["steps"]:
                for f in ("selector", "title", "text", "position"):
                    assert f in step

    def test_unknown_tour_404(self, client):
        _login(client, "agent@opsdesk.local")
        assert client.get("/api/help/tours/nope").status_code == 404


# ---------------------------------------------------------------------------
# Milestone hook (Jira issue creation)
# ---------------------------------------------------------------------------
class TestMilestoneHook:
    def test_creating_issue_records_milestone(self, client):
        _login(client, "agent@opsdesk.local")
        tok = _csrf(client)
        r = client.post("/api/jira/issues",
                        json={"summary": "First issue from help test"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 201
        data = client.get("/api/help/progress").get_json()
        assert "created_first_issue" in data["completed"]
