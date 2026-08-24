"""
Test cases: item #5 — role selection during team/enterprise setup.

TC-SETUP-01  team setup with initialRole=MANAGER creates a MANAGER admin
TC-SETUP-02  invalid initialRole falls back to ADMIN (never crashes)
TC-SETUP-03  personal setup ALWAYS forces ADMIN regardless of requested role
TC-SETUP-04  setup replay still rejected after role-based setup
"""
import sqlite3
import os

from conftest import ADMIN, login


def _role_of(email):
    con = sqlite3.connect(os.path.join(os.environ["DATA_DIR"], "mkindayzir.db"))
    row = con.execute("SELECT role FROM users WHERE email=?", (email,)).fetchone()
    con.close()
    return row[0]


def test_tc_setup_01_team_role_honoured(client):
    r = client.post("/api/setup/", json={"mode": "team", **ADMIN,
                                         "confirmPassword": ADMIN["password"],
                                         "initialRole": "MANAGER"})
    assert r.status_code == 201
    assert _role_of(ADMIN["email"]) == "MANAGER"


def test_tc_setup_02_invalid_role_falls_back_to_admin(client):
    r = client.post("/api/setup/", json={"mode": "team", **ADMIN,
                                         "confirmPassword": ADMIN["password"],
                                         "initialRole": "SUPREME_LEADER"})
    assert r.status_code == 201
    assert _role_of(ADMIN["email"]) == "ADMIN"


def test_tc_setup_03_personal_forces_admin(client):
    r = client.post("/api/setup/", json={"mode": "personal", **ADMIN,
                                         "confirmPassword": ADMIN["password"],
                                         "initialRole": "VIEWER"})
    assert r.status_code == 201
    assert _role_of(ADMIN["email"]) == "ADMIN"


def test_tc_setup_04_replay_rejected_after_role_setup(client):
    client.post("/api/setup/", json={"mode": "team", **ADMIN,
                                     "confirmPassword": ADMIN["password"],
                                     "initialRole": "MEMBER"})
    r = client.post("/api/setup/", json={"mode": "team", "email": "x@example.com",
                                         "displayName": "X", "password": "whatever1",
                                         "confirmPassword": "whatever1"})
    assert r.status_code == 400
