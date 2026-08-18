"""
Backend test suite for Phase 1A — Jira Core.

Covers:
  * projects: list (RBAC scoping), create (admin-only, key validation),
    detail + stats, patch (admin/lead only)
  * issue key generation: per-project sequences (OPS-0001, ENG-0001)
  * sprints: create (manager/admin), start (single-active rule), complete
    (velocity = story points of resolved/closed issues, incomplete issues
    return to the backlog), stats
  * issue PATCH: sprint_id / story_points / due_date / issue_type validation
  * list filters: project_id, sprint_id (none|<id>)
  * get_issue by id_or_key
  * configurable workflow transitions (jira_workflow_transitions overrides,
    role-gated), default scheme untouched

Run with:  pytest tests/test_jira.py   (project root, venv activated)
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, config
from app import lifecycle


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


def _create_issue(client, tok, subject="Phase 1A issue", desc="desc",
                  extra=None):
    payload = {"subject": subject, "description": desc}
    if extra:
        payload.update(extra)
    return client.post("/api/jira/issues", json=payload,
                       headers={"X-CSRF-Token": tok})


def _create_project(client, tok, key="ENG", name="Engineering"):
    return client.post("/api/jira/projects",
                       json={"key": key, "name": name, "category": "Software"},
                       headers={"X-CSRF-Token": tok})


def _create_sprint(client, tok, project_id=1, name="Sprint 1", **extra):
    payload = {"project_id": project_id, "name": name}
    payload.update(extra)
    return client.post("/api/jira/sprints", json=payload,
                       headers={"X-CSRF-Token": tok})


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
class TestProjects:
    def test_fresh_db_has_ops_project(self, client):
        _token(client)
        data = client.get("/api/jira/projects").get_json()
        assert [p["key"] for p in data["projects"]] == ["OPS"]

    def test_requester_sees_only_their_projects(self, client):
        tok = _token(client)
        _create_project(client, tok)            # ENG (no issues)
        _create_issue(client, tok)              # OPS issue by admin
        # sam creates an issue (lands in OPS), then sees OPS but not ENG
        tok_sam = _token(client, "sam@opsdesk.local")
        c = _csrf(client)
        client.post("/api/jira/issues", json={"subject": "sam issue"},
                    headers={"X-CSRF-Token": c})
        data = client.get("/api/jira/projects").get_json()
        keys = [p["key"] for p in data["projects"]]
        assert "OPS" in keys and "ENG" not in keys
        data = client.get("/api/jira/projects").get_json()
        assert "ENG" not in [p["key"] for p in data["projects"]]

    def test_agent_sees_all_projects(self, client):
        tok = _token(client)
        _create_project(client, tok)
        tok_agent = _token(client, "agent@opsdesk.local")
        data = client.get("/api/jira/projects").get_json()
        assert len(data["projects"]) == 2

    def test_create_project_admin_only(self, client):
        for email in ("agent@opsdesk.local", "manager@opsdesk.local",
                      "sam@opsdesk.local"):
            tok = _token(client, email)
            r = _create_project(client, tok)
            assert r.status_code == 403, email
        r = _create_project(client, _token(client))
        assert r.status_code == 201
        assert r.get_json()["project"]["key"] == "ENG"

    def test_create_project_key_validation(self, client):
        tok = _token(client)
        for bad in ("1BAD", "A", "TOO-LONG-KEY-123", "with space"):
            r = _create_project(client, tok, key=bad)
            assert r.status_code == 400, bad
        # lowercase keys are normalized to uppercase
        r = _create_project(client, tok, key="eng", name="Lower")
        assert r.status_code == 201
        assert r.get_json()["project"]["key"] == "ENG"
        # so a second create with the normalized key collides
        r = _create_project(client, tok, key="ENG", name="Collision")
        assert r.status_code == 409

    def test_create_project_duplicate_key_409(self, client):
        tok = _token(client)
        assert _create_project(client, tok).status_code == 201
        r = _create_project(client, tok, key="ENG", name="Again")
        assert r.status_code == 409

    def test_create_project_unknown_lead(self, client):
        tok = _token(client)
        r = client.post("/api/jira/projects",
                        json={"key": "ENG", "name": "Engineering",
                              "lead_id": 99999},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_project_detail_and_stats(self, client):
        tok = _token(client)
        _create_project(client, tok)  # ENG
        i1 = _create_issue(client, tok, extra={"project_id": 2}).get_json()["issue"]
        _create_issue(client, tok, extra={"project_id": 2}).get_json()["issue"]
        client.post(f"/api/jira/issues/{i1['id']}/assign",
                    json={"self": True},
                    headers={"X-CSRF-Token": tok})
        client.post(f"/api/jira/issues/{i1['id']}/status",
                    json={"status": "in_progress"},
                    headers={"X-CSRF-Token": tok})
        r = client.post(f"/api/jira/issues/{i1['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        data = client.get("/api/jira/projects/2").get_json()["project"]
        assert data["stats"]["total_issues"] == 2
        assert data["stats"]["open_issues"] == 1
        assert data["stats"]["backlog_issues"] == 1

    def test_project_detail_requester_forbidden(self, client):
        tok = _token(client)
        _create_project(client, tok)
        tok_sam = _token(client, "sam@opsdesk.local")
        assert client.get("/api/jira/projects/2").status_code == 403
        assert client.get("/api/jira/projects/999").status_code == 404

    def test_update_project_admin_and_lead(self, client):
        tok = _token(client)
        r = _create_project(client, tok)
        pid = r.get_json()["project"]["id"]
        assert client.patch(f"/api/jira/projects/{pid}",
                            json={"name": "Engineering Hub"},
                            headers={"X-CSRF-Token": tok}).status_code == 200
        data = client.get(f"/api/jira/projects/{pid}").get_json()["project"]
        assert data["name"] == "Engineering Hub"
        # project lead may update, other agents may not
        lead_id = data["lead_id"]
        tok_agent = _token(client, "agent@opsdesk.local")
        assert client.patch(f"/api/jira/projects/{pid}",
                            json={"name": "Nope"},
                            headers={"X-CSRF-Token": tok_agent}).status_code == 403
        if lead_id:
            lead_email = client.get("/api/meta").get_json()["users"]
            lead = next(u for u in lead_email if u["id"] == lead_id)
            tok_lead = _token(client, lead["email"])
            assert client.patch(f"/api/jira/projects/{pid}",
                                json={"name": "By Lead"},
                                headers={"X-CSRF-Token": tok_lead}).status_code == 200

    def test_update_project_validation(self, client):
        tok = _token(client)
        pid = _create_project(client, tok).get_json()["project"]["id"]
        assert client.patch(f"/api/jira/projects/{pid}",
                            json={"name": ""},
                            headers={"X-CSRF-Token": tok}).status_code == 400
        assert client.patch(f"/api/jira/projects/{pid}",
                            json={"lead_id": 99999},
                            headers={"X-CSRF-Token": tok}).status_code == 400

    def test_project_active_sprint(self, client):
        tok = _token(client)
        _create_sprint(client, tok)
        client.post("/api/jira/sprints/1/start", headers={"X-CSRF-Token": tok})
        data = client.get("/api/jira/projects/1").get_json()["project"]
        assert data["active_sprint"]["id"] == 1
        assert data["active_sprint"]["name"] == "Sprint 1"


# ---------------------------------------------------------------------------
# Issue key generation (project-scoped)
# ---------------------------------------------------------------------------
class TestKeyGeneration:
    def test_ops_keys_are_sequential(self, client):
        tok = _token(client)
        keys = [_create_issue(client, tok).get_json()["issue"]["issue_key"]
                for _ in range(3)]
        assert keys == ["OPS-0001", "OPS-0002", "OPS-0003"]

    def test_per_project_sequences(self, client):
        tok = _token(client)
        pid = _create_project(client, tok).get_json()["project"]["id"]
        k1 = _create_issue(client, tok,
                           extra={"project_id": pid}).get_json()["issue"]["issue_key"]
        k2 = _create_issue(client, tok).get_json()["issue"]["issue_key"]
        k3 = _create_issue(client, tok,
                           extra={"project_id": pid}).get_json()["issue"]["issue_key"]
        assert k1 == "ENG-0001" and k2 == "OPS-0001" and k3 == "ENG-0002"

    def test_requester_cannot_target_other_project(self, client):
        tok = _token(client)
        pid = _create_project(client, tok).get_json()["project"]["id"]
        tok_sam = _token(client, "sam@opsdesk.local")
        i = _create_issue(client, tok_sam,
                          extra={"project_id": pid}).get_json()["issue"]
        assert i["issue_key"].startswith("OPS-")
        assert i["project_id"] == 1

    def test_unknown_project_rejected(self, client):
        tok = _token(client)
        r = _create_issue(client, tok, extra={"project_id": 99999})
        assert r.status_code == 400
        assert "project" in r.get_json()["error"].lower()

    def test_get_issue_by_key_and_id(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        by_key = client.get(f"/api/jira/issues/{i['issue_key']}").get_json()
        by_id = client.get(f"/api/jira/issues/{i['id']}").get_json()
        assert by_key["issue"]["id"] == i["id"]
        assert by_id["issue"]["issue_key"] == i["issue_key"]
        assert client.get("/api/jira/issues/NO-SUCH").status_code == 404


# ---------------------------------------------------------------------------
# Sprints
# ---------------------------------------------------------------------------
class TestSprints:
    def test_create_sprint_manager_admin(self, client):
        tok = _token(client)  # admin
        r = _create_sprint(client, tok)
        assert r.status_code == 201
        assert r.get_json()["sprint"]["status"] == "future"
        tok_mgr = _token(client, "manager@opsdesk.local")
        assert _create_sprint(client, tok_mgr, name="Mgr sprint").status_code == 201

    def test_create_sprint_forbidden_for_others(self, client):
        for email in ("agent@opsdesk.local", "sam@opsdesk.local"):
            tok = _token(client, email)
            assert _create_sprint(client, tok).status_code == 403, email

    def test_create_sprint_validation(self, client):
        tok = _token(client)
        assert _create_sprint(client, tok, name="").status_code == 400
        assert _create_sprint(client, tok, name="x" * 121).status_code == 400
        assert _create_sprint(client, tok, project_id=999).status_code == 400
        assert client.get("/api/jira/sprints").status_code == 400
        assert client.get("/api/jira/sprints?project_id=999").status_code == 404

    def test_list_sprints_with_stats(self, client):
        tok = _token(client)
        s = _create_sprint(client, tok).get_json()["sprint"]
        i = _create_issue(client, tok).get_json()["issue"]
        client.patch(f"/api/jira/issues/{i['id']}",
                     json={"sprint_id": s["id"], "story_points": 3},
                     headers={"X-CSRF-Token": tok})
        data = client.get("/api/jira/sprints?project_id=1").get_json()
        assert len(data["sprints"]) == 1
        row = data["sprints"][0]
        assert row["stats"]["issue_count"] == 1
        assert row["stats"]["points"] == 3
        assert row["stats"]["completed_issues"] == 0
        # issue serializer carries sprint info
        detail = client.get(f"/api/jira/issues/{i['id']}").get_json()["issue"]
        assert detail["sprint_id"] == s["id"]
        assert detail["sprint_name"] == "Sprint 1"
        assert detail["sprint_status"] == "future"

    def test_start_sprint(self, client):
        tok = _token(client)
        _create_sprint(client, tok)
        r = client.post("/api/jira/sprints/1/start",
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["sprint"]["status"] == "active"
        assert r.get_json()["sprint"]["start_date"]
        # starting again is rejected
        r = client.post("/api/jira/sprints/1/start",
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_only_one_active_sprint_per_project(self, client):
        tok = _token(client)
        _create_sprint(client, tok, name="Sprint A")
        _create_sprint(client, tok, name="Sprint B")
        client.post("/api/jira/sprints/1/start", headers={"X-CSRF-Token": tok})
        r = client.post("/api/jira/sprints/2/start",
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 409
        assert "active" in r.get_json()["error"]
        # completing A frees the slot
        client.post("/api/jira/sprints/1/complete",
                    headers={"X-CSRF-Token": tok})
        assert client.post("/api/jira/sprints/2/start",
                           headers={"X-CSRF-Token": tok}).status_code == 200

    def test_start_sprint_forbidden_and_404(self, client):
        tok = _token(client)
        _create_sprint(client, tok)
        # unknown sprint is 404 (before the role check kicks in)
        assert client.post("/api/jira/sprints/999/start",
                           headers={"X-CSRF-Token": tok}).status_code == 404
        tok_agent = _token(client, "agent@opsdesk.local")
        assert client.post("/api/jira/sprints/1/start",
                           headers={"X-CSRF-Token": tok_agent}).status_code == 403

    def test_complete_sprint_velocity(self, client):
        tok = _token(client)
        s = _create_sprint(client, tok).get_json()["sprint"]
        client.post(f"/api/jira/sprints/{s['id']}/start",
                    headers={"X-CSRF-Token": tok})
        done = _create_issue(client, tok).get_json()["issue"]
        wip = _create_issue(client, tok).get_json()["issue"]
        for iid, pts in ((done["id"], 5), (wip["id"], 2)):
            r = client.patch(f"/api/jira/issues/{iid}",
                             json={"sprint_id": s["id"], "story_points": pts},
                             headers={"X-CSRF-Token": tok})
            assert r.status_code == 200
        client.post(f"/api/jira/issues/{done['id']}/assign",
                    json={"self": True},
                    headers={"X-CSRF-Token": tok})
        client.post(f"/api/jira/issues/{done['id']}/status",
                    json={"status": "in_progress"},
                    headers={"X-CSRF-Token": tok})
        r = client.post(f"/api/jira/issues/{done['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        r = client.post(f"/api/jira/sprints/{s['id']}/complete",
                        headers={"X-CSRF-Token": tok})
        body = r.get_json()
        assert r.status_code == 200
        assert body["sprint"]["status"] == "closed"
        assert body["sprint"]["velocity"] == 5          # only resolved points
        assert body["completed_issues"] == 1
        assert body["issues_moved_back"] == 1
        # wip issue returned to the backlog
        w = client.get(f"/api/jira/issues/{wip['id']}").get_json()["issue"]
        assert w["sprint_id"] is None
        # done issue keeps its sprint
        d = client.get(f"/api/jira/issues/{done['id']}").get_json()["issue"]
        assert d["sprint_id"] == s["id"]

    def test_complete_sprint_zero_velocity(self, client):
        tok = _token(client)
        s = _create_sprint(client, tok).get_json()["sprint"]
        client.post(f"/api/jira/sprints/{s['id']}/start",
                    headers={"X-CSRF-Token": tok})
        r = client.post(f"/api/jira/sprints/{s['id']}/complete",
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["sprint"]["velocity"] == 0
        assert r.get_json()["issues_moved_back"] == 0

    def test_complete_sprint_already_closed(self, client):
        tok = _token(client)
        s = _create_sprint(client, tok).get_json()["sprint"]
        client.post(f"/api/jira/sprints/{s['id']}/start",
                    headers={"X-CSRF-Token": tok})
        client.post(f"/api/jira/sprints/{s['id']}/complete",
                    headers={"X-CSRF-Token": tok})
        r = client.post(f"/api/jira/sprints/{s['id']}/complete",
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_complete_sprint_forbidden(self, client):
        tok = _token(client)
        _create_sprint(client, tok)
        tok_sam = _token(client, "sam@opsdesk.local")
        assert client.post("/api/jira/sprints/1/complete",
                           headers={"X-CSRF-Token": tok_sam}).status_code == 403

    def test_sprint_actions_are_audited(self, client):
        tok = _token(client)
        _create_sprint(client, tok)
        client.post("/api/jira/sprints/1/start", headers={"X-CSRF-Token": tok})
        client.post("/api/jira/sprints/1/complete", headers={"X-CSRF-Token": tok})
        _create_project(client, tok)
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        actions = [r[0] for r in conn.execute(
            "SELECT action FROM audit_log ORDER BY id").fetchall()]
        conn.close()
        for expected in ("sprint.create", "sprint.start", "sprint.complete",
                         "project.create"):
            assert expected in actions


# ---------------------------------------------------------------------------
# Issue PATCH extensions (sprint planning fields)
# ---------------------------------------------------------------------------
class TestIssuePlanningFields:
    def _make(self, client):
        tok = _token(client)
        s = _create_sprint(client, tok).get_json()["sprint"]
        i = _create_issue(client, tok).get_json()["issue"]
        return tok, s, i

    def test_patch_planning_fields(self, client):
        tok, s, i = self._make(client)
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"sprint_id": s["id"], "story_points": 8,
                               "due_date": "2026-09-01",
                               "issue_type": "Story"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        out = r.get_json()["issue"]
        assert out["sprint_id"] == s["id"]
        assert out["story_points"] == 8
        assert out["due_date"] == "2026-09-01"
        assert out["issue_type"] == "Story"

    def test_patch_story_points_validation(self, client):
        tok, s, i = self._make(client)
        for bad in ("abc", -1, 1000, 1.5):
            r = client.patch(f"/api/jira/issues/{i['id']}",
                             json={"story_points": bad},
                             headers={"X-CSRF-Token": tok})
            assert r.status_code == 400, bad

    def test_patch_due_date_validation(self, client):
        tok, s, i = self._make(client)
        for bad in ("tomorrow", "2026-13-01", "2026-01-32"):
            r = client.patch(f"/api/jira/issues/{i['id']}",
                             json={"due_date": bad},
                             headers={"X-CSRF-Token": tok})
            assert r.status_code == 400, bad

    def test_patch_unknown_sprint(self, client):
        tok, s, i = self._make(client)
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"sprint_id": 99999},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_patch_issue_type_validation(self, client):
        tok, s, i = self._make(client)
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"issue_type": "Chore"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_requester_cannot_set_planning_fields(self, client):
        tok = _token(client)
        s = _create_sprint(client, tok).get_json()["sprint"]
        tok_sam = _token(client, "sam@opsdesk.local")
        i = _create_issue(client, tok_sam).get_json()["issue"]
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"sprint_id": s["id"], "story_points": 5,
                               "summary": "renamed by sam"},
                         headers={"X-CSRF-Token": tok_sam})
        assert r.status_code == 200
        out = r.get_json()["issue"]
        assert out["summary"] == "renamed by sam"
        assert out["sprint_id"] is None
        assert out["story_points"] is None

    def test_list_filters_project_and_sprint(self, client):
        tok = _token(client)
        pid = _create_project(client, tok).get_json()["project"]["id"]
        s = _create_sprint(client, tok, project_id=pid).get_json()["sprint"]
        _create_issue(client, tok, extra={"project_id": pid})
        spr = _create_issue(client, tok,
                            extra={"project_id": pid}).get_json()["issue"]
        client.patch(f"/api/jira/issues/{spr['id']}",
                     json={"sprint_id": s["id"]},
                     headers={"X-CSRF-Token": tok})
        assert len(client.get(f"/api/jira/issues?project_id={pid}").get_json()["issues"]) == 2
        assert len(client.get(f"/api/jira/issues?project_id={pid}&sprint_id=none").get_json()["issues"]) == 1
        listed = client.get(f"/api/jira/issues?project_id={pid}&sprint_id={s['id']}").get_json()["issues"]
        assert [x["id"] for x in listed] == [spr["id"]]


# ---------------------------------------------------------------------------
# Configurable workflow transitions
# ---------------------------------------------------------------------------
class TestWorkflowTransitions:
    def test_default_scheme_intact(self, client):
        _token(client)
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        rows = conn.execute(
            "SELECT from_status, to_status FROM jira_workflow_transitions "
            "WHERE project_id IS NULL").fetchall()
        conn.close()
        assert len(rows) == sum(len(d) for d in lifecycle.ALLOWED.values())
        assert ("new", "assigned") in rows
        assert ("blocked", "in_progress") in rows

    def test_project_override_enables_transition(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        conn.execute(
            "INSERT INTO jira_workflow_transitions "
            "(project_id, from_status, to_status, allowed_roles, reason_required) "
            "VALUES (1, 'new', 'resolved', ?, 0)",
            ('["agent","manager","admin"]',))
        conn.commit()
        conn.close()
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        # a second project without the override still rejects new->resolved
        _create_project(client, tok)
        i2 = _create_issue(client, tok,
                           extra={"project_id": 2}).get_json()["issue"]
        r = client.post(f"/api/jira/issues/{i2['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_override_removes_transition(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        client.post(f"/api/jira/issues/{i['id']}/assign",
                    json={"self": True},
                    headers={"X-CSRF-Token": tok})
        client.post(f"/api/jira/issues/{i['id']}/status",
                    json={"status": "in_progress"},
                    headers={"X-CSRF-Token": tok})
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        conn.execute(
            "INSERT INTO jira_workflow_transitions "
            "(project_id, from_status, to_status, allowed_roles, reason_required) "
            "VALUES (1, 'in_progress', 'resolved', '[\"admin\"]', 0)")
        conn.commit()
        conn.close()
        # manager can no longer resolve
        tok_mgr = _token(client, "manager@opsdesk.local")
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok_mgr})
        assert r.status_code == 400
        # admin still can
        tok = _token(client)  # re-login as admin (session was replaced above)
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200

    def test_override_requires_reason(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        conn.execute(
            "INSERT INTO jira_workflow_transitions "
            "(project_id, from_status, to_status, allowed_roles, reason_required) "
            "VALUES (1, 'new', 'blocked', ?, 1)",
            ('["agent","manager","admin"]',))
        conn.commit()
        conn.close()
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "blocked"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "blocked", "note": "waiting on vendor"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["issue"]["status"] == "blocked"

    def test_next_statuses_reflects_role(self, client):
        _token(client)
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute(
            "INSERT INTO jira_workflow_transitions "
            "(project_id, from_status, to_status, allowed_roles, reason_required) "
            "VALUES (1, 'assigned', 'resolved', '[\"admin\"]', 0)")
        conn.commit()
        statuses = lifecycle.next_statuses("assigned", conn, 1, "agent")
        assert "resolved" not in statuses
        statuses = lifecycle.next_statuses("assigned", conn, 1, "admin")
        assert "resolved" in statuses
        # different project: default scheme, no override
        statuses = lifecycle.next_statuses("assigned", conn, 2, "agent")
        assert "resolved" not in statuses
        assert "in_progress" in statuses
        conn.close()
        # no conn: pure default scheme
        assert "resolved" not in lifecycle.next_statuses("assigned")
        assert "in_progress" in lifecycle.next_statuses("assigned")

    def test_can_transition_legacy_signature(self, client):
        _token(client)
        assert lifecycle.can_transition("new", "assigned") == (True, False)
        assert lifecycle.can_transition("new", "resolved") == (False, False)
        assert lifecycle.can_transition("in_progress", "blocked") == (True, True)

    def test_bulk_action_respects_workflow(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        conn.execute(
            "INSERT INTO jira_workflow_transitions "
            "(project_id, from_status, to_status, allowed_roles, reason_required) "
            "VALUES (1, 'new', 'resolved', '[\"agent\"]', 0)")
        conn.commit()
        conn.close()
        r = client.post("/api/jira/issues/bulk",
                        json={"action": "status", "status": "resolved",
                              "issue_ids": [i["id"]]},
                        headers={"X-CSRF-Token": tok})
        body = r.get_json()
        assert body["processed"] == 0
        assert len(body["skipped"]) == 1
        assert body["skipped"][0]["id"] == i["id"]


# ---------------------------------------------------------------------------
# Cross-cutting
# ---------------------------------------------------------------------------
class TestCrossCutting:
    def test_issue_serialization_has_planning_fields(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"story_points": 13,
                               "due_date": "2026-12-31"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        i = r.get_json()["issue"]
        assert i["story_points"] == 13
        assert i["due_date"] == "2026-12-31"
        assert i["sprint_id"] is None
        assert i["project_id"] == 1

    def test_issue_type_defaults_and_set(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        assert i["issue_type"] == "Task"

    def test_key_gen_padded_and_unique(self, client):
        tok = _token(client)
        keys = []
        for _ in range(5):
            k = _create_issue(client, tok).get_json()["issue"]["issue_key"]
            keys.append(k)
        assert keys == ["OPS-0001", "OPS-0002", "OPS-0003",
                        "OPS-0004", "OPS-0005"]
        assert len(set(keys)) == 5

# ---------------------------------------------------------------------------
# Phase 1B — Goals / OKRs
# ---------------------------------------------------------------------------
def _create_goal(client, tok, title="Phase 1B goal", **extra):
    payload = {"title": title}
    payload.update(extra)
    return client.post("/api/jira/goals", json=payload,
                       headers={"X-CSRF-Token": tok})


def _resolve_issue(client, tok, iid):
    client.post(f"/api/jira/issues/{iid}/assign", json={"self": True},
                headers={"X-CSRF-Token": tok})
    client.post(f"/api/jira/issues/{iid}/status", json={"status": "in_progress"},
                headers={"X-CSRF-Token": tok})
    r = client.post(f"/api/jira/issues/{iid}/status", json={"status": "resolved"},
                    headers={"X-CSRF-Token": tok})
    assert r.status_code == 200


class TestGoals:
    def test_create_goal_admin(self, client):
        tok = _token(client)
        r = _create_goal(client, tok, description="Q3 push",
                         quarter="2026-Q3", target_date="2026-09-30")
        assert r.status_code == 201
        g = r.get_json()["goal"]
        assert g["title"] == "Phase 1B goal"
        assert g["quarter"] == "2026-Q3"
        assert g["status"] == "on_track"
        assert g["progress"] == 0 and g["issue_count"] == 0
        assert g["child_count"] == 0
        assert g["owner_id"] is None

    def test_create_goal_forbidden_for_agents(self, client):
        tok = _token(client, "agent@opsdesk.local")
        assert _create_goal(client, tok).status_code == 403

    def test_create_goal_validation(self, client):
        tok = _token(client)
        assert _create_goal(client, tok, title="").status_code == 400
        assert _create_goal(client, tok, quarter="Q3-2026").status_code == 400
        assert _create_goal(client, tok, status="nope").status_code == 400
        assert _create_goal(client, tok, target_date="09/30/2026").status_code == 400
        assert _create_goal(client, tok, parent_id=999).status_code == 400
        assert _create_goal(client, tok, owner_id=1).status_code == 201  # admin owns

    def test_goal_owner_must_be_staff(self, client):
        tok = _token(client)
        sam = client.get("/api/meta").get_json()["users"] and \
            [u for u in _staff_users(client) if u["role"] == "requester"]
        # find a requester user id via meta (requesters hidden) -> use agent
        r = _create_goal(client, tok, owner_id=5)  # sam@opsdesk.local is requester
        assert r.status_code == 400

    def test_patch_goal_owner_or_admin(self, client):
        tok = _token(client)
        mgr = _staff_users(client, "manager@opsdesk.local")[0]
        g = _create_goal(client, tok, owner_id=mgr["id"]).get_json()["goal"]
        tok_mgr = _token(client, "manager@opsdesk.local")
        r = client.patch(f"/api/jira/goals/{g['id']}",
                         json={"status": "at_risk", "title": "Renamed"},
                         headers={"X-CSRF-Token": tok_mgr})
        assert r.status_code == 200
        g2 = r.get_json()["goal"]
        assert g2["status"] == "at_risk" and g2["title"] == "Renamed"
        # non-owner agent cannot patch
        tok_ag = _token(client, "agent@opsdesk.local")
        r = client.patch(f"/api/jira/goals/{g['id']}",
                         json={"status": "behind"},
                         headers={"X-CSRF-Token": tok_ag})
        assert r.status_code == 403
        # admin can patch anything
        tok = _token(client)  # re-login as admin (agent session replaced it)
        r = client.patch(f"/api/jira/goals/{g['id']}",
                         json={"status": "achieved"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200

    def test_patch_goal_not_found_and_validation(self, client):
        tok = _token(client)
        assert client.patch("/api/jira/goals/999", json={"title": "x"},
                            headers={"X-CSRF-Token": tok}).status_code == 404
        g = _create_goal(client, tok).get_json()["goal"]
        assert client.patch(f"/api/jira/goals/{g['id']}", json={"quarter": "bad"},
                            headers={"X-CSRF-Token": tok}).status_code == 400

    def test_goal_progress_auto_calculated(self, client):
        tok = _token(client)
        g = _create_goal(client, tok).get_json()["goal"]
        a = _create_issue(client, tok).get_json()["issue"]
        b = _create_issue(client, tok).get_json()["issue"]
        for iid, pts in ((a["id"], 5), (b["id"], 5)):
            assert client.patch(f"/api/jira/issues/{iid}",
                                json={"goal_id": g["id"], "story_points": pts},
                                headers={"X-CSRF-Token": tok}).status_code == 200
        _resolve_issue(client, tok, a["id"])
        data = client.get(f"/api/jira/goals/{g['id']}/progress").get_json()
        assert data["progress"] == 50
        assert data["done_points"] == 5 and data["total_points"] == 10
        assert len(data["issues"]) == 2
        # list view shows the same live number
        goals = client.get("/api/jira/goals").get_json()["goals"]
        assert goals[0]["progress"] == 50 and goals[0]["issue_count"] == 2

    def test_goal_progress_zero_when_no_points(self, client):
        tok = _token(client)
        g = _create_goal(client, tok).get_json()["goal"]
        i = _create_issue(client, tok).get_json()["issue"]
        client.patch(f"/api/jira/issues/{i['id']}", json={"goal_id": g["id"]},
                     headers={"X-CSRF-Token": tok})
        _resolve_issue(client, tok, i["id"])
        data = client.get(f"/api/jira/goals/{g['id']}/progress").get_json()
        assert data["progress"] == 0 and data["total_points"] == 0

    def test_goals_requester_scoping(self, client):
        tok = _token(client)
        g1 = _create_goal(client, tok, title="goal mine").get_json()["goal"]
        g2 = _create_goal(client, tok, title="goal theirs").get_json()["goal"]
        tok_sam = _token(client, "sam@opsdesk.local")
        c = _csrf(client)
        mine = client.post("/api/jira/issues", json={"subject": "sam goal issue"},
                           headers={"X-CSRF-Token": c}).get_json()["issue"]
        # admin links sam's issue to g1
        tok = _token(client)
        client.patch(f"/api/jira/issues/{mine['id']}", json={"goal_id": g1["id"]},
                     headers={"X-CSRF-Token": tok})
        tok_sam = _token(client, "sam@opsdesk.local")
        titles = [g["title"] for g in
                  client.get("/api/jira/goals").get_json()["goals"]]
        assert "goal mine" in titles and "goal theirs" not in titles
        # progress endpoint 404 for a goal with no sam issues
        assert client.get(f"/api/jira/goals/{g2['id']}/progress").status_code == 404

    def test_goals_list_filters(self, client):
        tok = _token(client)
        _create_goal(client, tok, title="q3", quarter="2026-Q3")
        _create_goal(client, tok, title="q4", quarter="2026-Q4", status="at_risk")
        q3 = client.get("/api/jira/goals?quarter=2026-Q3").get_json()["goals"]
        assert [g["title"] for g in q3] == ["q3"]
        risk = client.get("/api/jira/goals?status=at_risk").get_json()["goals"]
        assert [g["title"] for g in risk] == ["q4"]

    def test_issue_patch_goal_id(self, client):
        tok = _token(client)
        g = _create_goal(client, tok).get_json()["goal"]
        i = _create_issue(client, tok).get_json()["issue"]
        assert client.patch(f"/api/jira/issues/{i['id']}", json={"goal_id": 999},
                            headers={"X-CSRF-Token": tok}).status_code == 400
        r = client.patch(f"/api/jira/issues/{i['id']}", json={"goal_id": g["id"]},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["issue"]["goal_id"] == g["id"]
        assert r.get_json()["issue"]["goal_title"] == g["title"]

    def test_goal_audit_rows(self, client):
        tok = _token(client)
        g = _create_goal(client, tok).get_json()["goal"]
        client.patch(f"/api/jira/goals/{g['id']}", json={"status": "behind"},
                     headers={"X-CSRF-Token": tok})
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        actions = [r[0] for r in conn.execute(
            "SELECT action FROM audit_log WHERE entity_type='jira_goal'")]
        assert "goal.create" in actions and "goal.update" in actions


def _staff_users(client, email=None):
    """Fetch staff users via /api/meta (agents/managers see the directory)."""
    users = client.get("/api/meta").get_json()["users"]
    if email:
        return [u for u in users if u["email"] == email]
    return users


# ---------------------------------------------------------------------------
# Phase 1B — Workflow scheme builder (admin)
# ---------------------------------------------------------------------------
class TestAdminWorkflows:
    def test_list_as_admin(self, client):
        tok = _token(client)
        data = client.get("/api/jira/admin/workflows").get_json()
        assert [p["key"] for p in data["projects"]] == ["OPS"]
        assert "new" in data["defaults"]
        assert data["defaults"]["new"]["assigned"] == {"reason_required": False, "roles": None}
        # fresh DBs ship with the 15 default rules stored (project_id NULL)
        assert len(data["transitions"]) == 15
        assert all(t["project_id"] is None for t in data["transitions"])

    def test_list_forbidden_for_manager(self, client):
        tok = _token(client, "manager@opsdesk.local")
        assert client.get("/api/jira/admin/workflows").status_code == 403

    def test_upsert_default_transition_enforced(self, client):
        tok = _token(client)
        r = client.post("/api/jira/admin/workflows",
                        json={"from_status": "new", "to_status": "resolved",
                              "allowed_roles": ["manager", "admin"],
                              "reason_required": True},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        i = _create_issue(client, tok).get_json()["issue"]
        # agent cannot use the new transition (allowed_roles = manager/admin)
        tok_ag = _token(client, "agent@opsdesk.local")
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok_ag})
        assert r.status_code == 400
        # admin can, and it now demands a reason
        tok = _token(client)  # re-login as admin (agent session replaced it)
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400  # reason_required
        r = client.post(f"/api/jira/issues/{i['id']}/status",
                        json={"status": "resolved", "note": "direct fix"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200

    def test_upsert_project_override_isolated(self, client):
        tok = _token(client)
        _create_project(client, tok, key="ENG", name="Engineering")
        eng = client.get("/api/jira/projects").get_json()["projects"][1]
        client.post("/api/jira/admin/workflows",
                    json={"project_id": eng["id"], "from_status": "new",
                          "to_status": "resolved", "allowed_roles": ["agent"]},
                    headers={"X-CSRF-Token": tok})
        data = client.get("/api/jira/admin/workflows").get_json()
        assert len(data["transitions"]) == 16
        tr = data["transitions"][-1]
        assert tr["project_id"] == eng["id"] and tr["allowed_roles"] == ["agent"]
        # default project unaffected (its rules are still the seeded defaults)

    def test_upsert_validation(self, client):
        tok = _token(client)
        for bad in ({"from_status": "nope", "to_status": "resolved"},
                    {"from_status": "new", "to_status": "nope"},
                    {"from_status": "new", "to_status": "new"},
                    {"from_status": "new", "to_status": "resolved",
                     "allowed_roles": ["requester"]},
                    {"from_status": "new", "to_status": "resolved",
                     "project_id": 999}):
            r = client.post("/api/jira/admin/workflows", json=bad,
                            headers={"X-CSRF-Token": tok})
            assert r.status_code == 400, bad

    def test_upsert_forbidden_for_non_admin(self, client):
        tok = _token(client, "manager@opsdesk.local")
        r = client.post("/api/jira/admin/workflows",
                        json={"from_status": "new", "to_status": "resolved"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 403

    def test_delete_restores_default(self, client):
        tok = _token(client)
        client.post("/api/jira/admin/workflows",
                    json={"from_status": "in_progress", "to_status": "resolved",
                          "allowed_roles": ["admin"]},
                    headers={"X-CSRF-Token": tok})
        # overridden: agent cannot resolve from in_progress
        tok_ag = _token(client, "agent@opsdesk.local")
        i = _create_issue(client, tok_ag).get_json()["issue"]
        client.post(f"/api/jira/issues/{i['id']}/assign", json={"self": True},
                    headers={"X-CSRF-Token": tok_ag})
        assert client.post(f"/api/jira/issues/{i['id']}/status",
                           json={"status": "in_progress"},
                           headers={"X-CSRF-Token": tok_ag}).status_code == 200
        assert client.post(f"/api/jira/issues/{i['id']}/status",
                           json={"status": "resolved"},
                           headers={"X-CSRF-Token": tok_ag}).status_code == 400
        # admin removes the override -> agent can resolve again
        tok = _token(client)
        r = client.delete("/api/jira/admin/workflows",
                          json={"from_status": "in_progress", "to_status": "resolved"},
                          headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        tok_ag = _token(client, "agent@opsdesk.local")
        assert client.post(f"/api/jira/issues/{i['id']}/status",
                           json={"status": "resolved"},
                           headers={"X-CSRF-Token": tok_ag}).status_code == 200

    def test_delete_missing_and_forbidden(self, client):
        tok = _token(client)
        r = client.delete("/api/jira/admin/workflows",
                          json={"from_status": "new", "to_status": "resolved"},
                          headers={"X-CSRF-Token": tok})
        assert r.status_code == 404
        tok_mgr = _token(client, "manager@opsdesk.local")
        assert client.delete("/api/jira/admin/workflows",
                             json={"from_status": "new", "to_status": "resolved"},
                             headers={"X-CSRF-Token": tok_mgr}).status_code == 403

    def test_workflow_audit_rows(self, client):
        tok = _token(client)
        client.post("/api/jira/admin/workflows",
                    json={"from_status": "new", "to_status": "resolved"},
                    headers={"X-CSRF-Token": tok})
        client.delete("/api/jira/admin/workflows",
                      json={"from_status": "new", "to_status": "resolved"},
                      headers={"X-CSRF-Token": tok})
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        actions = [r[0] for r in conn.execute(
            "SELECT action FROM audit_log WHERE entity_type='jira_workflow_transition'")]
        assert "workflow.upsert" in actions and "workflow.delete" in actions


# ---------------------------------------------------------------------------
# Phase 1B — Custom fields (EAV)
# ---------------------------------------------------------------------------
def _create_field(client, tok, name="Priority reason", field_type="text", **extra):
    payload = {"name": name, "field_type": field_type}
    payload.update(extra)
    return client.post("/api/jira/admin/custom-fields", json=payload,
                       headers={"X-CSRF-Token": tok})


class TestCustomFields:
    def test_create_field_admin(self, client):
        tok = _token(client)
        r = _create_field(client, tok)
        assert r.status_code == 201
        f = r.get_json()["field"]
        assert f["name"] == "Priority reason" and f["field_type"] == "text"
        assert f["required"] == 0

    def test_create_field_forbidden(self, client):
        tok = _token(client, "manager@opsdesk.local")
        assert _create_field(client, tok).status_code == 403

    def test_create_field_validation(self, client):
        tok = _token(client)
        assert _create_field(client, tok, name="").status_code == 400
        assert _create_field(client, tok, field_type="boolean").status_code == 400
        assert _create_field(client, tok, field_type="select").status_code == 400
        assert _create_field(client, tok, field_type="select",
                             options=["a"]).status_code == 201
        assert _create_field(client, tok, field_type="select",
                             options=[]).status_code == 400
        assert _create_field(client, tok, field_type="select",
                             options=["ok", 42]).status_code == 400
        assert _create_field(client, tok, project_id=999).status_code == 400

    def test_list_fields_admin_only(self, client):
        tok = _token(client)
        _create_field(client, tok, name="SLA note")
        _create_field(client, tok, name="Severity", field_type="select",
                      options=["low", "high"], required=True)
        data = client.get("/api/jira/admin/custom-fields").get_json()
        assert len(data["fields"]) == 2
        sev = [f for f in data["fields"] if f["name"] == "Severity"][0]
        assert sev["field_type"] == "select"
        assert sev["options"] == ["low", "high"] and sev["required"] == 1
        tok_mgr = _token(client, "manager@opsdesk.local")
        assert client.get("/api/jira/admin/custom-fields").status_code == 403

    def test_issue_text_and_number_values(self, client):
        tok = _token(client)
        t = _create_field(client, tok, name="SLA note").get_json()["field"]
        n = _create_field(client, tok, name="Impact", field_type="number").get_json()["field"]
        i = _create_issue(client, tok).get_json()["issue"]
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"custom_fields": {str(t["id"]): "urgent",
                                                 str(n["id"]): "3.5"}},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        fields = client.get(f"/api/jira/issues/{i['id']}").get_json()["issue"]["custom_fields"]
        by_name = {f["name"]: f for f in fields}
        assert by_name["SLA note"]["value"] == "urgent"
        assert by_name["Impact"]["value"] == 3.5

    def test_issue_value_validation(self, client):
        tok = _token(client)
        n = _create_field(client, tok, name="Impact", field_type="number").get_json()["field"]
        d = _create_field(client, tok, name="Ship date", field_type="date").get_json()["field"]
        s = _create_field(client, tok, name="Severity", field_type="select",
                          options=["low", "high"]).get_json()["field"]
        u = _create_field(client, tok, name="Owner", field_type="user").get_json()["field"]
        i = _create_issue(client, tok).get_json()["issue"]
        cases = [
            ({str(n["id"]): "abc"}, 400),
            ({str(d["id"]): "not-a-date"}, 400),
            ({str(s["id"]): "medium"}, 400),
            ({str(u["id"]): "notanid"}, 400),
            ({str(u["id"]): 99999}, 400),
            ({"999": "x"}, 400),
        ]
        for cf, code in cases:
            r = client.patch(f"/api/jira/issues/{i['id']}",
                             json={"custom_fields": cf},
                             headers={"X-CSRF-Token": tok})
            assert r.status_code == code, cf
        assert client.patch(f"/api/jira/issues/{i['id']}",
                            json={"custom_fields": {str(s["id"]): "high",
                                                    str(u["id"]): 1}},
                            headers={"X-CSRF-Token": tok}).status_code == 200

    def test_required_field_cannot_be_cleared(self, client):
        tok = _token(client)
        f = _create_field(client, tok, name="Severity", field_type="select",
                          options=["low", "high"], required=True).get_json()["field"]
        i = _create_issue(client, tok).get_json()["issue"]
        assert client.patch(f"/api/jira/issues/{i['id']}",
                            json={"custom_fields": {str(f["id"]): "low"}},
                            headers={"X-CSRF-Token": tok}).status_code == 200
        assert client.patch(f"/api/jira/issues/{i['id']}",
                            json={"custom_fields": {str(f["id"]): None}},
                            headers={"X-CSRF-Token": tok}).status_code == 400

    def test_requester_cannot_set_custom_fields(self, client):
        tok = _token(client)
        f = _create_field(client, tok, name="SLA note").get_json()["field"]
        tok_sam = _token(client, "sam@opsdesk.local")
        c = _csrf(client)
        i = client.post("/api/jira/issues", json={"subject": "sam cf"},
                        headers={"X-CSRF-Token": c}).get_json()["issue"]
        r = client.patch(f"/api/jira/issues/{i['id']}",
                         json={"custom_fields": {str(f["id"]): "x"}},
                         headers={"X-CSRF-Token": tok_sam})
        assert r.status_code == 200  # ignored silently (staff-only block)
        fields = client.get(f"/api/jira/issues/{i['id']}").get_json()["issue"]["custom_fields"]
        assert fields[0]["value"] is None

    def test_delete_field_cascades(self, client):
        tok = _token(client)
        f = _create_field(client, tok, name="SLA note").get_json()["field"]
        i = _create_issue(client, tok).get_json()["issue"]
        client.patch(f"/api/jira/issues/{i['id']}",
                     json={"custom_fields": {str(f["id"]): "x"}},
                     headers={"X-CSRF-Token": tok})
        assert client.delete(f"/api/jira/admin/custom-fields/{f['id']}",
                             headers={"X-CSRF-Token": tok}).status_code == 200
        assert client.delete(f"/api/jira/admin/custom-fields/{f['id']}",
                             headers={"X-CSRF-Token": tok}).status_code == 404
        fields = client.get(f"/api/jira/issues/{i['id']}").get_json()["issue"]["custom_fields"]
        assert fields == []
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        n = conn.execute("SELECT COUNT(*) FROM jira_custom_field_values").fetchone()[0]
        assert n == 0
        actions = [r[0] for r in conn.execute(
            "SELECT action FROM audit_log WHERE entity_type='jira_custom_field_def'")]
        assert "custom_field.delete" in actions


# ---------------------------------------------------------------------------
# Phase 1B — Reports on jira data + SLA policy audit
# ---------------------------------------------------------------------------
class TestReportsMigrated:
    def test_summary_reflects_jira_issues(self, client):
        tok = _token(client)
        i = _create_issue(client, tok).get_json()["issue"]
        client.post(f"/api/jira/issues/{i['id']}/assign", json={"self": True},
                    headers={"X-CSRF-Token": tok})
        tok_mgr = _token(client, "manager@opsdesk.local")
        data = client.get("/api/reports/summary").get_json()
        assert data["open"] >= 1

    def test_workload_and_trend_and_export(self, client):
        tok = _token(client, "manager@opsdesk.local")
        assert client.get("/api/reports/workload").status_code == 200
        assert client.get("/api/reports/trend").status_code == 200
        assert client.get("/api/reports/export.csv").status_code == 200

    def test_sla_policy_crud_audited(self, client):
        tok = _token(client)
        r = client.post("/api/sla-policies",
                        json={"name": "1B policy", "priority": "urgent",
                              "response_hours": 2, "resolution_hours": 24},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 201
        pid = r.get_json()["policy"]["id"]
        tok_mgr = _token(client, "manager@opsdesk.local")
        r = client.patch(f"/api/sla-policies/{pid}",
                         json={"response_hours": 1},
                         headers={"X-CSRF-Token": tok_mgr})
        assert r.status_code == 200
        assert client.delete(f"/api/sla-policies/{pid}",
                             headers={"X-CSRF-Token": tok_mgr}).status_code == 403
        tok = _token(client)
        assert client.delete(f"/api/sla-policies/{pid}",
                             headers={"X-CSRF-Token": tok}).status_code == 200
        import sqlite3
        conn = sqlite3.connect(config.DB_PATH)
        actions = [r[0] for r in conn.execute(
            "SELECT action FROM audit_log WHERE entity_type='sla_policy'")]
        assert actions == ["sla_policy.create", "sla_policy.update", "sla_policy.delete"]
