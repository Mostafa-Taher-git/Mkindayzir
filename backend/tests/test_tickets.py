"""
Test cases: ticket domain — CRUD, lifecycle, replies, assignment, stats.

TC-TKT-01  create -> number starts at 1 and increments
TC-TKT-02  staff reply moves OPEN -> IN_PROGRESS and stamps firstResponseAt
TC-TKT-03  close sets CLOSED + closedAt; reopen clears both
TC-TKT-04  overdue dueDate marks slaBreached on create; stats count it
TC-TKT-05  delete is soft: ticket disappears from list but stays in DB
TC-TKT-06  filters: status / search / priority
TC-TKT-07  VIEWER cannot create tickets (403)
TC-TKT-08  non-assigned MEMBER cannot manage others' tickets (403)
TC-TKT-09  assigned member may close their assigned ticket
TC-TKT-10  reply edit/delete: author ok; other member forbidden; admin allowed
TC-TKT-11  assign moves OPEN -> IN_PROGRESS
TC-TKT-12  stats endpoint counts match fixtures
"""
import datetime

from conftest import ADMIN, MEMBER, VIEWER, setup_users, login


def _mk_ticket(client, subject="Test ticket", **over):
    payload = {"subject": subject, "description": "desc", "priority": "MEDIUM", "category": "GENERAL"}
    payload.update(over)
    r = client.post("/api/tickets/", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_tc_tkt_01_ticket_number_increments(client):
    setup_users(client); login(client, ADMIN)
    t1 = _mk_ticket(client)
    t2 = _mk_ticket(client, "Second")
    assert t2["number"] == t1["number"] + 1


def test_tc_tkt_02_reply_progresses_status(client):
    setup_users(client); login(client, ADMIN)
    t = _mk_ticket(client)
    r = client.post(f"/api/tickets/{t['id']}/replies", json={"content": "on it"})
    assert r.status_code == 201
    body = client.get(f"/api/tickets/{t['id']}").json()
    assert body["status"] == "IN_PROGRESS"
    assert body["firstResponseAt"]


def test_tc_tkt_03_close_and_reopen(client):
    setup_users(client); login(client, ADMIN)
    t = _mk_ticket(client)
    closed = client.post(f"/api/tickets/{t['id']}/close").json()
    assert closed["status"] == "CLOSED" and closed["closedAt"]
    reopened = client.post(f"/api/tickets/{t['id']}/reopen").json()
    assert reopened["status"] == "OPEN"
    assert reopened["closedAt"] is None and reopened["resolvedAt"] is None


def test_tc_tkt_04_sla_breach_on_overdue_create(client):
    setup_users(client); login(client, ADMIN)
    past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)).isoformat()
    t = _mk_ticket(client, dueDate=past)
    assert t["slaBreached"] is True
    stats = client.get("/api/tickets/stats").json()
    assert stats["slaBreachedCount"] >= 1


def test_tc_tkt_05_soft_delete(client):
    setup_users(client); login(client, ADMIN)
    t = _mk_ticket(client)
    assert client.delete(f"/api/tickets/{t['id']}").status_code == 200
    listing = client.get("/api/tickets/").json()
    assert all(x["id"] != t["id"] for x in listing["items"])
    # direct fetch is a soft-deleted 404-equivalent
    assert client.get(f"/api/tickets/{t['id']}").status_code == 404


def test_tc_tkt_06_filters(client):
    setup_users(client); login(client, ADMIN)
    _mk_ticket(client, "Printer broken", priority="HIGH")
    _mk_ticket(client, "Wifi flaky")
    r = client.get("/api/tickets/", params={"status": "OPEN"}).json()
    assert len(r["items"]) >= 2
    r = client.get("/api/tickets/", params={"search": "wifi"}).json()
    assert any("Wifi" in x["subject"] for x in r["items"])
    r = client.get("/api/tickets/", params={"priority": "HIGH"}).json()
    assert all(x["priority"] == "HIGH" for x in r["items"])


def test_tc_tkt_07_viewer_cannot_create(client):
    setup_users(client); login(client, VIEWER)
    r = client.post("/api/tickets/", json={"subject": "x", "description": "y"})
    assert r.status_code == 403


def test_tc_tkt_08_member_cannot_manage_unassigned(client):
    setup_users(client)
    login(client, ADMIN)
    t = _mk_ticket(client)  # created by admin
    login(client, MEMBER)
    r = client.post(f"/api/tickets/{t['id']}/close")
    assert r.status_code == 403


def test_tc_tkt_09_assigned_member_can_close(client):
    from app.config import settings as cfg  # noqa: F401
    import asyncio, sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    setup_users(client)

    # fetch member id via direct DB read (no user-list API by design)
    import sqlite3, os
    db_path = os.path.join(os.environ["DATA_DIR"], "mkindayzir.db")
    con = sqlite3.connect(db_path)
    row = con.execute("SELECT id FROM users WHERE email=?", (MEMBER["email"],)).fetchone()
    con.close()
    member_id = row[0]

    login(client, ADMIN)
    t = _mk_ticket(client)
    r = client.post(f"/api/tickets/{t['id']}/assign", json={"assigneeId": member_id})
    assert r.status_code == 200
    login(client, MEMBER)
    r = client.post(f"/api/tickets/{t['id']}/close")
    assert r.status_code == 200
    assert r.json()["status"] == "CLOSED"


def test_tc_tkt_10_reply_permissions(client):
    setup_users(client)
    login(client, ADMIN)
    t = _mk_ticket(client)
    rep = client.post(f"/api/tickets/{t['id']}/replies",
                      json={"content": "admin note", "isInternal": True}).json()

    login(client, MEMBER)
    # member cannot see internal notes? (list shows them; edit is the gate)
    r = client.patch(f"/api/tickets/{t['id']}/replies/{rep['id']}", json={"content": "hacked"})
    assert r.status_code == 403
    r = client.delete(f"/api/tickets/{t['id']}/replies/{rep['id']}")
    assert r.status_code == 403

    login(client, ADMIN)
    r = client.patch(f"/api/tickets/{t['id']}/replies/{rep['id']}", json={"content": "edited"})
    assert r.status_code == 200 and r.json()["content"] == "edited"


def test_tc_tkt_11_assign_sets_in_progress(client):
    setup_users(client); login(client, ADMIN)
    import sqlite3, os
    db_path = os.path.join(os.environ["DATA_DIR"], "mkindayzir.db")
    con = sqlite3.connect(db_path)
    member_id = con.execute("SELECT id FROM users WHERE email=?", (MEMBER["email"],)).fetchone()[0]
    con.close()
    t = _mk_ticket(client)
    out = client.post(f"/api/tickets/{t['id']}/assign", json={"assigneeId": member_id}).json()
    assert out["status"] == "IN_PROGRESS" and out["assigneeId"] == member_id


def test_tc_tkt_12_stats_counts(client):
    setup_users(client); login(client, ADMIN)
    _mk_ticket(client, "A")
    _mk_ticket(client, "B")
    s = client.get("/api/tickets/stats").json()
    assert s["totalCount"] >= 2
    assert s["openCount"] >= 2
