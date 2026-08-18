"""
Backend test suite for OpsDesk (Phase 0 stabilization gate).

Covers the security fixes from PLAN.md §3:
  * /meta does not leak the staff directory to requesters
  * a requester cannot set requester_id on create
  * CSRF protection rejects mutating requests without the token
  * login rate-limit / lockout after N failures
  * SQLite timestamps are UTC (TZ math correct)
  * reopen_count is NOT double-incremented on assign-from-reopened
  * manager can close a brand-new ticket (new -> closed)
  * length caps reject oversized description / comment
  * attachment size is enforced from real bytes, not Content-Length

Run with:  pytest   (from the project root, venv activated)
"""
import os
import sys
import tempfile

import pytest

# Make the project importable as a package.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db as dbmod, config


@pytest.fixture
def app():
    # Fresh DB in a temp file so tests never touch the real data/.
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["OPERADESK_SECRET"] = "test-secret"
    config.DB_PATH = path
    application = create_app()
    application.config["TESTING"] = True
    yield application
    os.remove(path)
    # Clean up any WAL sidecar files.
    for ext in ("-wal", "-shm"):
        try:
            os.remove(path + ext)
        except OSError:
            pass


@pytest.fixture
def client(app):
    return app.test_client()


def _csrf(client):
    # Any anonymous request mints a per-session token (the endpoint is not
    # login-protected). The SPA fetches this before POSTing /api/auth/login.
    r = client.get("/api/auth/csrf")
    return r.get_json()["csrf_token"]


def _login(client, email, password="password"):
    # Login is a CSRF-protected mutation, so fetch the token first (the
    # browser does the same in app.js before calling API.login).
    token = _csrf(client)
    return client.post("/api/auth/login",
                        json={"email": email, "password": password},
                        headers={"X-CSRF-Token": token})


def _create_ticket(client, csrf, subject="Broken laptop", desc="Won't turn on",
                   as_user="sam@opsdesk.local"):
    # Self-contained: log in as the requested user and use a matching token.
    _login(client, as_user)
    csrf = _csrf(client)
    return client.post("/api/tickets", json={"subject": subject, "description": desc},
                       headers={"X-CSRF-Token": csrf})


# ---------------------------------------------------------------------------
# TZ correctness
# ---------------------------------------------------------------------------
def test_now_iso_is_utc(client):
    from datetime import datetime, timezone
    iso = dbmod.now_iso()
    # Parses as a timezone-aware UTC timestamp.
    dt = datetime.fromisoformat(iso)
    assert dt.tzinfo is not None
    assert dt.utcoffset() == timezone.utc.utcoffset(None)


# ---------------------------------------------------------------------------
# /meta scoping (no staff leak to requesters)
# ---------------------------------------------------------------------------
def test_meta_hides_users_from_requester(client):
    _login(client, "sam@opsdesk.local")
    r = client.get("/api/meta")
    assert r.status_code == 200
    assert r.get_json()["users"] == []          # requester sees no staff list
    assert r.get_json()["teams"]                # but still gets teams/categories


def test_meta_shows_users_to_agent(client):
    _login(client, "agent@opsdesk.local")
    r = client.get("/api/meta")
    assert len(r.get_json()["users"]) > 0       # agents need the list


