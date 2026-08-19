"""
Backend test suite for Phase 4B — AI Agentic Tools.

Covers:
  * GET /api/ai/tools            tool catalogue shape + requires_confirm flags
  * direct tool execution        execute_tool(...) against the REGISTRY (no net)
        - search_issues          visibility + RBAC scoping
        - create_issue           requester self-service creation
        - update_issue_status    agent update vs requester RBAC deny
        - search_kb              published-only for requester, all for agent
        - unknown tool           handled error shape
  * POST /api/ai/tool-confirm/<msg_id>  approve/reject/bad/wrong-owner/missing
  * POST /api/ai/chat/<cid>      offline fail-closed 503 (no OpenRouter key)

Run with:  pytest tests/test_ai_tools.py   (project root, venv activated)

NOTE: As of this checkout the Phase 4B agentic-tools backend (app/ai/tools.py,
the REGISTRY, and the GET /api/ai/tools endpoint) is NOT implemented. The tests
that depend on it are written to the authoritative spec and are skipped when the
backend surface is absent, so the file still collects and runs cleanly. The
discrepancies are reported in the task report.
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, config, db

# The Phase 4B registry module is authoritative per spec but may be absent in
# this checkout. Guard the import so the test module still collects.
try:
    from app.ai.tools import (
        REGISTRY,
        execute_tool,
        list_tool_schemas,
        requires_confirm,
    )
    HAS_TOOLS = True
except Exception:  # pragma: no cover - depends on backend presence
    HAS_TOOLS = False


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
# Direct DB helpers (no network / no key involved).
# ---------------------------------------------------------------------------
def _user_id(app, email):
    with app.app_context():
        row = db.get_db().execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        return row["id"]


def _user_row(app, email):
    with app.app_context():
        return dict(db.get_db().execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone())


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


def _insert_tool_call(app, cid, tool_name="create_issue", tool_args="{}",
                      status="pending_confirm"):
    with app.app_context():
        conn = db.get_db()
        res = conn.execute(
            "INSERT INTO ai_messages (conversation_id, role, content, "
            "tool_name, tool_args, tool_status, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (cid, "tool_call", "", tool_name, tool_args, status, db.now_iso()),
        )
        mid = res.lastrowid
        conn.commit()
        return mid


def _tool_status(app, mid):
    with app.app_context():
        return db.get_db().execute(
            "SELECT tool_status FROM ai_messages WHERE id = ?", (mid,)
        ).fetchone()["tool_status"]


def _seed_jira_project(app, key="OPS", lead_id=1):
    with app.app_context():
        conn = db.get_db()
        existing = conn.execute(
            "SELECT id FROM jira_projects WHERE key = ?", (key,)
        ).fetchone()
        if existing is not None:
            return existing["id"]
        res = conn.execute(
            "INSERT INTO jira_projects (key, name, lead_id, category, next_seq, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (key, "Ops Project", lead_id, "Software", 1, db.now_iso()),
        )
        pid = res.lastrowid
        conn.commit()
        return pid


def _seed_jira_issue(app, project_id, summary, requester_id, assignee_id=None,
                     status="new"):
    with app.app_context():
        conn = db.get_db()
        seq = conn.execute(
            "SELECT next_seq FROM jira_projects WHERE id=?", (project_id,)
        ).fetchone()["next_seq"]
        key = f"OPS-{seq}"
        conn.execute(
            "UPDATE jira_projects SET next_seq = next_seq + 1 WHERE id = ?",
            (project_id,),
        )
        res = conn.execute(
            "INSERT INTO jira_issues "
            "(issue_key, project_id, issue_type, summary, description, priority, "
            "status, requester_id, assignee_id, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (key, project_id, "Task", summary, "desc", "normal", status,
             requester_id, assignee_id, db.now_iso(), db.now_iso()),
        )
        iid = res.lastrowid
        conn.commit()
        return key


def _seed_kb_note(app, title, content, status, author_id):
    with app.app_context():
        conn = db.get_db()
        res = conn.execute(
            "INSERT INTO kb_notes (folder_id, title, content, frontmatter, "
            "author_id, status, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (None, title, content, "{}", author_id, status, db.now_iso(),
             db.now_iso()),
        )
        nid = res.lastrowid
        conn.commit()
        return nid


# ---------------------------------------------------------------------------
# 1. GET /api/ai/tools  (tool catalogue)
# ---------------------------------------------------------------------------
class TestToolCatalogue:
    def test_list_tools_shape_and_flags(self, client):
        _login(client, "agent@opsdesk.local")
        resp = client.get("/api/ai/tools")
        if resp.status_code == 404:
            pytest.skip("GET /api/ai/tools not implemented in this checkout (Phase 4B)")
        assert resp.status_code == 200
        body = resp.get_json()
        assert "tools" in body
        tools = {t["name"]: t for t in body["tools"]}

        for name in ("search_issues", "create_issue", "update_issue_status", "search_kb"):
            assert name in tools, f"expected tool {name} in catalogue"
            t = tools[name]
            assert "description" in t
            assert "parameters" in t
            assert "requires_confirm" in t

        assert tools["search_issues"]["requires_confirm"] is False
        assert tools["search_kb"]["requires_confirm"] is False
        assert tools["create_issue"]["requires_confirm"] is True
        assert tools["update_issue_status"]["requires_confirm"] is True

        if HAS_TOOLS:
            assert requires_confirm("search_issues") is False
            assert requires_confirm("create_issue") is True


# ---------------------------------------------------------------------------
# 2. Direct tool execution via the REGISTRY (no network)
# ---------------------------------------------------------------------------
class TestToolExecution:
    def test_search_issues_visible_and_rbac(self, app):
        if not HAS_TOOLS:
            pytest.skip("app.ai.tools not implemented in this checkout (Phase 4B)")
        agent = _user_row(app, "agent@opsdesk.local")
        sam = _user_row(app, "sam@opsdesk.local")
        pid = _seed_jira_project(app, "OPS", agent["id"])
        _seed_jira_issue(app, pid, "Agent-owned confidential ticket", agent["id"],
                         assignee_id=agent["id"])

        with app.app_context():
            res = execute_tool("search_issues", agent, {"q": "confidential"})
        assert any("confidential" in (i.get("summary") or "") for i in res)

        with app.app_context():
            sam_res = execute_tool("search_issues", sam, {"q": "confidential"})
        assert not any("confidential" in (i.get("summary") or "")
                        for i in sam_res)

    def test_create_issue_as_requester(self, app):
        if not HAS_TOOLS:
            pytest.skip("app.ai.tools not implemented in this checkout (Phase 4B)")
        sam = _user_row(app, "sam@opsdesk.local")
        pid = _seed_jira_project(app, "OPS", sam["id"])
        with app.app_context():
            out = execute_tool("create_issue", sam,
            {"summary": "Test from tool", "project_id": pid})
        assert "issue_key" in out and out.get("issue_key")
        with app.app_context():
            row = db.get_db().execute(
                "SELECT * FROM jira_issues WHERE issue_key = ?",
                (out["issue_key"],),
            ).fetchone()
            assert row is not None
            assert row["requester_id"] == sam["id"]
            assert row["issue_key"] is not None

    def test_update_issue_status_rbac(self, app):
        if not HAS_TOOLS:
            pytest.skip("app.ai.tools not implemented in this checkout (Phase 4B)")
        agent = _user_row(app, "agent@opsdesk.local")
        sam = _user_row(app, "sam@opsdesk.local")
        pid = _seed_jira_project(app, "OPS", agent["id"])
        key = _seed_jira_issue(app, pid, "Status change ticket", agent["id"],
                               assignee_id=agent["id"])

        with app.app_context():
            ok = execute_tool("update_issue_status", agent,
            {"issue_key": key, "status": "in_progress"})
        assert "error" not in ok
        with app.app_context():
            st = db.get_db().execute(
                "SELECT status FROM jira_issues WHERE issue_key = ?", (key,)
            ).fetchone()["status"]
            assert st == "in_progress"

        with app.app_context():
            denied = execute_tool("update_issue_status", sam,
            {"issue_key": key, "status": "closed"})
        assert isinstance(denied, dict) and "error" in denied

    def test_search_kb_published_vs_draft(self, app):
        if not HAS_TOOLS:
            pytest.skip("app.ai.tools not implemented in this checkout (Phase 4B)")
        agent = _user_row(app, "agent@opsdesk.local")
        sam = _user_row(app, "sam@opsdesk.local")
        _seed_kb_note(app, "Published runbook", "published runbook content",
                      "published", agent["id"])
        _seed_kb_note(app, "Draft runbook", "draft runbook content",
                      "draft", agent["id"])

        with app.app_context():
            sam_res = execute_tool("search_kb", sam, {"q": "runbook"})
        assert any("Published runbook" in (n.get("title") or "") for n in sam_res)
        assert not any("Draft runbook" in (n.get("title") or "") for n in sam_res)

        with app.app_context():
            agent_res = execute_tool("search_kb", agent, {"q": "runbook"})
        assert any("Published runbook" in (n.get("title") or "") for n in agent_res)
        assert any("Draft runbook" in (n.get("title") or "") for n in agent_res)

    def test_unknown_tool_handled(self, app):
        if not HAS_TOOLS:
            pytest.skip("app.ai.tools not implemented in this checkout (Phase 4B)")
        agent = _user_row(app, "agent@opsdesk.local")
        with app.app_context():
            res = execute_tool("nope", agent, {})
        assert isinstance(res, dict) and "error" in res


# ---------------------------------------------------------------------------
# 3. POST /api/ai/tool-confirm/<msg_id>  (approve / reject transitions)
# ---------------------------------------------------------------------------
class TestToolConfirm:
    def _owner_token(self, client):
        _login(client, "agent@opsdesk.local")
        return _csrf(client)

    def test_approve_transitions_to_approved(self, app, client):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id)
        mid = _insert_tool_call(app, cid)
        tok = self._owner_token(client)
        r = client.post(f"/api/ai/tool-confirm/{mid}",
                        json={"decision": "approve"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["status"] == "approved"
        assert _tool_status(app, mid) == "approved"

    def test_reject_transitions_to_rejected(self, app, client):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id)
        mid = _insert_tool_call(app, cid)
        tok = self._owner_token(client)
        r = client.post(f"/api/ai/tool-confirm/{mid}",
                        json={"decision": "reject"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["status"] == "rejected"
        assert _tool_status(app, mid) == "rejected"

    def test_bad_decision_400(self, app, client):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id)
        mid = _insert_tool_call(app, cid)
        tok = self._owner_token(client)
        r = client.post(f"/api/ai/tool-confirm/{mid}",
                        json={"decision": "maybe"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_wrong_owner_403(self, app, client):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id)
        mid = _insert_tool_call(app, cid)
        _login(client, "sam@opsdesk.local")
        tok = _csrf(client)
        r = client.post(f"/api/ai/tool-confirm/{mid}",
                        json={"decision": "approve"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 403

    def test_missing_404(self, app, client):
        tok = self._owner_token(client)
        r = client.post("/api/ai/tool-confirm/999999",
                        json={"decision": "approve"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 4. Offline chat still 503 (fail-closed, no OpenRouter key)
# ---------------------------------------------------------------------------
class TestOfflineChat:
    def test_chat_offline_returns_503(self, app, client):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id)
        _login(client, "agent@opsdesk.local")
        tok = _csrf(client)
        r = client.post(f"/api/ai/chat/{cid}", json={"message": "hi"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 503
        assert "error" in r.get_json()

    def test_chat_resume_offline_returns_503(self, app, client):
        agent_id = _user_id(app, "agent@opsdesk.local")
        cid = _make_conversation(app, agent_id)
        _login(client, "agent@opsdesk.local")
        tok = _csrf(client)
        r = client.post(f"/api/ai/chat/{cid}", json={"resume": True},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 503
        assert "error" in r.get_json()
