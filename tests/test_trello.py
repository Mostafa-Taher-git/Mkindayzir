"""
Backend test suite for Phase 2A — Trello Core.

Covers:
  * workspaces: create (any login, creator becomes admin member), list
    (owned + member), patch (WS admin only), members add/remove (WS admin),
    owner immovable, role validation, audit trail
  * boards: create (member+), viewer 403, non-member 404, list + starred
    filter, detail shape, patch (title/star/archive)
  * lists: create with position ordering, before/after midpoint insertion,
    patch (title/archive)
  * cards: create/patch (due-date validation), move across lists with
    midpoint positions + rebalance, delete, members, labels, checklists,
    comments, activity log

Run with:  pytest tests/test_trello.py   (project root, venv activated)
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, config


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


def _ws(client, tok, name="Launch WS"):
    return client.post("/api/trello/workspaces", json={"name": name},
                       headers={"X-CSRF-Token": tok}).get_json()["workspace"]


def _board(client, tok, ws_id, title="Q3 Launch"):
    return client.post("/api/trello/boards",
                       json={"workspace_id": ws_id, "title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["board"]


def _list(client, tok, bid, title="Backlog"):
    return client.post(f"/api/trello/boards/{bid}/lists", json={"title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["list"]


def _card(client, tok, lid, title="Ship v1"):
    return client.post("/api/trello/cards", json={"list_id": lid, "title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["card"]


def _setupscope(client, tok):
    """admin-owned workspace + board + two lists + one card."""
    ws = _ws(client, tok)
    b = _board(client, tok, ws["id"])
    l1 = _list(client, tok, b["id"], "Backlog")
    l2 = _list(client, tok, b["id"], "Doing")
    card = _card(client, tok, l1["id"], "Ship v1")
    return ws, b, l1, l2, card


# ---------------------------------------------------------------------------
# Workspaces
# ---------------------------------------------------------------------------
class TestWorkspaces:
    def test_requires_login(self, client):
        assert client.get("/api/trello/workspaces").status_code == 401
        assert client.post("/api/trello/workspaces",
                           json={"name": "x"}).status_code == 401

    def test_list_empty(self, client):
        tok = _token(client)
        assert client.get("/api/trello/workspaces",
                          headers={"X-CSRF-Token": tok}).get_json()["workspaces"] == []

    def test_create_requires_name(self, client):
        tok = _token(client)
        r = client.post("/api/trello/workspaces", json={},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_create_rejects_bad_visibility(self, client):
        tok = _token(client)
        r = client.post("/api/trello/workspaces",
                        json={"name": "WS", "visibility": "secret"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_creator_is_admin_member(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        assert ws["role"] == "admin"
        assert ws["owner_id"] == 1
        members = client.get(
            f"/api/trello/workspaces/{ws['id']}/members",
            headers={"X-CSRF-Token": tok}).get_json()["members"]
        assert len(members) == 1 and members[0]["ws_role"] == "admin"

    def test_list_shows_owned_and_member(self, client):
        tok = _token(client)
        ws = _ws(client, tok, "Owned")
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "member"},
                    headers={"X-CSRF-Token": tok})
        # agent joins as member; sees it in their list (login swaps session)
        a_tok = _token(client, "agent@opsdesk.local")
        mine = client.get("/api/trello/workspaces",
                          headers={"X-CSRF-Token": a_tok}).get_json()["workspaces"]
        assert any(w["name"] == "Owned" for w in mine)
        assert mine[0]["role"] == "member"

    def test_patch_workspace_admin_only(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "member"},
                    headers={"X-CSRF-Token": tok})
        # login swaps the session to agent; agent is a member but not admin
        a_tok = _token(client, "agent@opsdesk.local")
        r = client.patch(f"/api/trello/workspaces/{ws['id']}",
                         json={"name": "Hacked", "visibility": "private"},
                         headers={"X-CSRF-Token": a_tok})
        assert r.status_code == 403
        tok = _token(client)  # back to admin
        r = client.patch(f"/api/trello/workspaces/{ws['id']}",
                         json={"name": "Renamed", "visibility": "private"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["workspace"]["name"] == "Renamed"

    def test_patch_validates_visibility(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        r = client.patch(f"/api/trello/workspaces/{ws['id']}",
                         json={"visibility": "nope"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_add_member_validates_role_and_user(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        r = client.post(f"/api/trello/workspaces/{ws['id']}/members",
                        json={"user_id": 3, "role": "wizard"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.post(f"/api/trello/workspaces/{ws['id']}/members",
                        json={"user_id": 9999, "role": "member"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 404

    def test_add_member_duplicate_409(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        for _ in range(2):
            r = client.post(f"/api/trello/workspaces/{ws['id']}/members",
                            json={"user_id": 3, "role": "member"},
                            headers={"X-CSRF-Token": tok})
        assert r.status_code == 409

    def test_remove_member(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "member"},
                    headers={"X-CSRF-Token": tok})
        r = client.delete(f"/api/trello/workspaces/{ws['id']}/members/3",
                          headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        members = client.get(f"/api/trello/workspaces/{ws['id']}/members",
                             headers={"X-CSRF-Token": tok}).get_json()["members"]
        assert len(members) == 1

    def test_remove_owner_forbidden(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        r = client.delete(f"/api/trello/workspaces/{ws['id']}/members/1",
                          headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_non_member_cannot_probe(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        other = _token(client, "sam@opsdesk.local")
        assert client.get(f"/api/trello/workspaces/{ws['id']}/members",
                          headers={"X-CSRF-Token": other}).status_code == 404
        assert client.patch(f"/api/trello/workspaces/{ws['id']}",
                            json={"name": "x"},
                            headers={"X-CSRF-Token": other}).status_code == 404

    def test_workspace_audited(self, client, app):
        tok = _token(client)
        ws = _ws(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "viewer"},
                    headers={"X-CSRF-Token": tok})
        with app.app_context():
            from app import db
            actions = {r["action"] for r in db.get_db().execute(
                "SELECT action FROM audit_log WHERE entity_type='trello_workspace'")}
        assert {"workspace.create", "workspace.member_add"} <= actions


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------
class TestBoards:
    def test_create_requires_workspace(self, client):
        tok = _token(client)
        r = client.post("/api/trello/boards", json={"title": "X"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_create_member_ok(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        r = client.post("/api/trello/boards",
                        json={"workspace_id": ws["id"], "title": "Board 1"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 201
        assert r.get_json()["board"]["title"] == "Board 1"

    def test_create_viewer_forbidden(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "viewer"},
                    headers={"X-CSRF-Token": tok})
        a_tok = _token(client, "agent@opsdesk.local")
        r = client.post("/api/trello/boards",
                        json={"workspace_id": ws["id"], "title": "X"},
                        headers={"X-CSRF-Token": a_tok})
        assert r.status_code == 403

    def test_create_non_member_404(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        other = _token(client, "sam@opsdesk.local")
        r = client.post("/api/trello/boards",
                        json={"workspace_id": ws["id"], "title": "X"},
                        headers={"X-CSRF-Token": other})
        assert r.status_code == 404

    def test_list_and_starred_filter(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b1 = _board(client, tok, ws["id"], "Alpha")
        _board(client, tok, ws["id"], "Beta")
        client.patch(f"/api/trello/boards/{b1['id']}",
                     json={"is_starred": True},
                     headers={"X-CSRF-Token": tok})
        boards = client.get(f"/api/trello/boards?workspace_id={ws['id']}",
                            headers={"X-CSRF-Token": tok}).get_json()["boards"]
        assert [b["title"] for b in boards] == ["Alpha", "Beta"]
        assert boards[0]["is_starred"] == 1
        starred = client.get(
            f"/api/trello/boards?workspace_id={ws['id']}&starred=1",
            headers={"X-CSRF-Token": tok}).get_json()["boards"]
        assert [b["title"] for b in starred] == ["Alpha"]

    def test_detail_shape(self, client):
        tok = _token(client)
        ws, b, l1, l2, card = _setupscope(client, tok)
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert d["board"]["id"] == b["id"]
        assert d["workspace"]["name"] == "Launch WS"
        assert [l["title"] for l in d["lists"]] == ["Backlog", "Doing"]
        assert len(d["lists"][0]["cards"]) == 1
        assert d["lists"][0]["cards"][0]["id"] == card["id"]
        assert d["lists"][0]["cards"][0]["list_title"] == "Backlog"
        assert "labels" in d and "members" in d

    def test_detail_non_member_404(self, client):
        tok = _token(client)
        ws, b, *_ = _setupscope(client, tok)
        other = _token(client, "sam@opsdesk.local")
        assert client.get(f"/api/trello/boards/{b['id']}",
                          headers={"X-CSRF-Token": other}).status_code == 404

    def test_patch_archive(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        r = client.patch(f"/api/trello/boards/{b['id']}",
                         json={"is_archived": True, "is_starred": True,
                               "background": "#FF0000"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["board"]["is_archived"] == 1
        assert r.get_json()["board"]["background"] == "#FF0000"
        boards = client.get(f"/api/trello/boards?workspace_id={ws['id']}",
                            headers={"X-CSRF-Token": tok}).get_json()["boards"]
        assert boards == []  # archived boards hidden from the list


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------
class TestLists:
    def test_create_and_order(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        _list(client, tok, b["id"], "One")
        _list(client, tok, b["id"], "Two")
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert [l["title"] for l in d["lists"]] == ["One", "Two"]

    def test_create_before_after_midpoint(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l1 = _list(client, tok, b["id"], "One")
        l2 = _list(client, tok, b["id"], "Two")
        # insert between them
        mid = client.post(f"/api/trello/boards/{b['id']}/lists",
                          json={"title": "Mid", "before_id": l2["id"],
                                "after_id": l1["id"]},
                          headers={"X-CSRF-Token": tok}).get_json()["list"]
        assert mid["position"] == (l1["position"] + l2["position"]) / 2
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert [l["title"] for l in d["lists"]] == ["One", "Mid", "Two"]

    def test_patch_title_and_archive(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        r = client.patch(f"/api/trello/lists/{l['id']}",
                         json={"title": "Renamed", "is_archived": True},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["list"]["title"] == "Renamed"
        assert r.get_json()["list"]["is_archived"] == 1
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert d["lists"] == []  # archived lists hidden


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------
class TestCards:
    def test_create_requires_list(self, client):
        tok = _token(client)
        assert client.post("/api/trello/cards", json={"title": "X"},
                           headers={"X-CSRF-Token": tok}).status_code == 400

    def test_create_viewer_forbidden(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "viewer"},
                    headers={"X-CSRF-Token": tok})
        a_tok = _token(client, "agent@opsdesk.local")
        assert client.post("/api/trello/cards",
                           json={"list_id": l["id"], "title": "X"},
                           headers={"X-CSRF-Token": a_tok}).status_code == 403

    def test_patch_due_date_validation(self, client):
        tok = _token(client)
        _, _, _, _, card = _setupscope(client, tok)
        r = client.patch(f"/api/trello/cards/{card['id']}",
                         json={"due_date": "not-a-date"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.patch(f"/api/trello/cards/{card['id']}",
                         json={"due_date": "2026-09-01", "is_complete": True,
                               "description": "Do it"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        got = r.get_json()["card"]
        assert got["due_date"] == "2026-09-01" and got["is_complete"] == 1

    def test_move_between_lists_midpoint(self, client):
        tok = _token(client)
        _, _, l1, l2, card = _setupscope(client, tok)
        r = client.post(f"/api/trello/cards/{card['id']}/move",
                        json={"list_id": l2["id"]},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert r.get_json()["card"]["list_id"] == l2["id"]
        # only card in the target list -> append position
        assert r.get_json()["card"]["position"] == 32767.5

    def test_move_before_after_positioning(self, client):
        tok = _token(client)
        ws, b, l1, l2, card = _setupscope(client, tok)
        c2 = _card(client, tok, l2["id"], "Second")
        # move card before c2 (i.e. above it)
        r = client.post(f"/api/trello/cards/{card['id']}/move",
                        json={"list_id": l2["id"], "before_id": c2["id"]},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        pos = r.get_json()["card"]["position"]
        assert pos < c2["position"] and pos == c2["position"] / 2
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        doing = [l for l in d["lists"] if l["title"] == "Doing"][0]
        assert [c["title"] for c in doing["cards"]] == ["Ship v1", "Second"]

    def test_move_invalid_list(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b1 = _board(client, tok, ws["id"], "One")
        b2 = _board(client, tok, ws["id"], "Two")
        l = _list(client, tok, b1["id"])
        card = _card(client, tok, l["id"])
        other_list = _list(client, tok, b2["id"])
        r = client.post(f"/api/trello/cards/{card['id']}/move",
                        json={"list_id": other_list["id"]},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_rebalance_after_many_inserts(self, client):
        tok = _token(client)
        ws, b, l1, _, _ = _setupscope(client, tok)
        first = None
        for i in range(15):
            payload = {"list_id": l1["id"], "title": f"c{i}"}
            if first:
                payload["before_id"] = first
            r = client.post("/api/trello/cards", json=payload,
                            headers={"X-CSRF-Token": tok})
            assert r.status_code == 201
            first = r.get_json()["card"]["id"] if i == 0 else first
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        positions = [c["position"] for c in d["lists"][0]["cards"]]
        assert len(positions) == 16
        assert all(float(p).is_integer() for p in positions)
        assert positions == sorted(positions)

    def test_delete_card(self, client):
        tok = _token(client)
        _, _, _, _, card = _setupscope(client, tok)
        r = client.delete(f"/api/trello/cards/{card['id']}",
                          headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        assert client.get(f"/api/trello/cards/{card['id']}/activity",
                          headers={"X-CSRF-Token": tok}).status_code == 404

    def test_card_members(self, client):
        tok = _token(client)
        ws, _, _, _, card = _setupscope(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "member"},
                    headers={"X-CSRF-Token": tok})
        r = client.post(f"/api/trello/cards/{card['id']}/members",
                        json={"user_id": 3},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        # non-workspace user cannot be added
        r = client.post(f"/api/trello/cards/{card['id']}/members",
                        json={"user_id": 5},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.delete(f"/api/trello/cards/{card['id']}/members/3",
                          headers={"X-CSRF-Token": tok})
        assert r.status_code == 200

    def test_labels(self, client):
        tok = _token(client)
        ws, b, _, _, card = _setupscope(client, tok)
        lbl = client.post(f"/api/trello/boards/{b['id']}/labels",
                          json={"name": "urgent", "color": "#EB5A46"},
                          headers={"X-CSRF-Token": tok}).get_json()["label"]
        # label from another board is rejected
        b2 = _board(client, tok, ws["id"], "Other")
        lbl2 = client.post(f"/api/trello/boards/{b2['id']}/labels",
                           json={"name": "other", "color": "#61BD4F"},
                           headers={"X-CSRF-Token": tok}).get_json()["label"]
        r = client.post(f"/api/trello/cards/{card['id']}/labels",
                        json={"label_id": lbl2["id"]},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.post(f"/api/trello/cards/{card['id']}/labels",
                        json={"label_id": lbl["id"]},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 201
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert d["lists"][0]["cards"][0]["labels"][0]["name"] == "urgent"
        assert client.delete(f"/api/trello/cards/{card['id']}/labels/{lbl['id']}",
                             headers={"X-CSRF-Token": tok}).status_code == 200

    def test_checklists_and_items(self, client):
        tok = _token(client)
        _, b, _, _, card = _setupscope(client, tok)
        cl = client.post(f"/api/trello/cards/{card['id']}/checklists",
                         json={"title": "Launch steps"},
                         headers={"X-CSRF-Token": tok}).get_json()["checklist"]
        it = client.post(f"/api/trello/checklists/{cl['id']}/items",
                         json={"content": "Deploy"},
                         headers={"X-CSRF-Token": tok}).get_json()["item"]
        it2 = client.post(f"/api/trello/checklists/{cl['id']}/items",
                          json={"content": "Announce"},
                          headers={"X-CSRF-Token": tok}).get_json()["item"]
        r = client.patch(f"/api/trello/checklist-items/{it['id']}",
                         json={"is_checked": True},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200 and r.get_json()["item"]["is_checked"] == 1
        r = client.patch(f"/api/trello/checklists/{cl['id']}",
                         json={"title": "Steps"},
                         headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        checklist = d["lists"][0]["cards"][0]["checklists"][0]
        assert checklist["title"] == "Steps"
        assert checklist["done"] == 1 and checklist["total"] == 2

    def test_comments_and_activity(self, client):
        tok = _token(client)
        _, _, _, _, card = _setupscope(client, tok)
        r = client.post(f"/api/trello/cards/{card['id']}/comments",
                        json={"body": "On it"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 201
        assert r.get_json()["comment"]["author_name"] == "Admin User"
        assert client.post(f"/api/trello/cards/{card['id']}/comments",
                           json={"body": ""},
                           headers={"X-CSRF-Token": tok}).status_code == 400
        act = client.get(f"/api/trello/cards/{card['id']}/activity",
                         headers={"X-CSRF-Token": tok}).get_json()["activity"]
        actions = [a["action"] for a in act]
        assert {"created", "comment_added"} <= set(actions)
        assert act[0]["actor_name"] == "Admin User"

    def test_member_activities_visible_to_viewer(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "viewer"},
                    headers={"X-CSRF-Token": tok})
        a_tok = _token(client, "agent@opsdesk.local")
        assert client.get(f"/api/trello/boards/{b['id']}",
                          headers={"X-CSRF-Token": a_tok}).status_code == 200
        assert client.post(f"/api/trello/cards/{card['id']}/comments",
                           json={"body": "no"},
                           headers={"X-CSRF-Token": a_tok}).status_code == 403

# ---------------------------------------------------------------------------
# Phase 2B — Calendar, bulk edits, board activity
# ---------------------------------------------------------------------------
class TestCalendar:
    def test_month_filter_and_undated(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        c1 = _card(client, tok, l["id"], "Sep due")
        client.patch(f"/api/trello/cards/{c1['id']}",
                     json={"due_date": "2026-09-15"},
                     headers={"X-CSRF-Token": tok})
        c2 = _card(client, tok, l["id"], "Oct due")
        client.patch(f"/api/trello/cards/{c2['id']}",
                     json={"due_date": "2026-10-02"},
                     headers={"X-CSRF-Token": tok})
        _card(client, tok, l["id"], "No due")
        d = client.get(f"/api/trello/boards/{b['id']}/calendar?month=2026-09",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert [c["title"] for c in d["cards"]] == ["Sep due"]
        assert d["cards"][0]["list_title"] == "Backlog"
        d = client.get(f"/api/trello/boards/{b['id']}/calendar",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert len(d["undated"]) == 1 and d["undated"][0]["title"] == "No due"

    def test_calendar_requires_membership(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        other = _token(client, "sam@opsdesk.local")
        assert client.get(f"/api/trello/boards/{b['id']}/calendar",
                          headers={"X-CSRF-Token": other}).status_code == 404

    def test_calendar_rejects_bad_month(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        r = client.get(f"/api/trello/boards/{b['id']}/calendar?month=09-2026",
                       headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_calendar_includes_labels_and_members(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        c = _card(client, tok, l["id"], "Tagged")
        client.patch(f"/api/trello/cards/{c['id']}", json={"due_date": "2026-09-01"},
                     headers={"X-CSRF-Token": tok})
        lbl = client.post(f"/api/trello/boards/{b['id']}/labels",
                          json={"name": "x", "color": "#EB5A46"},
                          headers={"X-CSRF-Token": tok}).get_json()["label"]
        client.post(f"/api/trello/cards/{c['id']}/labels", json={"label_id": lbl["id"]},
                    headers={"X-CSRF-Token": tok})
        client.post(f"/api/trello/cards/{c['id']}/members", json={"user_id": 1},
                    headers={"X-CSRF-Token": tok})
        d = client.get(f"/api/trello/boards/{b['id']}/calendar?month=2026-09",
                       headers={"X-CSRF-Token": tok}).get_json()
        assert d["cards"][0]["labels"][0]["name"] == "x"
        assert d["cards"][0]["card_members"][0]["id"] == 1


class TestBulkActions:
    def test_bulk_requires_ids(self, client):
        tok = _token(client)
        r = client.post("/api/trello/cards/bulk", json={"board_id": 1},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.post("/api/trello/cards/bulk", json={"board_id": 1, "card_ids": []},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_bulk_move_and_complete(self, client):
        tok = _token(client)
        ws, b, l1, l2, _ = _setupscope(client, tok)
        c2 = _card(client, tok, l1["id"], "Second")
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [1, c2["id"]],
                              "list_id": l2["id"], "is_complete": True},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200 and r.get_json()["updated"] == 2
        d = client.get(f"/api/trello/boards/{b['id']}",
                       headers={"X-CSRF-Token": tok}).get_json()
        doing = [x for x in d["lists"] if x["title"] == "Doing"][0]
        assert len(doing["cards"]) == 2
        assert all(c["is_complete"] == 1 for c in doing["cards"])

    def test_bulk_set_due_date_and_clear(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"]],
                              "due_date": "2026-12-01"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        got = client.get(f"/api/trello/boards/{b['id']}",
                         headers={"X-CSRF-Token": tok}).get_json()
        assert got["lists"][0]["cards"][0]["due_date"] == "2026-12-01"
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"]],
                              "due_date": None},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 200
        got = client.get(f"/api/trello/boards/{b['id']}",
                         headers={"X-CSRF-Token": tok}).get_json()
        assert got["lists"][0]["cards"][0]["due_date"] is None

    def test_bulk_rejects_bad_due_and_list(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"]],
                              "due_date": "nope"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"]],
                              "list_id": 999},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_bulk_cards_from_other_board_rejected(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        b2 = _board(client, tok, ws["id"], "Other")
        l2 = _list(client, tok, b2["id"])
        stray = _card(client, tok, l2["id"], "Stray")
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"], stray["id"]],
                              "is_complete": True},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_bulk_nothing_to_update(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"]]},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 400

    def test_bulk_viewer_forbidden(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        client.post(f"/api/trello/workspaces/{ws['id']}/members",
                    json={"user_id": 3, "role": "viewer"},
                    headers={"X-CSRF-Token": tok})
        a_tok = _token(client, "agent@opsdesk.local")
        r = client.post("/api/trello/cards/bulk",
                        json={"board_id": b["id"], "card_ids": [card["id"]],
                              "is_complete": True},
                        headers={"X-CSRF-Token": a_tok})
        assert r.status_code == 403


class TestBoardActivity:
    def test_activity_feed_merges_card_and_board_events(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        client.post(f"/api/trello/cards/{card['id']}/comments", json={"body": "hi"},
                    headers={"X-CSRF-Token": tok})
        act = client.get(f"/api/trello/boards/{b['id']}/activity",
                         headers={"X-CSRF-Token": tok}).get_json()["activity"]
        assert len(act) >= 3
        sources = {e["source"] for e in act}
        assert sources == {"card", "audit"}
        actions = [e["action"] for e in act]
        assert "board.create" in actions and "created" in actions
        # newest first
        assert act == sorted(act, key=lambda e: e["created_at"], reverse=True)

    def test_activity_after_card_delete(self, client):
        tok = _token(client)
        ws, b, l1, _, card = _setupscope(client, tok)
        client.delete(f"/api/trello/cards/{card['id']}",
                      headers={"X-CSRF-Token": tok})
        act = client.get(f"/api/trello/boards/{b['id']}/activity",
                         headers={"X-CSRF-Token": tok}).get_json()["activity"]
        assert any(e["action"] == "card.delete" for e in act)

    def test_activity_requires_membership(self, client):
        tok = _token(client)
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        other = _token(client, "sam@opsdesk.local")
        assert client.get(f"/api/trello/boards/{b['id']}/activity",
                          headers={"X-CSRF-Token": other}).status_code == 404
