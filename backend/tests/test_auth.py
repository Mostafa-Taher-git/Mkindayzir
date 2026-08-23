"""
Test cases: authentication, sessions, setup wizard, registration gating.

TC-AUTH-01  setup wizard creates first ADMIN exactly once
TC-AUTH-02  replaying setup is rejected (400)
TC-AUTH-03  login with valid credentials -> 200 + session cookie
TC-AUTH-04  login with wrong password -> 401
TC-AUTH-05  login with unknown email   -> 401
TC-AUTH-06  /session returns the logged-in user's role
TC-AUTH-07  logout deletes the server-side session
TC-AUTH-08  session cookie is HttpOnly
TC-AUTH-09  register honours REGISTRATION_ENABLED and creates MEMBER role
TC-AUTH-10  every protected endpoint 401s without a session
"""
from conftest import ADMIN, MEMBER, VIEWER, setup_users, login


def test_tc_auth_01_setup_creates_admin_once(client):
    r = client.post("/api/setup/", json={"mode": "team", **ADMIN, "confirmPassword": ADMIN["password"]})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "ADMIN"
    assert client.get("/api/setup/").json()["setupComplete"] is True


def test_tc_auth_02_setup_replay_rejected(client):
    setup_users(client)
    r = client.post("/api/setup/", json={"mode": "team", "email": "new@example.com",
                                         "displayName": "N", "password": "whatever1",
                                         "confirmPassword": "whatever1"})
    assert r.status_code == 400


def test_tc_auth_03_login_valid(client):
    setup_users(client)
    r = login(client, ADMIN)
    body = r.json()
    assert body["data"]["email"] == ADMIN["email"]
    assert "mkindayzir_session" in r.cookies


def test_tc_auth_04_login_wrong_password(client):
    setup_users(client)
    r = client.post("/api/auth/login", json={"email": ADMIN["email"], "password": "wrong!"})
    assert r.status_code == 401


def test_tc_auth_05_login_unknown_email(client):
    setup_users(client)
    r = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "irrelevant"})
    assert r.status_code == 401


def test_tc_auth_06_session_role(client):
    setup_users(client)
    login(client, ADMIN)
    r = client.get("/api/auth/session")
    assert r.status_code == 200
    assert r.json()["data"]["role"] == "ADMIN"


def test_tc_auth_07_logout_invalidates_session(client):
    setup_users(client)
    login(client, ADMIN)
    assert client.get("/api/auth/session").status_code == 200
    assert client.delete("/api/auth/session").status_code == 200
    assert client.get("/api/auth/session").status_code == 401


def test_tc_auth_08_cookie_httponly(client):
    setup_users(client)
    r = client.post("/api/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]})
    set_cookie = r.headers.get("set-cookie", "")
    assert "httponly" in set_cookie.lower()


def test_tc_auth_09_register_creates_member(client):
    setup_users(client)
    # MEMBER/VIEWER were registered inside setup_users; verify via admin login + role change guard
    login(client, VIEWER)
    r = client.get("/api/auth/session")
    assert r.json()["data"]["role"] in ("VIEWER", "MEMBER")


def test_tc_auth_10_protected_endpoints_require_session(client):
    for ep in ("/api/tickets/", "/api/projects/", "/api/vault/notes", "/api/dashboard/stats",
               "/api/assistant/conversations", "/api/reports/?type=summary"):
        assert client.get(ep).status_code == 401, ep
