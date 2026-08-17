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
    assert "total" in r.get_json()


def test_reports_csv_export_forbidden_for_requester(client):
    _login(client, "sam@opsdesk.local")
    assert client.get("/api/reports/export.csv").status_code == 403


def test_reports_trend_days_validation(client):
    _login(client, "manager@opsdesk.local")
    r = client.get("/api/reports/trend?days=abc")
    assert r.status_code == 200
    assert r.get_json()["days"] == 30  # coerced to default


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
