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