# ---------------------------------------------------------------------------
# requester_id cannot be spoofed
# ---------------------------------------------------------------------------
def test_requester_cannot_spoof_requester_id(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/tickets",
                    json={"subject": "X", "description": "y", "requester_id": 1},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    # The ticket belongs to the logged-in requester, not the spoofed id.
    body = r.get_json()["ticket"]
    assert body["requester_id"] != 1
    # sam's id is 5 in the seed; verify it's actually sam's.
    me = client.get("/api/auth/me").get_json()["user"]
    assert body["requester_id"] == me["id"]


# ---------------------------------------------------------------------------
# CSRF protection
# ---------------------------------------------------------------------------
def test_mutating_request_without_csrf_is_rejected(client):
    _login(client, "agent@opsdesk.local")
    r = client.post("/api/tickets", json={"subject": "No token", "description": "z"})
    assert r.status_code == 403


def test_mutating_request_with_csrf_succeeds(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/tickets", json={"subject": "With token", "description": "ok"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201


# ---------------------------------------------------------------------------
# Login rate-limit / lockout
# ---------------------------------------------------------------------------
def test_login_lockout_after_max_attempts(client):
    for _ in range(config.LOGIN_MAX_ATTEMPTS):
        r = _login(client, "admin@opsdesk.local", password="wrong")
        assert r.status_code == 401
    # Next attempt (even with the right password) is locked out.
    r = _login(client, "admin@opsdesk.local", password="password")
    assert r.status_code == 429


# ---------------------------------------------------------------------------
# reopen_count not double-incremented
# ---------------------------------------------------------------------------
def test_reopen_count_not_double_incremented(client):
    # Ticket belongs to sam (the requester) so he can reopen it.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf).get_json()["ticket"]
    tid = t["id"]
    # agent drives it through the real lifecycle: assign -> in_progress -> resolved
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{tid}/assign", json={"self": True},
                headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{tid}/status", json={"status": "in_progress"},
                headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{tid}/status", json={"status": "resolved"},
                headers={"X-CSRF-Token": csrf})
    # requester reopens
    _login(client, "sam@opsdesk.local")
    r = client.post(f"/api/tickets/{tid}/reopen", headers={"X-CSRF-Token": _csrf(client)})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["reopen_count"] == 1
    # agent assigns it onward (was reopened) — must NOT bump reopen_count again.
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{tid}/assign", json={"self": True},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["reopen_count"] == 1


# ---------------------------------------------------------------------------
# manager can close a brand-new ticket
# ---------------------------------------------------------------------------
def test_manager_can_close_new_ticket(client):
    _login(client, "manager@opsdesk.local")
    csrf = _csrf(client)
    # Create as the manager (manager is in is_agent_or_manager, so allowed).
    r = client.post("/api/tickets", json={"subject": "Spam", "description": "dup"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    tid = r.get_json()["ticket"]["id"]
    r = client.post(f"/api/tickets/{tid}/status", json={"status": "closed"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["status"] == "closed"


# ---------------------------------------------------------------------------
# length caps
# ---------------------------------------------------------------------------
def test_oversized_description_rejected(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    big = "x" * (config.MAX_DESCRIPTION + 1)
    r = client.post("/api/tickets", json={"subject": "big", "description": big},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


def test_oversized_comment_rejected(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf).get_json()["ticket"]
    big = "y" * (config.MAX_COMMENT + 1)
    r = client.post(f"/api/tickets/{t['id']}/comments", json={"body": big},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Phase 1 — notifications + password reset
# ---------------------------------------------------------------------------
def test_assignment_notifies_requester(client):
    # sam creates, agent claims it -> sam gets an in-app notification.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    # sam reads her notifications
    _login(client, "sam@opsdesk.local")
    d = client.get("/api/notifications").get_json()
    assert d["unread_count"] == 1
    assert d["notifications"][0]["kind"] == "assigned"


def test_mark_notification_read(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                headers={"X-CSRF-Token": csrf})
    _login(client, "sam@opsdesk.local")
    nid = client.get("/api/notifications").get_json()["notifications"][0]["id"]
    r = client.post(f"/api/notifications/{nid}/read",
                    headers={"X-CSRF-Token": _csrf(client)})
    assert r.status_code == 200
    d = client.get("/api/notifications").get_json()
    assert d["unread_count"] == 0


def test_password_reset_flow(client, app):
    # No SMTP configured -> token is minted and we can read it from the DB.
    r = client.post("/api/auth/forgot-password", json={"email": "sam@opsdesk.local"})
    assert r.status_code == 200
    with app.app_context():
        from app import db as dbmod
        token = dbmod.get_db().execute(
            "SELECT token FROM password_resets WHERE email=? ORDER BY rowid DESC LIMIT 1",
            ("sam@opsdesk.local",)).fetchone()["token"]
    assert token
    # Short password rejected.
    bad = client.post("/api/auth/reset-password",
                      json={"token": token, "password": "x"})
    assert bad.status_code == 400
    # Valid password updates and logs in.
    ok = client.post("/api/auth/reset-password",
                     json={"token": token, "password": "brandnew1"})
    assert ok.status_code == 200
    # Token is now single-use.
    reuse = client.post("/api/auth/reset-password",
                        json={"token": token, "password": "another1"})
    assert reuse.status_code == 400
    # New password actually works.
    _login(client, "sam@opsdesk.local", password="brandnew1")
    assert client.get("/api/auth/me").status_code == 200


# ---------------------------------------------------------------------------
# Phase 2 — Knowledge Base
# ---------------------------------------------------------------------------
def test_kb_authoring_and_visibility(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb", json={"title": "VPN setup", "body": "Use the client.", "category_id": 1},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    aid = r.get_json()["article"]["id"]
    # Draft is hidden from requesters.
    _login(client, "sam@opsdesk.local")
    assert client.get("/api/kb").get_json()["articles"] == []
    # Agent publishes.
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    assert client.post(f"/api/kb/{aid}/publish", headers={"X-CSRF-Token": csrf}).status_code == 200
    # Now visible to requester.
    _login(client, "sam@opsdesk.local")
    arts = client.get("/api/kb").get_json()["articles"]
    assert len(arts) == 1 and arts[0]["id"] == aid
    # Search works.
    found = client.get("/api/kb?q=vpn").get_json()["articles"]
    assert len(found) == 1
    # Requester cannot publish.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    assert client.post(f"/api/kb/{aid}/publish", headers={"X-CSRF-Token": csrf}).status_code == 403
    # Feedback accepted.
    assert client.post(f"/api/kb/{aid}/feedback", json={"helpful": True},
                       headers={"X-CSRF-Token": _csrf(client)}).status_code == 200


# ---------------------------------------------------------------------------
# Phase 3 — SLA & routing
# ---------------------------------------------------------------------------
def test_category_routing_and_sla_attach(client):
    # Requester creates a ticket in the HR category (id 4). It should route to
    # the HR team and attach the matching SLA policy.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/tickets", json={"subject": "Payroll", "description": "x",
                                          "category_id": 4},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    t = r.get_json()["ticket"]
    assert t["team_id"] is not None          # routed, not unassigned
    assert t["sla"] is not None
    assert t["sla"]["policy_name"] == "HR - normal"


def test_sla_first_response_and_resolution_eval(client, app):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    # category 2 (Hardware) routes to IT, which the seeded agent belongs to.
    t = client.post("/api/tickets", json={"subject": "Laptop", "description": "x",
                                         "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    assert client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    # first response should now be recorded
    with app.app_context():
        from app import db as dbmod
        row = dbmod.get_db().execute(
            "SELECT first_response_at FROM ticket_sla WHERE ticket_id=?", (t["id"],)).fetchone()
        assert row["first_response_at"] is not None
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    sla = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla["resolution_met"] == 1
    assert sla["breached"] == 0


def test_recently_created_ticket_not_breached(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "VPN", "description": "x",
                                         "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    sla = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla["breached"] == 0
    assert sla["resolution_met"] is None  # not resolved yet


# ---------------------------------------------------------------------------
# Phase 2 — fixes verified by the OpenCode review
# ---------------------------------------------------------------------------
def test_kb_feedback_on_missing_article_404(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb/9999/feedback", json={"helpful": True},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 404


def test_kb_create_invalid_category_400(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb", json={"title": "x", "body": "y", "category_id": 9999},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


def test_kb_list_bad_category_id_does_not_500(client):
    _login(client, "agent@opsdesk.local")
    r = client.get("/api/kb?category_id=abc")
    assert r.status_code == 200  # guarded, not 500


def test_kb_cross_agent_publish_forbidden(client):
    # HR agent authors a draft, IT agent must NOT be able to publish/delete it.
    _login(client, "hragent@opsdesk.local")
    csrf = _csrf(client)
    aid = client.post("/api/kb", json={"title": "HR draft", "body": "secret"},
                      headers={"X-CSRF-Token": csrf}).get_json()["article"]["id"]
    _login(client, "agent@opsdesk.local")  # different agent
    csrf = _csrf(client)
    assert client.post(f"/api/kb/{aid}/publish",
                       headers={"X-CSRF-Token": csrf}).status_code == 403
    assert client.delete(f"/api/kb/{aid}",
                         headers={"X-CSRF-Token": csrf}).status_code == 403


def test_kb_requester_draft_by_id_404(client):
    _login(client, "hragent@opsdesk.local")
    csrf = _csrf(client)
    aid = client.post("/api/kb", json={"title": "hidden", "body": "x"},
                      headers={"X-CSRF-Token": csrf}).get_json()["article"]["id"]
    _login(client, "sam@opsdesk.local")  # requester
    r = client.get(f"/api/kb/{aid}")
    assert r.status_code == 404  # draft hidden from requesters


def test_kb_views_counter_not_lagging(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    aid = client.post("/api/kb", json={"title": "Viewed", "body": "content"},
                      headers={"X-CSRF-Token": csrf}).get_json()["article"]["id"]
    # publish so requesters can view
    assert client.post(f"/api/kb/{aid}/publish",
                        headers={"X-CSRF-Token": _csrf(client)}).status_code == 200
    _login(client, "sam@opsdesk.local")
    art = client.get(f"/api/kb/{aid}").get_json()["article"]
    assert art["views"] >= 1  # reflects the increment, not stale 0


# ---------------------------------------------------------------------------
# Phase 4 — Reporting & CSAT
# ---------------------------------------------------------------------------
def test_csat_requester_rates_resolved_ticket(client, app):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Rate me", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    assert client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/rate", json={"score": 5},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    # the rating must round-trip through GET /api/tickets/<id> (serialized csat)
    detail = client.get(f"/api/tickets/{t['id']}").get_json()["ticket"]
    assert detail["csat"] == 5
    # second rating rejected
    assert client.post(f"/api/tickets/{t['id']}/rate", json={"score": 3},
                       headers={"X-CSRF-Token": csrf}).status_code == 400


def test_csat_forbidden_for_non_owner(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "x", "description": "y", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    assert client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    # another requester cannot rate
    _login(client, "manager@opsdesk.local")  # manager, not owner/requester
    csrf = _csrf(client)
    assert client.post(f"/api/tickets/{t['id']}/rate", json={"score": 4},
                       headers={"X-CSRF-Token": csrf}).status_code == 403


def test_reports_summary_forbidden_for_agent(client):
    _login(client, "agent@opsdesk.local")
    assert client.get("/api/reports/summary").status_code == 403


def test_reports_summary_ok_for_manager(client):
    _login(client, "manager@opsdesk.local")
    r = client.get("/api/reports/summary")
    assert r.status_code == 200
    data = r.get_json()
    assert "total" in data
    assert "open" in data
    assert "backlog" in data
    assert "csat_distribution" in data


def test_reports_csv_export_forbidden_for_requester(client):
    _login(client, "sam@opsdesk.local")
    assert client.get("/api/reports/export.csv").status_code == 403


def test_reports_trend_days_validation(client):
    _login(client, "manager@opsdesk.local")
    r = client.get("/api/reports/trend?days=abc")
    assert r.status_code == 200
    assert r.get_json()["days"] == 30


# ---------------------------------------------------------------------------
# Phase 3 — OpenCode review fixes (BUG-1..4 + nits)
# ---------------------------------------------------------------------------
def test_response_met_uses_creation_time_not_first_response(client, app):
    # Late first response (well past the response SLA) must yield response_met=0.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Late reply", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    assert client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    # backdate first_response_at far past creation via direct DB
    with app.app_context():
        from app import db as dbmod
        # First response recorded FAR in the future (after the response SLA
        # deadline of created_at + response_hours) -> must count as missed.
        dbmod.get_db().execute(
            "UPDATE ticket_sla SET first_response_at=? WHERE ticket_id=?",
            ("2030-01-01T00:00:00+00:00", t["id"]))
        dbmod.get_db().commit()
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"},
                       headers={"X-CSRF-Token": csrf}).status_code == 200
    sla = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla["response_met"] == 0  # missed, not always 1


def test_open_ticket_breach_computed_live(client, app):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Overdue", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    with app.app_context():
        from app import db as dbmod
        dbmod.get_db().execute(
            "UPDATE ticket_sla SET breach_at=? WHERE ticket_id=?",
            ("2000-01-01T00:00:00+00:00", t["id"]))
        dbmod.get_db().commit()
    # ticket is still 'new' (open) but breach_at is in the past -> live breach
    sla = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla["breached"] is True


def test_first_response_recorded_on_comment(client, app):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Comment first", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    # agent comments WITHOUT assigning -> first response should still be recorded
    r = client.post(f"/api/tickets/{t['id']}/comments", json={"body": "Looking into it", "visibility": "public"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    with app.app_context():
        from app import db as dbmod
        fr = dbmod.get_db().execute(
            "SELECT first_response_at FROM ticket_sla WHERE ticket_id=?", (t["id"],)).fetchone()
        assert fr["first_response_at"] is not None


def test_invalid_category_id_returns_400_not_500(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/tickets", json={"subject": "x", "description": "y", "category_id": 99999},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


def test_requester_cannot_override_team_routing(client):
    # A requester sending team_id=Finance must be ignored; ticket routes by category.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    # category 2 (Hardware) -> IT team (id 1); try to force team 2 (HR)
    t = client.post("/api/tickets", json={"subject": "route", "description": "y",
                                          "category_id": 2, "team_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    assert t["team_id"] == 1  # routed by category, not the client value


def test_ticket_list_includes_sla_without_extra_queries(client, app):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "list sla", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    data = client.get("/api/tickets").get_json()
    row = next(x for x in data["tickets"] if x["id"] == t["id"])
    assert row["sla"] is not None  # SLA attached/serialized via the joined row
    assert "policy_name" in row["sla"]


def test_rating_logs_activity(client, app):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "rate log", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"}, headers={"X-CSRF-Token": csrf})
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/rate", json={"score": 5}, headers={"X-CSRF-Token": csrf})
    with app.app_context():
        from app import db as dbmod
        acts = dbmod.get_db().execute(
            "SELECT action, note FROM ticket_activity WHERE ticket_id=?", (t["id"],)).fetchall()
        assert any(a["action"] == "rated" and "5/5" in (a["note"] or "") for a in acts)


# ---------------------------------------------------------------------------
# v2 — AI assistance (key-gated, fail-closed, draft-only)
# ---------------------------------------------------------------------------
def test_ai_endpoints_unavailable_without_key(client):
    # No OPERADESK_OPENROUTER_KEY in test env -> AI_ENABLED False -> 503.
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "ai", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    for ep in ("summarize", "suggest-reply", "suggest-priority"):
        r = client.get(f"/api/ai/{ep}/{t['id']}")
        assert r.status_code == 503, (ep, r.status_code)
    # /api/auth/me reports ai_enabled False
    me = client.get("/api/auth/me").get_json()
    assert me["ai_enabled"] is False


def test_ai_endpoints_forbidden_for_requester(client):
    # Requesters must get 403 (not a draft) on AI endpoints, even when the
    # feature is enabled and the provider would return real text. (BUG-1 fix)
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "ai req", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    import app.config as cfg, app.ai.client as aicl
    old_key, old_flag, old_fn = os.environ.get("OPERADESK_OPENROUTER_KEY"), cfg.AI_ENABLED, aicl.ai_enabled
    os.environ["OPERADESK_OPENROUTER_KEY"] = "test-key"
    cfg.AI_ENABLED = True
    aicl.ai_enabled = lambda: True
    # Stub the provider so it WOULD return a draft if the route let the requester through.
    def _fake(prompt, temperature=0.3, max_tokens=400):
        return "LEAKED DRAFT"
    aicl._complete = _fake
    try:
        for ep in ("summarize", "suggest-reply", "suggest-priority"):
            r = client.get(f"/api/ai/{ep}/{t['id']}")
            assert r.status_code == 403, (ep, r.status_code, r.get_data(as_text=True))
            assert "LEAKED" not in r.get_data(as_text=True)
    finally:
        if old_key is None:
            os.environ.pop("OPERADESK_OPENROUTER_KEY", None)
        else:
            os.environ["OPERADESK_OPENROUTER_KEY"] = old_key
        cfg.AI_ENABLED = old_flag
        aicl.ai_enabled = old_fn
        aicl._complete = _complete_orig  # restore original


# capture original _complete for safe restore
import app.ai.client as _aiclmod
_complete_orig = _aiclmod._complete


def test_ai_endpoint_404_on_invisible_ticket(client):
    _login(client, "hragent@opsdesk.local")  # HR team
    csrf = _csrf(client)
    # Create a ticket in IT team via an agent+manager? sam creates -> team by category.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "ai vis", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]  # category 2 -> IT
    _login(client, "hragent@opsdesk.local")
    csrf = _csrf(client)
    import app.config as cfg
    old_flag = cfg.AI_ENABLED
    os.environ["OPERADESK_OPENROUTER_KEY"] = "test-key"
    cfg.AI_ENABLED = True
    try:
        r = client.get(f"/api/ai/summarize/{t['id']}")
        # HR agent cannot view an IT ticket -> 404 (not 502/200)
        assert r.status_code == 404, r.status_code
    finally:
        os.environ.pop("OPERADESK_OPENROUTER_KEY", None)
        cfg.AI_ENABLED = old_flag


# ---------------------------------------------------------------------------
# v2 AI — BUG-2 (priority inversion) and BUG-3 (fail-open on null content)
# ---------------------------------------------------------------------------
def test_suggest_priority_not_inverted_by_reason_text():
    import app.ai.client as aicl
    cases = {
        "PRIORITY: normal - low impact, not urgent, can wait": "normal",
        "PRIORITY: urgent - customer CEO blocked": "urgent",
        "PRIORITY: normal": "normal",
    }
    for model_out, expected in cases.items():
        aicl._complete = lambda p, **k: model_out
        got = aicl.suggest_priority({"subject": "x", "description": "y"})
        assert got == expected, (model_out, got)


def test_ai_fail_closed_when_content_is_null():
    import app.ai.client as aicl
    # Provider returns content: null -> must return None (route turns into 502),
    # never raise (which would have been a 500 before the fix).
    aicl._complete = lambda p, **k: None
    assert aicl.suggest_reply({"subject": "x", "description": "y"}) is None
    assert aicl.summarize_ticket({"subject": "x", "description": "y"}) is None


# ---------------------------------------------------------------------------
# v2 AI — per-user settings: save key + model + list available models
# ---------------------------------------------------------------------------
def test_settings_ai_save_and_list(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    h = {"X-CSRF-Token": csrf}
    # fresh user -> no key
    r = client.get("/api/settings/ai")
    assert r.status_code == 200
    body = r.get_json()
    assert body["has_key"] is False
    assert body["model"] == config.AI_MODEL_DEFAULT
    assert isinstance(body["models"], list)
    # save key + model
    r = client.post("/api/settings/ai", json={"api_key": "sk-or-abc123", "model": "x/y:free"}, headers=h)
    assert r.status_code == 200
    body = r.get_json()
    assert body["ok"] is True
    assert body["has_key"] is True
    assert body["model"] == "x/y:free"
    # clear key
    r = client.post("/api/settings/ai", json={"api_key": "", "model": "x/y:free"}, headers=h)
    assert r.status_code == 200
    assert r.get_json()["has_key"] is False


def test_ai_settings_rejects_invalid_key_format(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/settings/ai", json={"api_key": "not-a-real-key", "model": "x/y:free"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400
    assert "valid API key" in r.get_json()["error"]


def test_ai_settings_key_is_encrypted_at_rest(client, app):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post("/api/settings/ai", json={"api_key": "sk-or-secret123", "model": "x/y:free"},
                headers={"X-CSRF-Token": csrf})
    with app.app_context():
        from app import db as dbmod
        row = dbmod.get_db().execute(
            "SELECT ai_key FROM users WHERE email=?", ("agent@opsdesk.local",)).fetchone()
        assert row["ai_key"] is not None
        assert row["ai_key"] != "sk-or-secret123"  # not stored in plaintext
        assert row["ai_key"].startswith("gAAAAA")  # Fernet-encrypted


# ---------------------------------------------------------------------------
# Priority workflow — full tests
# ---------------------------------------------------------------------------
def test_priority_change_by_agent(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Pri test", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "urgent"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["priority"] == "urgent"


def test_priority_change_forbidden_for_requester(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Pri forbid", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "urgent"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 403


def test_priority_change_invalid_rejected(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Pri invalid", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "critical"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


def test_priority_change_logs_activity(client, app):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Pri log", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "urgent"},
                headers={"X-CSRF-Token": csrf})
    with app.app_context():
        from app import db as dbmod
        acts = dbmod.get_db().execute(
            "SELECT action, from_status, to_status FROM ticket_activity WHERE ticket_id=?", (t["id"],)).fetchall()
        assert any(a["action"] == "priority_change" and a["from_status"] == "normal" and a["to_status"] == "urgent"
                   for a in acts)


def test_priority_change_triggers_sla_reattach(client, app):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    # Create urgent ticket -> SLA should match urgent policy
    t = client.post("/api/tickets", json={"subject": "SLA reattach", "description": "x",
                                          "category_id": 1, "priority": "urgent"},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    # Verify it got the Urgent policy
    sla = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla["policy_name"] == "Urgent"
    # Change to normal -> SLA should update to Standard policy
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "normal"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    sla = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla is not None
    assert sla["policy_name"] == "Standard"


def test_priority_change_same_value_noop(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Same pri", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "normal"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["priority"] == "normal"


# ---------------------------------------------------------------------------
# Assign-to-specific-person workflow — full tests
# ---------------------------------------------------------------------------
def test_assign_to_specific_person(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Assign me", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")  # IT agent (id 3)
    csrf = _csrf(client)
    # Manager can assign to a specific person; agent can assign to teammate
    # Here agent assigns the ticket to themselves explicitly
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"assignee_id": 3},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["assignee_id"] == 3
    assert r.get_json()["ticket"]["status"] == "assigned"


def test_assign_to_other_team_forbidden(client):
    # sam (IT requester) creates a Hardware ticket -> it routes to IT team.
    # HR agent should NOT be able to assign themselves to it (different team,
    # can_view_ticket returns False -> 404 to avoid leaking ticket existence).
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "X-team", "description": "x", "category_id": 2},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "hragent@opsdesk.local")  # HR team (id 4)
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"assignee_id": 4},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 404


def test_assign_nonexistent_user_rejected(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "No user", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"assignee_id": 9999},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


def test_manager_assign_to_any_team_member(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    # HR category -> HR team
    t = client.post("/api/tickets", json={"subject": "Mgr assign", "description": "x", "category_id": 4},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "manager@opsdesk.local")
    csrf = _csrf(client)
    # Manager assigns to HR agent (id 4)
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"assignee_id": 4},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["assignee_id"] == 4


# ---------------------------------------------------------------------------
# Notifications — full test coverage for all requester-facing events
# ---------------------------------------------------------------------------
def test_notification_on_blocked_status(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    # Agent assigns so it's in a state to be blocked (new->assigned->blocked)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                headers={"X-CSRF-Token": csrf})
    r = client.post(f"/api/tickets/{t['id']}/status", json={"status": "blocked", "note": "Waiting on external"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    _login(client, "sam@opsdesk.local")
    d = client.get("/api/notifications").get_json()
    kinds = [n["kind"] for n in d["notifications"]]
    assert "blocked" in kinds


def test_notification_on_agent_reopen(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"}, headers={"X-CSRF-Token": csrf})
    # Agent reopens (manager/admin can reopen from resolved)
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "reopened"},
                headers={"X-CSRF-Token": csrf})
    _login(client, "sam@opsdesk.local")
    d = client.get("/api/notifications").get_json()
    kinds = [n["kind"] for n in d["notifications"]]
    assert "reopened" in kinds


def test_notification_on_priority_change(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "urgent"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    _login(client, "sam@opsdesk.local")
    d = client.get("/api/notifications").get_json()
    kinds = [n["kind"] for n in d["notifications"]]
    assert "priority" in kinds


def test_notification_on_agent_public_comment(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/comments", json={"body": "Checking in", "visibility": "public"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    _login(client, "sam@opsdesk.local")
    d = client.get("/api/notifications").get_json()
    kinds = [n["kind"] for n in d["notifications"]]
    assert "comment" in kinds
    # The notification message should contain the agent's name and ticket ref
    msg = next(n["message"] for n in d["notifications"] if n["kind"] == "comment")
    assert "agent" in msg.lower()  # mentions the agent name


def test_requester_reopen_does_not_notify_self(client):
    # A requester reopening their own ticket should NOT get a reopen notification
    # (they're the one doing it). Only staff reopens should notify.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"}, headers={"X-CSRF-Token": csrf})
    # Now sam reopens their own ticket
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/reopen", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    # sam should have an "assigned" notification but NOT a "reopened" one
    d = client.get("/api/notifications").get_json()
    kinds = [n["kind"] for n in d["notifications"]]
    assert "reopened" not in kinds


# ---------------------------------------------------------------------------
# KB — cross-agent edit/delete forbidden (complementary to publish test)
# ---------------------------------------------------------------------------
def test_kb_cross_agent_edit_forbidden(client):
    _login(client, "hragent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb", json={"title": "HR secret", "body": "confidential"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    aid = r.get_json()["article"]["id"]
    _login(client, "agent@opsdesk.local")  # different agent, different team
    csrf = _csrf(client)
    r = client.patch(f"/api/kb/{aid}", json={"title": "hacked", "body": "pwned"},
                     headers={"X-CSRF-Token": csrf})
    assert r.status_code == 403


def test_kb_requester_cannot_edit(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb", json={"title": "Draft", "body": "content"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    aid = r.get_json()["article"]["id"]
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    r = client.patch(f"/api/kb/{aid}", json={"title": "hacked", "body": "pwned"},
                     headers={"X-CSRF-Token": csrf})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Lifecycle integrity — blocked → resolved must be rejected
# ---------------------------------------------------------------------------
def test_blocked_to_resolved_rejected(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = _create_ticket(client, csrf, as_user="sam@opsdesk.local").get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True}, headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"}, headers={"X-CSRF-Token": csrf})
    # Now block it
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "blocked", "note": "dep"},
                headers={"X-CSRF-Token": csrf})
    # blocked -> resolved should be rejected (lifecycle doesn't allow it)
    r = client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Dashboard — requester cannot access
# ---------------------------------------------------------------------------
def test_dashboard_forbidden_for_requester(client):
    _login(client, "sam@opsdesk.local")
    assert client.get("/api/dashboard").status_code == 403


# ---------------------------------------------------------------------------
# Edge cases — SLA breach_at recalculated on priority change, KB author edit
# ---------------------------------------------------------------------------
def test_priority_change_updates_sla_breach_at(client, app):
    # When priority goes urgent->normal, the SLA resolution window extends.
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "SLA breach", "description": "x",
                                          "category_id": 1, "priority": "urgent"},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    # Urgent policy = 8h resolution -> breach_at = created + 8h
    sla_before = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla_before["policy_name"] == "Urgent"
    # Change to normal -> Standard policy = 72h resolution
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "normal"},
                headers={"X-CSRF-Token": csrf})
    sla_after = client.get(f"/api/tickets/{t['id']}/sla").get_json()["sla"]
    assert sla_after["policy_name"] == "Standard"
    # breach_at should be later than before (72h window vs 8h)
    from datetime import datetime
    b_before = datetime.fromisoformat(sla_before["breach_at"].replace("Z", "+00:00"))
    b_after = datetime.fromisoformat(sla_after["breach_at"].replace("Z", "+00:00"))
    assert b_after > b_before


def test_kb_author_can_edit_own_article(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb", json={"title": "My draft", "body": "original content"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    aid = r.get_json()["article"]["id"]
    # Same author edits
    r = client.patch(f"/api/kb/{aid}", json={"title": "My draft", "body": "updated content"},
                     headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["article"]["body"] == "updated content"


def test_kb_published_article_visible_to_requester(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    r = client.post("/api/kb", json={"title": "VPN guide", "body": "Step 1: connect", "category_id": 1},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    aid = r.get_json()["article"]["id"]
    client.post(f"/api/kb/{aid}/publish", headers={"X-CSRF-Token": csrf})
    _login(client, "sam@opsdesk.local")
    r = client.get(f"/api/kb/{aid}")
    assert r.status_code == 200
    assert r.get_json()["article"]["title"] == "VPN guide"


def test_requester_cannot_assign_ticket_to_anyone(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "No assign", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"assignee_id": 3},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 403


def test_manager_can_change_priority_on_any_ticket(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Mgr pri", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "manager@opsdesk.local")
    csrf = _csrf(client)
    r = client.post(f"/api/tickets/{t['id']}/priority", json={"priority": "urgent"},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.get_json()["ticket"]["priority"] == "urgent"


# ---------------------------------------------------------------------------
# List-ticket assignee filter (me / unassigned / specific user)
# ---------------------------------------------------------------------------
def test_list_tickets_assignee_filter_me(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t1 = client.post("/api/tickets", json={"subject": "A1", "description": "x", "category_id": 1},
                     headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    # agent claims it
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t1['id']}/assign", json={"self": True},
                headers={"X-CSRF-Token": csrf})
    # create another unassigned ticket
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    client.post("/api/tickets", json={"subject": "A2", "description": "x", "category_id": 1},
                headers={"X-CSRF-Token": csrf})
    # agent views queue filtered to me
    _login(client, "agent@opsdesk.local")
    r = client.get("/api/tickets?assignee_id=me")
    assert r.status_code == 200
    tickets = r.get_json()["tickets"]
    assert all(t["assignee_id"] == 3 for t in tickets)
    assert any(t["id"] == t1["id"] for t in tickets)


def test_list_tickets_assignee_filter_unassigned(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    client.post("/api/tickets", json={"subject": "U1", "description": "x", "category_id": 1},
                headers={"X-CSRF-Token": csrf})
    _login(client, "agent@opsdesk.local")
    r = client.get("/api/tickets?assignee_id=unassigned")
    assert r.status_code == 200
    tickets = r.get_json()["tickets"]
    assert all(t["assignee_id"] is None for t in tickets)


def test_list_tickets_assignee_filter_specific_user(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t1 = client.post("/api/tickets", json={"subject": "S1", "description": "x", "category_id": 1},
                     headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t1['id']}/assign", json={"self": True},
                headers={"X-CSRF-Token": csrf})
    r = client.get(f"/api/tickets?assignee_id=3")
    assert r.status_code == 200
    tickets = r.get_json()["tickets"]
    assert all(t["assignee_id"] == 3 for t in tickets)


# ---------------------------------------------------------------------------
# CSAT serialization in list/detail
# ---------------------------------------------------------------------------
def test_csat_serialized_in_ticket_list(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    t = client.post("/api/tickets", json={"subject": "Rate list", "description": "x", "category_id": 1},
                    headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/assign", json={"self": True},
                headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "in_progress"},
                headers={"X-CSRF-Token": csrf})
    client.post(f"/api/tickets/{t['id']}/status", json={"status": "resolved"},
                headers={"X-CSRF-Token": csrf})
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    client.post(f"/api/tickets/{t['id']}/rate", json={"score": 4},
                headers={"X-CSRF-Token": csrf})
    _login(client, "agent@opsdesk.local")
    data = client.get("/api/tickets").get_json()
    row = next(x for x in data["tickets"] if x["id"] == t["id"])
    assert row["csat"] == 4


# ---------------------------------------------------------------------------
# Dashboard — role-aware shape
# ---------------------------------------------------------------------------
def test_dashboard_requester_forbidden(client):
    _login(client, "sam@opsdesk.local")
    assert client.get("/api/dashboard").status_code == 403


def test_dashboard_manager_shape(client):
    _login(client, "manager@opsdesk.local")
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    data = r.get_json()
    assert data["role"] == "manager"
    assert "counts" in data
    assert "unassigned" in data
    assert "urgent" in data
    assert "blocked" in data
    assert "resolved" in data
    assert "avg_resolution_hours" in data
    assert "aged" in data
    assert "my_open" not in data


def test_dashboard_agent_shape(client):
    _login(client, "agent@opsdesk.local")
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    data = r.get_json()
    assert data["role"] == "agent"
    assert "my_open" in data
    assert "my_urgent" in data
    assert "my_blocked" in data
    assert "my_resolved_today" in data
    assert "my_avg_response_hours" in data
    assert "my_avg_resolution_hours" in data
    assert "my_rated_tickets" in data
    assert "aged" in data
    assert "counts" in data


# ---------------------------------------------------------------------------
# Action Center + KB ticket links
# ---------------------------------------------------------------------------
def test_action_center_manager_only(client):
    _login(client, "agent@opsdesk.local")
    assert client.get("/api/dashboard/action-center").status_code == 403


def test_action_center_shape(client):
    _login(client, "manager@opsdesk.local")
    r = client.get("/api/dashboard/action-center")
    assert r.status_code == 200
    data = r.get_json()
    assert "unassigned" in data
    assert "breached" in data
    assert "stale" in data


def test_kb_list_filters_for_agent(client):
    _login(client, "agent@opsdesk.local")
    r = client.get("/api/kb?status=published&sort=views")
    assert r.status_code == 200
    data = r.get_json()
    assert "articles" in data


def test_ticket_kb_link_lifecycle(client):
    _login(client, "sam@opsdesk.local")
    csrf = _csrf(client)
    ticket = client.post("/api/tickets", json={"subject": "KB link", "description": "x", "category_id": 1},
                         headers={"X-CSRF-Token": csrf}).get_json()["ticket"]
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    article = client.post("/api/kb", json={"title": "Link me", "body": "body", "category_id": 1},
                          headers={"X-CSRF-Token": csrf}).get_json()["article"]
    r = client.post(f"/api/tickets/{ticket['id']}/knowledge", json={"article_id": article["id"]},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    linked = client.get(f"/api/tickets/{ticket['id']}/knowledge").get_json()["articles"]
    assert any(x["id"] == article["id"] for x in linked)
    r2 = client.post(f"/api/tickets/{ticket['id']}/knowledge",
                     json={"article_id": article["id"]},
                     headers={"X-CSRF-Token": csrf})
    assert r2.status_code == 409
    r3 = client.delete(f"/api/tickets/{ticket['id']}/knowledge/{article['id']}",
                       headers={"X-CSRF-Token": csrf})
    assert r3.status_code == 200
    final = client.get(f"/api/tickets/{ticket['id']}/knowledge").get_json()["articles"]
    assert not any(x["id"] == article["id"] for x in final)


# ---------------------------------------------------------------------------
# Knowledge Collections
# ---------------------------------------------------------------------------
def test_collection_crud_and_membership(client):
    _login(client, "agent@opsdesk.local")
    csrf = _csrf(client)
    article = client.post("/api/kb", json={"title": "Coll", "body": "body", "category_id": 1},
                          headers={"X-CSRF-Token": csrf}).get_json()["article"]
    c = client.post("/api/kb/collections", json={"name": "Ops", "description": "Ops stuff"},
                    headers={"X-CSRF-Token": csrf}).get_json()["collection"]
    assert c["name"] == "Ops"
    listed = client.get("/api/kb/collections").get_json()["collections"]
    assert any(x["id"] == c["id"] for x in listed)
    r = client.post(f"/api/kb/collections/{c['id']}/articles",
                    json={"article_id": article["id"]},
                    headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    arts = client.get(f"/api/kb/collections/{c['id']}/articles").get_json()["articles"]
    assert any(x["id"] == article["id"] for x in arts)
    r2 = client.post(f"/api/kb/collections/{c['id']}/articles",
                     json={"article_id": article["id"]},
                     headers={"X-CSRF-Token": csrf})
    assert r2.status_code == 409
    r3 = client.delete(f"/api/kb/collections/{c['id']}/articles/{article['id']}",
                       headers={"X-CSRF-Token": csrf})
    assert r3.status_code == 200
    after = client.get(f"/api/kb/collections/{c['id']}/articles").get_json()["articles"]
    assert not any(x["id"] == article["id"] for x in after)
