"""
Backend test suite for Phase 4A — AI Chat Core.

Covers:
  * conversations: list (own only + pagination), create, delete (owner-only),
    messages list (owner-only)
  * chat: empty-message 400, missing 404, not-owner 403, offline fail-closed 503
  * tool-confirm: approve/reject update tool_status, bad decision 400,
    missing 404, not-owner 403
  * models: non-empty fallback list (no key)
  * usage: aggregation scoped to the current user only

Run with:  pytest tests/test_ai.py   (project root, venv activated)
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


def _auth(client, email="agent@opsdesk.local"):
    """Login as the given user and return the CSRF token for mutations."""
    _login(client, email)
    return _csrf(client)


# ---------------------------------------------------------------------------
# Direct DB helpers (no network / no key involved).
# ---------------------------------------------------------------------------
def _user_id(app, email):
    with app.app_context():
        row = db.get_db().execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        return row["id"]


def _make_conversation(app, user_id, title="New Chat"):
    with app.app_context():
        conn = db.get_db()
        now = db.now_iso()
        res = conn.execute(
            "INSERT INTO ai_conversations (user_id, title, created_at, updated_at) "
            "VALUES (?,?,?,?)",
            (user_id, title, now, now),
        )
        cid = res.lastrowid
        conn.commit()
        return cid


def _make_message(app, conv_id, role, content,
                 tokens_prompt=0, tokens_completion=0, cost_usd=0.0,
                 tool_status=None, tool_name=None, tool_args=None):
    with app.app_context():
        conn = db.get_db()
        res = conn.execute(
            "INSERT INTO ai_messages "
            "(conversation_id, role, content, tool_name, tool_args, tool_status, "
            "tokens_prompt, tokens_completion, cost_usd, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (conv_id, role, content, tool_name, tool_args, tool_status,
             tokens_prompt, tokens_completion, cost_usd, db.now_iso()),
        )
        mid = res.lastrowid
        conn.commit()
        return mid


def _mut(client, method, url, tok, json=None):
    headers = {"X-CSRF-Token": tok}
    if json is not None:
        return client.open(url, method=method, json=json, headers=headers)
    return client.open(url, method=method, headers=headers)


# ---------------------------------------------------------------------------
# Conversations: list / create / delete
# ---------------------------------------------------------------------------
class TestConversations:
    def test_requires_login(self, client):
        assert client.get("/api/ai/conversations").status_code == 401

    def test_list_empty(self, client):
        tok = _auth(client)
        body = client.get("/api/ai/conversations",
                          headers={"X-CSRF-Token": tok}).get_json()
        assert body["conversations"] == []
        assert body["total"] == 0
        assert body["page"] == 1
        assert body["per_page"] == 25

    def test_list_only_own(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        sam_id = _user_id(app, "sam@opsdesk.local")
        _make_conversation(app, agent_id, "Agent Chat")
        _make_conversation(app, sam_id, "Sam Chat")

        tok = _auth(client, "agent@opsdesk.local")
        body = client.get("/api/ai/conversations",
                          headers={"X-CSRF-Token": tok}).get_json()
        assert body["total"] == 1
        assert [c["title"] for c in body["conversations"]] == ["Agent Chat"]

    def test_pagination(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        for i in range(3):
            _make_conversation(app, agent_id, f"Chat {i}")

        tok = _auth(client, "agent@opsdesk.local")
        page1 = client.get("/api/ai/conversations?page=1&per_page=2",
                           headers={"X-CSRF-Token": tok}).get_json()
        assert page1["total"] == 3
        assert page1["per_page"] == 2
        assert len(page1["conversations"]) == 2

        page2 = client.get("/api/ai/conversations?page=2&per_page=2",
                           headers={"X-CSRF-Token": tok}).get_json()
        assert len(page2["conversations"]) == 1

    def test_per_page_capped(self, client):
        tok = _auth(client)
        body = client.get("/api/ai/conversations?per_page=9999",
                          headers={"X-CSRF-Token": tok}).get_json()
        assert body["per_page"] == 100

    def test_create_default_title(self, client):
        tok = _auth(client)
        r = _mut(client, "POST", "/api/ai/conversations", tok, json={})
        assert r.status_code == 201
        conv = r.get_json()["conversation"]
        assert conv["title"] == "New Chat"
        assert "id" in conv and "created_at" in conv and "updated_at" in conv

    def test_create_custom_title(self, client):
        tok = _auth(client)
        r = _mut(client, "POST", "/api/ai/conversations", tok,
                 json={"title": "My Chat"})
        assert r.status_code == 201
        assert r.get_json()["conversation"]["title"] == "My Chat"

    def test_create_requires_csrf(self, client):
        _login(client, "agent@opsdesk.local")
        r = client.post("/api/ai/conversations", json={})
        assert r.status_code == 403

    def test_delete(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "To Delete")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "DELETE", f"/api/ai/conversations/{cid}", tok)
        assert r.status_code == 200
        assert r.get_json()["ok"] is True
        body = client.get("/api/ai/conversations",
                          headers={"X-CSRF-Token": tok}).get_json()
        assert body["total"] == 0

    def test_delete_404(self, client):
        tok = _auth(client)
        r = _mut(client, "DELETE", "/api/ai/conversations/99999", tok)
        assert r.status_code == 404

    def test_delete_not_owner(self, client, app):
        sam_id = _user_id(app, "sam@opsdesk.local")
        cid = _make_conversation(app, sam_id, "Sam's Chat")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "DELETE", f"/api/ai/conversations/{cid}", tok)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------
class TestMessages:
    def test_messages_shape(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "Chat")
        _make_message(app, cid, "user", "hi", tool_status="approved")
        tok = _auth(client, "agent@opsdesk.local")
        body = client.get(f"/api/ai/conversations/{cid}/messages",
                          headers={"X-CSRF-Token": tok}).get_json()
        msgs = body["messages"]
        assert len(msgs) == 1
        m = msgs[0]
        for key in ("role", "content", "tool_status",
                    "tokens_prompt", "tokens_completion", "cost_usd",
                    "created_at"):
            assert key in m
        assert m["role"] == "user"
        assert m["content"] == "hi"
        assert m["tool_status"] == "approved"

    def test_messages_404(self, client):
        tok = _auth(client)
        r = client.get("/api/ai/conversations/99999/messages",
                       headers={"X-CSRF-Token": tok})
        assert r.status_code == 404

    def test_messages_not_owner(self, client, app):
        sam_id = _user_id(app, "sam@opsdesk.local")
        cid = _make_conversation(app, sam_id, "Sam's Chat")
        tok = _auth(client, "agent@opsdesk.local")
        r = client.get(f"/api/ai/conversations/{cid}/messages",
                       headers={"X-CSRF-Token": tok})
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Chat (fail-closed offline — no key/network)
# ---------------------------------------------------------------------------
class TestChat:
    def test_empty_message_400(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "Chat")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/chat/{cid}", tok, json={"message": ""})
        assert r.status_code == 400
        r2 = _mut(client, "POST", f"/api/ai/chat/{cid}", tok, json={})
        assert r2.status_code == 400

    def test_missing_conversation_404(self, client):
        tok = _auth(client)
        r = _mut(client, "POST", "/api/ai/chat/99999", tok,
                 json={"message": "hi"})
        assert r.status_code == 404

    def test_not_owner_403(self, client, app):
        sam_id = _user_id(app, "sam@opsdesk.local")
        cid = _make_conversation(app, sam_id, "Sam's Chat")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/chat/{cid}", tok,
                 json={"message": "hi"})
        assert r.status_code == 403

    def test_offline_503(self, client, app):
        # No OPERADESK_OPENROUTER_KEY set, and the user has no ai_key -> 503
        # fail-closed. (NOTE: the 503 is returned before the rate-limit counter
        # runs, so the 429 path cannot be exercised in the offline test env;
        # per the spec we assert the offline contract and do NOT assert 429.)
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "Chat")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/chat/{cid}", tok,
                 json={"message": "hello"})
        assert r.status_code == 503
        assert "error" in r.get_json()


# ---------------------------------------------------------------------------
# Tool confirm
# ---------------------------------------------------------------------------
class TestToolConfirm:
    def test_approve(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "Chat")
        mid = _make_message(app, cid, "tool_call", "do thing",
                             tool_status="pending_confirm")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/tool-confirm/{mid}", tok,
                 json={"decision": "approve"})
        assert r.status_code == 200
        body = r.get_json()
        assert body["ok"] is True
        assert body["status"] == "approved"

        msgs = client.get(f"/api/ai/conversations/{cid}/messages",
                          headers={"X-CSRF-Token": tok}).get_json()["messages"]
        assert msgs[0]["tool_status"] == "approved"

    def test_reject(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "Chat")
        mid = _make_message(app, cid, "tool_call", "do thing",
                             tool_status="pending_confirm")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/tool-confirm/{mid}", tok,
                 json={"decision": "reject"})
        assert r.status_code == 200
        assert r.get_json()["status"] == "rejected"

    def test_bad_decision_400(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id, "Chat")
        mid = _make_message(app, cid, "tool_call", "do thing")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/tool-confirm/{mid}", tok,
                 json={"decision": "maybe"})
        assert r.status_code == 400

    def test_missing_404(self, client):
        tok = _auth(client)
        r = _mut(client, "POST", "/api/ai/tool-confirm/99999", tok,
                 json={"decision": "approve"})
        assert r.status_code == 404

    def test_not_owner_403(self, client, app):
        sam_id = _user_id(app, "sam@opsdesk.local")
        cid = _make_conversation(app, sam_id, "Sam's Chat")
        mid = _make_message(app, cid, "tool_call", "do thing")
        tok = _auth(client, "agent@opsdesk.local")
        r = _mut(client, "POST", f"/api/ai/tool-confirm/{mid}", tok,
                 json={"decision": "approve"})
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Models + Usage
# ---------------------------------------------------------------------------
class TestModelsAndUsage:
    def test_models_nonempty(self, client):
        tok = _auth(client)
        body = client.get("/api/ai/models",
                          headers={"X-CSRF-Token": tok}).get_json()
        assert isinstance(body["models"], list)
        assert len(body["models"]) > 0
        assert all("id" in m and "label" in m for m in body["models"])

    def test_usage_aggregation_scoped(self, client, app):
        agent_id = _user_id(app, "agent@opsdesk.local")
        sam_id = _user_id(app, "sam@opsdesk.local")

        # Agent's conversations + messages (known totals).
        c1 = _make_conversation(app, agent_id, "A1")
        _make_message(app, c1, "user", "x",
                      tokens_prompt=10, tokens_completion=20, cost_usd=0.30)
        _make_message(app, c1, "assistant", "y",
                      tokens_prompt=5, tokens_completion=15, cost_usd=0.20)
        c2 = _make_conversation(app, agent_id, "A2")
        _make_message(app, c2, "user", "z",
                      tokens_prompt=100, tokens_completion=200, cost_usd=1.00)

        # Another user's data must be EXCLUDED from the agent's totals.
        s1 = _make_conversation(app, sam_id, "S1")
        _make_message(app, s1, "user", "noise",
                      tokens_prompt=999, tokens_completion=999, cost_usd=9.99)

        tok = _auth(client, "agent@opsdesk.local")
        usage = client.get("/api/ai/usage",
                           headers={"X-CSRF-Token": tok}).get_json()

        assert usage["tokens_prompt"] == 115      # 10 + 5 + 100
        assert usage["tokens_completion"] == 235  # 20 + 15 + 200
        assert usage["cost_usd"] == pytest.approx(1.50)  # 0.30 + 0.20 + 1.00
        assert usage["messages"] == 3
        assert usage["conversations"] == 2
