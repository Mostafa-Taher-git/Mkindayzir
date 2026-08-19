"""
Backend integration suite for Phase 7 — cross-module flows.

These tests deliberately exercise MORE THAN ONE module working together:
  * Jira issues <-> KB notes (entity links + promote-to-KB)
  * Omnisearch spanning issues, cards and notes
  * Trello cards <-> Jira issues (entity links)
  * Cross-module notification side effects

Single-endpoint behaviour is covered elsewhere (test_jira / test_trello /
test_kb / test_shared / test_help); this file focuses on the seams between
modules. Every test authenticates the actor properly and seeds its own data so
the cases stay independent.

Run with:  pytest tests/test_integration.py   (project root, venv activated)
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


def _create_issue(client, tok, subject="Integration issue", desc="desc"):
    return client.post("/api/jira/issues", json={"subject": subject,
                                                 "description": desc},
                       headers={"X-CSRF-Token": tok}).get_json()["issue"]


def _create_note(client, tok, title="Integration note",
                 content="Integration content"):
    return client.post("/api/kb/notes", json={"title": title,
                                              "content": content},
                       headers={"X-CSRF-Token": tok}).get_json()["note"]


def _ws(client, tok, name="Integration WS"):
    return client.post("/api/trello/workspaces", json={"name": name},
                       headers={"X-CSRF-Token": tok}).get_json()["workspace"]


def _board(client, tok, ws_id, title="Integration Board"):
    return client.post("/api/trello/boards",
                       json={"workspace_id": ws_id, "title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["board"]


def _list(client, tok, bid, title="Backlog"):
    return client.post(f"/api/trello/boards/{bid}/lists", json={"title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["list"]


def _card(client, tok, lid, title="Integration card"):
    return client.post("/api/trello/cards", json={"list_id": lid,
                                                  "title": title},
                       headers={"X-CSRF-Token": tok}).get_json()["card"]


def _link(client, tok, source_type, source_id, target_type, target_id):
    return client.post("/api/entity-links",
                       json={"source_type": source_type, "source_id": source_id,
                             "target_type": target_type, "target_id": target_id},
                       headers={"X-CSRF-Token": tok})


# ---------------------------------------------------------------------------
# Jira issue <-> KB note (entity links, both directions)
# ---------------------------------------------------------------------------
class TestIssueKbLink:
    def test_issue_note_link_bidirectional(self, client):
        tok = _token(client, "agent@opsdesk.local")
        issue = _create_issue(client, tok, subject="Link issue alpha",
                              desc="alpha integration")
        note = _create_note(client, tok, title="Note alpha",
                            content="alpha content")
        nid = note["id"]
        assert client.post(f"/api/kb/{nid}/publish",
                            headers={"X-CSRF-Token": tok}).status_code == 200

        r = _link(client, tok, "jira_issue", issue["id"], "kb_note", nid)
        assert r.status_code in (200, 201)

        fwd = client.get(
            f"/api/entity-links?source_type=jira_issue&source_id={issue['id']}"
        ).get_json()
        assert any(l["target_type"] == "kb_note" and l["target_id"] == nid
                   for l in fwd["links"])

        rev = client.get(
            f"/api/entity-links?source_type=kb_note&source_id={nid}"
        ).get_json()
        assert any(l["source_type"] == "jira_issue" and l["source_id"] == issue["id"]
                   for l in rev["links"])


# ---------------------------------------------------------------------------
# Omnisearch spans issues / cards / notes
# ---------------------------------------------------------------------------
class TestOmnisearchCrossModule:
    def test_search_finds_each_module_entity(self, client):
        tok = _token(client, "agent@opsdesk.local")
        issue = _create_issue(client, tok,
                              subject="OMNI_UNIQ_ISSUE_77",
                              desc="omni issue body")
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        card = _card(client, tok, l["id"], "OMNI_UNIQ_CARD_77")
        note = _create_note(client, tok, title="OMNI_UNIQ_NOTE_77",
                            content="omni note body")

        for term, group, eid in (("OMNI_UNIQ_ISSUE_77", "issues", issue["id"]),
                                 ("OMNI_UNIQ_CARD_77", "cards", card["id"]),
                                 ("OMNI_UNIQ_NOTE_77", "notes", note["id"])):
            data = client.get(f"/api/search?q={term}&scope=all&limit=25").get_json()
            ids = [row["id"] for row in data[group]]
            assert eid in ids, (term, group, ids)

    def test_search_scope_filters_groups(self, client):
        tok = _token(client, "agent@opsdesk.local")
        _create_issue(client, tok, subject="SCOPE_UNIQ_ISSUE_88",
                      desc="x")
        data = client.get("/api/search?q=SCOPE_UNIQ_ISSUE_88&scope=cards").get_json()
        assert data["issues"] == [] and data["notes"] == [] and data["cards"] == []


# ---------------------------------------------------------------------------
# Promote Jira issue -> KB note (cross-module data flow)
# ---------------------------------------------------------------------------
class TestPromoteIssueToKb:
    def test_promote_creates_linked_kb_note(self, client):
        tok = _token(client, "agent@opsdesk.local")
        issue = _create_issue(client, tok, subject="Promote me bravo",
                              desc="bravo description")

        r = client.post(f"/api/jira/issues/{issue['id']}/promote-kb",
                        headers={"X-CSRF-Token": tok})
        assert r.status_code == 201
        note = r.get_json()["note"]
        assert note["id"]

        notes = client.get("/api/kb/notes").get_json()["items"]
        match = [n for n in notes if n["id"] == note["id"]]
        assert match, "promoted note missing from /api/kb/notes"
        assert (str(issue["id"]) in (match[0]["content"] or "")
                or match[0]["title"] == "Promote me bravo")

        know = client.get(
            f"/api/jira/issues/{issue['id']}/knowledge").get_json()
        assert any(n["id"] == note["id"] for n in know["notes"])


# ---------------------------------------------------------------------------
# Trello card <-> Jira issue (entity links, both directions)
# ---------------------------------------------------------------------------
class TestCardIssueLink:
    def test_card_issue_link_bidirectional(self, client):
        tok = _token(client, "agent@opsdesk.local")
        issue = _create_issue(client, tok, subject="Card link charlie",
                              desc="charlie")
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        card = _card(client, tok, l["id"], "Card charlie")

        r = _link(client, tok, "trello_card", card["id"],
                  "jira_issue", issue["id"])
        assert r.status_code in (200, 201)

        fwd = client.get(
            f"/api/entity-links?source_type=trello_card&source_id={card['id']}"
        ).get_json()
        assert any(l["target_type"] == "jira_issue" and l["target_id"] == issue["id"]
                   for l in fwd["links"])

        rev = client.get(
            f"/api/entity-links?source_type=jira_issue&source_id={issue['id']}"
        ).get_json()
        assert any(l["source_type"] == "trello_card" and l["source_id"] == card["id"]
                   for l in rev["links"])


# ---------------------------------------------------------------------------
# Cross-module notification side effect (card assignment -> member notified)
# ---------------------------------------------------------------------------
class TestCrossModuleNotification:
    def test_card_assignment_notifies_member(self, client):
        tok = _token(client, "agent@opsdesk.local")
        ws = _ws(client, tok)
        b = _board(client, tok, ws["id"])
        l = _list(client, tok, b["id"])
        card = _card(client, tok, l["id"], "Notify delta")

        # manager must be a workspace member before being added to a card
        r = client.post(f"/api/trello/workspaces/{ws['id']}/members",
                        json={"user_id": 2, "role": "member"},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code in (200, 201)
        r = client.post(f"/api/trello/cards/{card['id']}/members",
                        json={"user_id": 2},
                        headers={"X-CSRF-Token": tok})
        assert r.status_code in (200, 201)

        mgr_tok = _token(client, "manager@opsdesk.local")
        notifs = client.get("/api/notifications",
                            headers={"X-CSRF-Token": mgr_tok}).get_json()
        items = notifs.get("notifications", notifs.get("items", []))
        assert any(n.get("kind") == "card_assigned"
                   and n.get("entity_id") == card["id"]
                   for n in items)


# ---------------------------------------------------------------------------
# KB note discoverable through search after creation (KB <-> search seam)
# ---------------------------------------------------------------------------
class TestKbSearchSeam:
    def test_published_note_appears_in_search(self, client):
        tok = _token(client, "agent@opsdesk.local")
        note = _create_note(client, tok, title="Searchable echo",
                            content="echo body")
        assert client.post(f"/api/kb/{note['id']}/publish",
                           headers={"X-CSRF-Token": tok}).status_code == 200

        data = client.get("/api/search?q=Searchable echo&scope=notes").get_json()
        ids = [n["id"] for n in data["notes"]]
        assert note["id"] in ids
