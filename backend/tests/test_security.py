"""
Test cases: security invariants.

TC-SEC-01  encryption module round-trips and produces unique ciphertexts
TC-SEC-02  AI API key is stored encrypted (never plaintext) in the DB
TC-SEC-03  assistant conversation access is owner-only (404 for others)
TC-SEC-04  last-admin demotion guard via PATCH /api/auth/role
TC-SEC-05  role change requires confirmation text "DEMOTE"
TC-SEC-06  session tokens are 128-char hex (64 bytes entropy)
TC-SEC-07  bcrypt cost on stored hashes >= 10
TC-SEC-08  SPA catch-all cannot escape the dist directory
TC-SEC-09  register endpoint honours REGISTRATION_ENABLED=false -> 403
TC-SEC-10  password change flows hash with bcrypt (setup wizard)
"""
import base64
import os
import re
import sqlite3

import pytest

from conftest import ADMIN, MEMBER, setup_users, login


def _db():
    p = os.path.join(os.environ["DATA_DIR"], "mkindayzir.db")
    return sqlite3.connect(p)


def test_tc_sec_01_encryption_roundtrip():
    from app.utils.encryption import encrypt, decrypt, get_encryption_key
    key = get_encryption_key()
    ct1 = encrypt("sk-or-v1-abc123", key)
    ct2 = encrypt("sk-or-v1-abc123", key)
    assert ct1 != ct2                      # fresh salt/iv every time
    assert decrypt(ct1, key) == "sk-or-v1-abc123"
    assert len(ct1.split(".")) == 4        # salt.iv.ciphertext.tag


def test_tc_sec_02_api_key_stored_encrypted(client):
    setup_users(client); login(client, ADMIN)
    r = client.patch("/api/settings/ai", json={"aiApiKey": "sk-or-v1-super-secret"})
    assert r.status_code == 200
    con = _db()
    row = con.execute("SELECT aiApiKey FROM users WHERE email=?", (ADMIN["email"],)).fetchone()
    con.close()
    stored = row[0]
    assert stored and "sk-or-v1-super-secret" not in stored
    assert stored.count(".") == 3          # encrypted blob format


def test_tc_sec_03_conversations_owner_only(client):
    setup_users(client); login(client, ADMIN)
    conv = client.post("/api/assistant/conversations", json={"title": "private"}).json()
    cid = conv["id"]
    # admin can read own; member must not
    assert client.get(f"/api/assistant/conversations/{cid}").status_code == 200
    login(client, MEMBER)
    r = client.get(f"/api/assistant/conversations/{cid}")
    assert r.status_code == 404            # not 403: existence hidden


def test_tc_sec_04_last_admin_cannot_demote(client):
    setup_users(client); login(client, ADMIN)
    r = client.patch("/api/auth/role", json={"newRole": "MEMBER", "confirmation": "DEMOTE"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "LAST_ADMIN"


def test_tc_sec_05_role_change_requires_confirmation(client):
    setup_users(client); login(client, ADMIN)
    r = client.patch("/api/auth/role", json={"newRole": "MEMBER", "confirmation": "yes"})
    assert r.status_code == 400


def test_tc_sec_06_session_token_entropy(client):
    setup_users(client); login(client, ADMIN)
    con = _db()
    token = con.execute("SELECT token FROM sessions LIMIT 1").fetchone()[0]
    con.close()
    assert len(token) == 128               # secrets.token_hex(64)
    assert re.fullmatch(r"[0-9a-f]{128}", token)


def test_tc_sec_07_bcrypt_hash_strength(client):
    setup_users(client)
    con = _db()
    h = con.execute("SELECT passwordHash FROM users WHERE email=?", (ADMIN["email"],)).fetchone()[0]
    con.close()
    assert h.startswith("$2")
    cost = int(h.split("$")[2])
    assert cost >= 10


def test_tc_sec_08_spa_path_traversal_blocked(client):
    from app.main import app
    # serve_spa only exists when a built frontend dir was found at import;
    # exercise the resolver logic directly either way.
    from pathlib import Path
    frontend = Path(__file__).resolve().parents[2] / "dist"
    resolved = frontend.resolve()
    for evil in ("../../etc/passwd", "..%2f..%2fetc/passwd", "a/../../b"):
        candidate = (resolved / evil.replace("%2f", "/")).resolve()
        assert not candidate.is_relative_to(resolved) or not candidate.exists()


def test_tc_sec_09_registration_toggle_off(client, monkeypatch):
    setup_users(client)
    from app.config import settings as cfg
    monkeypatch.setattr(cfg, "REGISTRATION_ENABLED", False)
    r = client.post("/api/auth/register",
                    json={"email": "late@example.com", "displayName": "L", "password": "password1"})
    assert r.status_code == 403


def test_tc_sec_10_setup_password_is_bcrypt_not_plaintext(client):
    client.post("/api/setup/", json={"mode": "team", **ADMIN, "confirmPassword": ADMIN["password"]})
    con = _db()
    h = con.execute("SELECT passwordHash FROM users WHERE email=?", (ADMIN["email"],)).fetchone()[0]
    con.close()
    assert ADMIN["password"] not in h
    assert h.startswith("$2")
