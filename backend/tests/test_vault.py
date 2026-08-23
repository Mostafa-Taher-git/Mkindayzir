"""
Test cases: vault — folders, notes, versioning, tags, search, RBAC.

TC-VLT-01  folder create/list/get
TC-VLT-02  note CRUD round-trip
TC-VLT-03  content update snapshots a version and bumps note.version
TC-VLT-04  no-change update does NOT create a version
TC-VLT-05  publish/archive transitions
TC-VLT-06  search finds by title/content
TC-VLT-07  MEMBER cannot manage:vault (folder create 403) but can read
TC-VLT-08  tags CRUD
TC-VLT-09  feedback add + list
TC-VLT-10  backlinks endpoint returns list
"""
from conftest import ADMIN, MEMBER, VIEWER, setup_users, login


def test_tc_vlt_01_folder_lifecycle(client):
    setup_users(client); login(client, ADMIN)
    r = client.post("/api/vault/folders", json={"name": "Ops"})
    assert r.status_code == 201, r.text
    fid = (r.json().get("folder") or r.json())["id"]
    lst = client.get("/api/vault/folders").json()
    assert any(f["id"] == fid for f in lst["folders"])
    got = client.get(f"/api/vault/folders/{fid}")
    assert got.status_code == 200


def test_tc_vlt_02_note_crud(client):
    setup_users(client); login(client, ADMIN)
    r = client.post("/api/vault/notes", json={"title": "Runbook", "content": "restart the thing"})
    assert r.status_code == 201
    nid = (r.json().get("note") or r.json())["id"]
    got = client.get(f"/api/vault/notes/{nid}").json()
    note = got.get("note") or got
    assert note["title"] == "Runbook"
    patched = client.patch(f"/api/vault/notes/{nid}", json={"excerpt": "how to restart"})
    assert patched.status_code == 200


def test_tc_vlt_03_content_update_creates_version(client):
    setup_users(client); login(client, ADMIN)
    nid = (client.post("/api/vault/notes", json={"title": "V", "content": "v1 body"}).json().get("note")
           or client.post("/api/vault/notes", json={"title": "V", "content": "v1 body"}).json())["id"]
    r = client.patch(f"/api/vault/notes/{nid}", json={"content": "v2 body"})
    assert r.status_code == 200
    note = (r.json().get("note") or r.json())
    assert note["version"] >= 2
    versions = client.get(f"/api/vault/notes/{nid}/versions").json()["versions"]
    assert len(versions) >= 1
    assert any(v["content"] == "v1 body" for v in versions)


def test_tc_vlt_04_no_change_no_version(client):
    setup_users(client); login(client, ADMIN)
    resp = client.post("/api/vault/notes", json={"title": "Static", "content": "same"})
    nid = (resp.json().get("note") or resp.json())["id"]
    client.patch(f"/api/vault/notes/{nid}", json={"content": "same"})   # no actual change
    versions = client.get(f"/api/vault/notes/{nid}/versions").json()["versions"]
    assert len(versions) == 0


def test_tc_vlt_05_publish_archive(client):
    setup_users(client); login(client, ADMIN)
    resp = client.post("/api/vault/notes", json={"title": "P", "content": "x"})
    nid = (resp.json().get("note") or resp.json())["id"]
    pub = client.post(f"/api/vault/notes/{nid}/publish").json()
    assert (pub.get("note") or pub)["status"] == "PUBLISHED"
    arc = client.post(f"/api/vault/notes/{nid}/archive").json()
    assert (arc.get("note") or arc)["status"] == "ARCHIVED"


def test_tc_vlt_06_search(client):
    setup_users(client); login(client, ADMIN)
    client.post("/api/vault/notes", json={"title": "Grafana setup", "content": "dashboards"})
    hits = client.get("/api/vault/search", params={"q": "grafana"}).json()["results"]
    assert len(hits) >= 1


def test_tc_vlt_07_member_read_only_vault(client):
    setup_users(client)
    login(client, ADMIN)
    client.post("/api/vault/notes", json={"title": "Shared", "content": "c"})
    login(client, MEMBER)
    assert client.get("/api/vault/notes").status_code == 200          # read ok
    assert client.post("/api/vault/folders", json={"name": "nope"}).status_code == 403  # manage blocked


def test_tc_vlt_08_tags_crud(client):
    setup_users(client); login(client, ADMIN)
    r = client.post("/api/vault/tags", json={"name": "infra", "color": "#ff0000"})
    assert r.status_code == 201, r.text
    tid = (r.json().get("tag") or r.json())["id"]
    lst = client.get("/api/vault/tags").json()
    assert any(t["id"] == tid for t in lst["tags"])
    upd = client.patch(f"/api/vault/tags/{tid}", json={"color": "#00ff00"})
    assert upd.status_code == 200
    assert client.delete(f"/api/vault/tags/{tid}").status_code == 200


def test_tc_vlt_09_feedback(client):
    setup_users(client); login(client, ADMIN)
    resp = client.post("/api/vault/notes", json={"title": "FB", "content": "x"})
    nid = (resp.json().get("note") or resp.json())["id"]
    r = client.post(f"/api/vault/notes/{nid}/feedback", json={"helpful": True})
    assert r.status_code == 201
    fb = client.get(f"/api/vault/notes/{nid}/feedback").json()["feedback"]
    assert len(fb) >= 1 and fb[0]["helpful"] is True


def test_tc_vlt_10_backlinks(client):
    setup_users(client); login(client, ADMIN)
    resp = client.post("/api/vault/notes", json={"title": "BL", "content": "x"})
    nid = (resp.json().get("note") or resp.json())["id"]
    r = client.get(f"/api/vault/notes/{nid}/backlinks")
    assert r.status_code == 200 and isinstance(r.json()["backlinks"], list)
