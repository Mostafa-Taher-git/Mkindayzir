"""
Backend test suite for Phase 6 — Integration & Polish.

Covers:
  * Omnisearch (GET /api/search) across issues/cards/notes with scope filter
    and requester RBAC (own issues + published notes only).
  * Cross-entity links (POST/GET/DELETE /api/entity-links) incl. idempotency,
    validation, and creator/admin-only deletion.
  * Notification triggers: card_assigned, note_published, goal_update
    (verified via GET /api/notifications).

Run with:  pytest tests/test_shared.py   (project root, venv activated)
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


def _token(client, email="admin@opsdesk.local", password="password"):
    _login(client, email, password)
    return _csrf(client)


def _login_as(client, email, password="password"):
    """Login as `email` and return (csrf_token, user_id). The session cookie is
    left pointing at this user so the returned token is usable immediately."""
    _login(client, email, password)
    tok = _csrf(client)
    uid = client.get("/api/auth/me",
                    headers={"X-CSRF-Token": tok}).get_json()["user"]["id"]
    return tok, uid


def _notifications(client, tok):
    return client.get("/api/notifications",
                      headers={"X-CSRF-Token": tok}).get_json()["notifications"]


# --- Jira helpers (mirror tests/test_jira.py) --------------------------------
def _create_issue(client, tok, subject="issue", desc="desc", extra=None):
    payload = {"subject": subject, "description": desc}
    if extra:
        payload.update(extra)
    return client.post("/api/jira/issues", json=payload,
                       headers={"X-CSRF-Token": tok}).get_json()["issue"]


def _create_goal(client, tok, title="goal", owner_id=None):
    payload = {"title": title}
    if owner_id is not None:
        payload["owner_id"] = owner_id
    return client.post("/api/jira/goals", json=payload,
                       headers={"X-CSRF-Token": tok}).get_json()["goal"]


# --- Trello helpers (mirror tests/test_trello.py) -----------------------------
def _ws(client, tok, name="Shared WS"):
    return client.post("/api/trello/workspaces", json={"name": name},
                       headers={"X-CSRF-Token": tok}).get_json()["workspace"]


def _board(client, tok, ws_id, title="Shared Board"):
    return client.post("/api/trello/boards",
                       json={"workspace_id": ws_id, "title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["board"]


def _list(client, tok, bid, title="Backlog"):
    return client.post(f"/api/trello/boards/{bid}/lists", json={"title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["list"]


def _card(client, tok, lid, title="card"):
    return client.post("/api/trello/cards", json={"list_id": lid, "title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["card"]


def _add_ws_member(client, tok, ws_id, uid, role="member"):
    return client.post(f"/api/trello/workspaces/{ws_id}/members",
                       json={"user_id": uid, "role": role},
                       headers={"X-CSRF-Token": tok})


# --- KB helpers ---------------------------------------------------------------
def _create_note(client, tok, title="note", content="body"):
    return client.post("/api/kb/notes", json={"title": title, "content": content},
                       headers={"X-CSRF-Token": tok}).get_json()["note"]


def _publish_note(client, tok, nid):
    return client.post(f"/api/kb/notes/{nid}/publish",
                       headers={"X-CSRF-Token": tok})


# ---------------------------------------------------------------------------
# Omnisearch
# ---------------------------------------------------------------------------
class TestOmnisearch:
    def _seed(self, client):
        tok_a, _ = _login_as(client, "agent@opsdesk.local")
        issue = _create_issue(client, tok_a,
                              subject="UNIQUEISSUEZZ searchable jira ticket",
                              desc="issue body text")
        ws = _ws(client, tok_a)
        b = _board(client, tok_a, ws["id"])
        l = _list(client, tok_a, b["id"])
        card = _card(client, tok_a, l["id"],
                     "UNIQUECARDZZ searchable trello card")
        note = _create_note(client, tok_a,
                            title="UNIQUENOTEZZ searchable kb article",
                            content="note body text")
        _publish_note(client, tok_a, note["id"])
        return tok_a, issue, card, note

    def test_scope_all_returns_three_groups(self, client):
        tok_a, issue, card, note = self._seed(client)
        data = client.get("/api/search?q=searchable&scope=all",
                          headers={"X-CSRF-Token": tok_a}).get_json()
        assert any(i["id"] == issue["id"] for i in data["issues"]), \
            "matching issue missing from issues"
        assert any(c["id"] == card["id"] for c in data["cards"]), \
            "matching card missing from cards"
        assert any(n["id"] == note["id"] for n in data["notes"]), \
            "matching note missing from notes"

    def test_scope_filter_limits_groups(self, client):
        tok_a, issue, card, note = self._seed(client)
        data = client.get("/api/search?q=searchable&scope=issues",
                          headers={"X-CSRF-Token": tok_a}).get_json()
        assert data["issues"], "issues group should be populated"
        assert data["cards"] == []
        assert data["notes"] == []

    def test_requester_rbac_excludes_foreign_issue_includes_published_note(
            self, client):
        tok_a, issue, card, note = self._seed(client)
        tok_sam, _ = _login_as(client, "sam@opsdesk.local")
        # Non-owned issue must NOT appear (scoped to requester's own issues).
        idata = client.get("/api/search?q=UNIQUE&scope=issues",
                           headers={"X-CSRF-Token": tok_sam}).get_json()
        assert not any(i["id"] == issue["id"] for i in idata["issues"]), \
            "requester saw a non-owned issue"
        # Published note IS visible to requesters.
        ndata = client.get("/api/search?q=UNIQUE&scope=notes",
                           headers={"X-CSRF-Token": tok_sam}).get_json()
        assert any(n["id"] == note["id"] for n in ndata["notes"]), \
            "requester could not see published note"


# ---------------------------------------------------------------------------
# Cross-entity links
# ---------------------------------------------------------------------------
class TestEntityLinks:
    def _seed_pair(self, client):
        tok_a, _ = _login_as(client, "agent@opsdesk.local")
        issue = _create_issue(client, tok_a, subject="link issue",
                              desc="link body")
        note = _create_note(client, tok_a, title="link note",
                            content="link note body")
        _publish_note(client, tok_a, note["id"])
        lid = client.post("/api/entity-links",
                          json={"source_type": "jira_issue",
                                "source_id": issue["id"],
                                "target_type": "kb_note",
                                "target_id": note["id"]},
                          headers={"X-CSRF-Token": tok_a}).get_json()["link"]["id"]
        return tok_a, issue, note, lid

    def test_create_valid_returns_link(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        link = client.get(
            f"/api/entity-links?source_type=jira_issue&source_id={issue['id']}",
            headers={"X-CSRF-Token": tok_a}).get_json()["links"][0]
        assert link["source_type"] == "jira_issue"
        assert link["source_id"] == issue["id"]
        assert link["target_type"] == "kb_note"
        assert link["target_id"] == note["id"]
        assert "id" in link and "created_at" in link

    def test_duplicate_is_idempotent(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        p = {"source_type": "jira_issue", "source_id": issue["id"],
             "target_type": "kb_note", "target_id": note["id"]}
        r2 = client.post("/api/entity-links", json=p,
                         headers={"X-CSRF-Token": tok_a})
        assert r2.status_code in (200, 201)
        links = client.get(
            f"/api/entity-links?source_type=jira_issue&source_id={issue['id']}",
            headers={"X-CSRF-Token": tok_a}).get_json()["links"]
        assert len(links) == 1

    def test_bad_type_rejected(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        r = client.post("/api/entity-links",
                        json={"source_type": "bogus",
                              "source_id": issue["id"],
                              "target_type": "kb_note",
                              "target_id": note["id"]},
                        headers={"X-CSRF-Token": tok_a})
        assert r.status_code == 400

    def test_self_link_rejected(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        r = client.post("/api/entity-links",
                        json={"source_type": "jira_issue",
                              "source_id": issue["id"],
                              "target_type": "jira_issue",
                              "target_id": issue["id"]},
                        headers={"X-CSRF-Token": tok_a})
        assert r.status_code == 400

    def test_get_lists_links(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        links = client.get(
            f"/api/entity-links?source_type=jira_issue&source_id={issue['id']}",
            headers={"X-CSRF-Token": tok_a}).get_json()["links"]
        assert any(l["target_id"] == note["id"] for l in links), \
            "created link not listed"

    def test_delete_by_creator_ok(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        r = client.delete(f"/api/entity-links/{lid}",
                          headers={"X-CSRF-Token": tok_a})
        assert r.status_code == 200
        assert r.get_json().get("ok") is True

    def test_delete_by_other_nonadmin_rejected(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        tok_m, _ = _login_as(client, "manager@opsdesk.local")
        r = client.delete(f"/api/entity-links/{lid}",
                          headers={"X-CSRF-Token": tok_m})
        assert r.status_code in (403, 404)

    def test_delete_by_admin_allowed(self, client):
        tok_a, issue, note, lid = self._seed_pair(client)
        tok_admin, _ = _login_as(client, "admin@opsdesk.local")
        r = client.delete(f"/api/entity-links/{lid}",
                          headers={"X-CSRF-Token": tok_admin})
        assert r.get_json().get("ok") is True


# ---------------------------------------------------------------------------
# Notification triggers
# ---------------------------------------------------------------------------
class TestNotificationTriggers:
    def test_card_assigned_notifies_member(self, client):
        tok_a, _ = _login_as(client, "agent@opsdesk.local")
        tok_m, mgr_id = _login_as(client, "manager@opsdesk.local")
        tok_a, _ = _login_as(client, "agent@opsdesk.local")  # actor = agent
        ws = _ws(client, tok_a)
        _add_ws_member(client, tok_a, ws["id"], mgr_id)
        b = _board(client, tok_a, ws["id"])
        l = _list(client, tok_a, b["id"])
        card = _card(client, tok_a, l["id"], "assigned card")
        r = client.post(f"/api/trello/cards/{card['id']}/members",
                        json={"user_id": mgr_id},
                        headers={"X-CSRF-Token": tok_a})
        assert r.status_code == 200
        tok_m, _ = _login_as(client, "manager@opsdesk.local")
        notifs = _notifications(client, tok_m)
        assert any(n.get("kind") == "card_assigned" for n in notifs), \
            "manager received no card_assigned notification"

    def test_note_published_notifies_staff(self, client):
        tok_a, _ = _login_as(client, "agent@opsdesk.local")
        note = _create_note(client, tok_a, title="pub note",
                            content="pub body")
        r = _publish_note(client, tok_a, note["id"])
        assert r.status_code == 200
        tok_m, _ = _login_as(client, "manager@opsdesk.local")
        notifs = _notifications(client, tok_m)
        assert any(n.get("kind") == "note_published" for n in notifs), \
            "manager received no note_published notification"

    def test_goal_update_notifies_owner(self, client):
        tok_m, mgr_id = _login_as(client, "manager@opsdesk.local")
        goal = _create_goal(client, tok_m, title="my goal", owner_id=mgr_id)
        r = client.patch(f"/api/jira/goals/{goal['id']}",
                         json={"status": "at_risk"},
                         headers={"X-CSRF-Token": tok_m})
        assert r.status_code == 200
        notifs = _notifications(client, tok_m)
        assert any(n.get("kind") == "goal_update" for n in notifs), \
            "goal owner received no goal_update notification"

    def test_issue_assigned_notifies_requester(self, client):
        # Optional per spec; backend emits kind "assigned" (not "issue_assigned").
        tok_s, sam_id = _login_as(client, "sam@opsdesk.local")
        issue = _create_issue(client, tok_s, subject="assign me issue",
                              desc="assign body")
        tok_a, _ = _login_as(client, "agent@opsdesk.local")
        r = client.post(f"/api/jira/issues/{issue['id']}/assign",
                        json={"assignee_id": sam_id},
                        headers={"X-CSRF-Token": tok_a})
        assert r.status_code == 200
        tok_s, _ = _login_as(client, "sam@opsdesk.local")
        notifs = _notifications(client, tok_s)
        assert any(n.get("kind") == "assigned" for n in notifs), \
            "requester received no 'assigned' notification"
