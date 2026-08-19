"""
Migration tests (Master Plan §13.1): legacy OpsDesk DB -> unified schema.

Builds a REAL legacy-format database (using the still-present legacy schema),
seeds it with edge cases that broke the plan's naive SQL:
  * ticket_ref NOT equal to 'OPS-<id>' (ticket 17 -> OPS-0014)
  * duplicate KB article titles across categories (UNIQUE(folder,title) trap)
  * a full spread of child rows (comments, attachments, activity, followers,
    sla, notifications, kb feedback/versions/links, collections, links)
then boots the app and verifies the migration is atomic, complete, and
idempotent (running again must not duplicate anything).
"""
import os
import sqlite3
import tempfile

import pytest

# Make the project importable as a package.
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db as dbmod, config


def _build_legacy_db(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(dbmod.LEGACY_SCHEMA)
    dbmod._migrate(conn)  # legacy column fixes + ticket_kb_links/kb_collections/etc.

    # users / teams / categories (minimal, matching _seed's shape)
    conn.execute("INSERT INTO users (name, email, password, role, team_id) VALUES (?,?,?,?,?)",
                 ("Admin", "admin@ops.local", "x", "admin", None))
    conn.execute("INSERT INTO users (name, email, password, role, team_id) VALUES (?,?,?,?,?)",
                 ("Agent", "agent@ops.local", "x", "agent", None))
    conn.execute("INSERT INTO users (name, email, password, role, team_id) VALUES (?,?,?,?,?)",
                 ("Sam", "sam@ops.local", "x", "requester", None))
    conn.execute("INSERT INTO teams (name) VALUES ('IT')")
    conn.execute("INSERT INTO categories (name, description, active, default_team_id) VALUES (?,?,?,?)",
                 ("Hardware", "hw", 1, 1))
    conn.execute("INSERT INTO categories (name, description, active, default_team_id) VALUES (?,?,?,?)",
                 ("Network", "net", 1, 1))
    conn.commit()

    # 3 tickets; #3 has a ref that does NOT match 'OPS-0003'
    for i in (1, 2, 3):
        conn.execute(
            """INSERT INTO tickets (ticket_ref, subject, description, category_id,
               requester_id, assignee_id, team_id, priority, status, reopen_count,
               created_at, updated_at, resolved_at, closed_at, csat)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"OPS-{i:04d}", f"Subject {i}", f"Desc {i}", 1, 3, 2, 1,
             "normal", "resolved" if i == 1 else "new", 1,
             "2026-01-01T10:00:00+00:00", "2026-01-01T10:00:00+00:00",
             "2026-01-01T12:00:00+00:00" if i == 1 else None,
             "2026-01-02T10:00:00+00:00" if i == 1 else None, 5 if i == 1 else None))
    conn.execute(
        "UPDATE tickets SET ticket_ref='OPS-0014' WHERE id=3")

    conn.execute("INSERT INTO ticket_comments (ticket_id, author_id, body, visibility, created_at) VALUES (?,?,?,?,?)",
                 (1, 2, "public note", "public", "2026-01-01T11:00:00+00:00"))
    conn.execute("INSERT INTO ticket_comments (ticket_id, author_id, body, visibility, created_at) VALUES (?,?,?,?,?)",
                 (1, 2, "internal note", "internal", "2026-01-01T11:30:00+00:00"))
    conn.execute("INSERT INTO ticket_attachments (ticket_id, uploaded_by, filename, file_size, storage_path, created_at) VALUES (?,?,?,?,?,?)",
                 (1, 2, "a.png", 100, "/tmp/a.png", "2026-01-01T11:00:00+00:00"))
    conn.execute("INSERT INTO ticket_activity (ticket_id, actor_id, action, from_status, to_status, note, created_at) VALUES (?,?,?,?,?,?,?)",
                 (1, 2, "status_change", "new", "resolved", "done", "2026-01-01T11:00:00+00:00"))
    conn.execute("INSERT INTO ticket_followers (ticket_id, user_id, created_at) VALUES (?,?,?)",
                 (1, 2, "2026-01-01T11:00:00+00:00"))
    conn.execute("INSERT INTO sla_policies (name, priority, response_hours, resolution_hours) VALUES (?,?,?,?)",
                 ("Standard", "normal", 8, 72))
    conn.execute("INSERT INTO ticket_sla (ticket_id, policy_id, first_response_at, breach_at, breached, response_met, resolution_met) VALUES (?,?,?,?,?,?,?)",
                 (1, 1, "2026-01-01T11:00:00+00:00", "2026-01-04T10:00:00+00:00", 0, 1, 1))
    conn.execute("INSERT INTO notifications (user_id, ticket_id, kind, message, read, created_at) VALUES (?,?,?,?,?,?)",
                 (3, 1, "resolved", "Your issue was resolved", 0, "2026-01-01T12:00:00+00:00"))

    # KB: two articles with the SAME title in the SAME category (the
    # UNIQUE(folder_id, title) trap), plus a third with no category.
    conn.execute("INSERT INTO kb_articles (title, body, category_id, author_id, status, views, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                 ("VPN guide", "step 1", 2, 2, "published", 10,
                  "2026-01-01T09:00:00+00:00", "2026-01-01T09:00:00+00:00"))
    conn.execute("INSERT INTO kb_articles (title, body, category_id, author_id, status, views, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                 ("VPN guide", "step 1b", 2, 2, "published", 5,
                  "2026-01-01T09:30:00+00:00", "2026-01-01T09:30:00+00:00"))
    conn.execute("INSERT INTO kb_articles (title, body, category_id, author_id, status, views, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                 ("Unique", "body", None, 2, "draft", 1,
                  "2026-01-01T10:00:00+00:00", "2026-01-01T10:00:00+00:00"))
    conn.execute("INSERT INTO kb_article_versions (article_id, title, body, category_id, status, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
                 (1, "VPN guide", "old", 2, "published", 2, "2025-12-31T00:00:00+00:00"))
    conn.execute("INSERT INTO kb_article_links (source_id, target_id, created_by, created_at) VALUES (?,?,?,?)",
                 (1, 2, 2, "2026-01-01T09:40:00+00:00"))
    conn.execute("INSERT INTO kb_feedback (article_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?)",
                 (1, 3, 1, "great", "2026-01-01T11:00:00+00:00"))
    conn.execute("INSERT INTO kb_feedback (article_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?)",
                 (1, 3, 0, "meh", "2026-01-01T11:05:00+00:00"))
    conn.execute("INSERT INTO kb_collections (name, description, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)",
                 ("Coll", "d", 2, "2026-01-01T10:00:00+00:00", "2026-01-01T10:00:00+00:00"))
    conn.execute("INSERT INTO kb_collection_articles (collection_id, article_id, position, created_at) VALUES (?,?,?,?)",
                 (1, 1, 0, "2026-01-01T10:00:00+00:00"))
    conn.execute("INSERT INTO ticket_kb_links (ticket_id, article_id, linked_by_id, note, created_at) VALUES (?,?,?,?,?)",
                 (1, 1, 2, "relevant", "2026-01-01T11:00:00+00:00"))
    conn.commit()
    conn.close()


@pytest.fixture
def legacy_app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    _build_legacy_db(path)
    os.environ["OPERADESK_SECRET"] = "test-secret"
    config.DB_PATH = path
    application = create_app()
    application.config["TESTING"] = True
    yield path, application
    for f in (path, path + "-wal", path + "-shm"):
        try:
            os.remove(f)
        except OSError:
            pass


def test_legacy_tables_renamed_to_backup(legacy_app):
    path, app = legacy_app
    conn = sqlite3.connect(path)
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    # Phase 7: _backup_* tables are dropped after a successful migration.
    assert "_backup_tickets" not in tables
    assert "_backup_kb_articles" not in tables
    assert "_backup_notifications" not in tables
    assert "tickets" not in tables          # legacy names are gone
    assert "kb_articles" not in tables
    assert "jira_issues" in tables
    assert "kb_notes" in tables             # new KB table present
    conn.close()


def test_all_rows_migrated_without_loss(legacy_app):
    path, app = legacy_app
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    checks = {
        "jira_issues": 3,
        "entity_comments": 2,
        "entity_attachments": 1,
        "entity_activity": 1,
        "entity_followers": 1,
        "issue_sla": 1,
        "notifications_v2": 1,
        "entity_links": 1,
        "kb_notes": 3,
        "kb_note_versions": 1,
        "kb_wikilinks": 1,
        "kb_note_feedback": 2,
        "kb_collections_v2": 1,
        "kb_collection_notes": 1,
    }
    for table, expected in checks.items():
        n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        assert n == expected, f"{table}: {n} != {expected}"
    conn.close()


def test_issue_keys_preserve_real_refs(legacy_app):
    """ticket_ref OPS-0014 (not OPS-0003) must be preserved exactly."""
    path, app = legacy_app
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    keys = {r["issue_key"] for r in conn.execute("SELECT issue_key FROM jira_issues")}
    assert keys == {"OPS-0001", "OPS-0002", "OPS-0014"}
    # and the requester/csat/timestamps made it across
    row = conn.execute("SELECT * FROM jira_issues WHERE issue_key='OPS-0001'").fetchone()
    assert row["requester_id"] == 3
    assert row["assignee_id"] == 2
    assert row["csat"] == 5
    assert row["resolved_at"] is not None
    assert row["issue_type"] == "Task"
    conn.close()


def test_next_seq_above_migrated_max(legacy_app):
    path, app = legacy_app
    conn = sqlite3.connect(path)
    nxt = conn.execute(
        "SELECT next_seq FROM jira_projects WHERE key='OPS'").fetchone()[0]
    assert nxt == 15            # max migrated key is OPS-0014 -> 15
    conn.close()


def test_duplicate_kb_titles_deduped_per_folder(legacy_app):
    path, app = legacy_app
    conn = sqlite3.connect(path)
    rows = conn.execute("SELECT title, folder_id FROM kb_notes ORDER BY id").fetchall()
    titles = [r[0] for r in rows]
    # Both legacy articles had the same title and the same category, so they
    # land in the same folder — the second copy must be renamed.
    assert titles.count("VPN guide") == 1
    assert "VPN guide (2)" in titles
    assert len({r[1] for r in rows if r[0].startswith("VPN guide")}) == 1
    # General folder for the uncategorized article, Network for the VPN pair
    folders = conn.execute("SELECT name, parent_id FROM kb_folders").fetchall()
    names = {f[0] for f in folders}
    assert "General" in names and "Network" in names
    conn.close()


def test_kb_feedback_rollup_and_links(legacy_app):
    path, app = legacy_app
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    note = conn.execute(
        "SELECT * FROM kb_notes WHERE title='VPN guide'").fetchone()
    assert note["helpful_yes"] == 1
    assert note["helpful_no"] == 1
    wl = conn.execute("SELECT source_note_id, target_note_id FROM kb_wikilinks").fetchone()
    src = conn.execute("SELECT id FROM kb_notes WHERE title='VPN guide'").fetchone()[0]
    tgt = conn.execute("SELECT id FROM kb_notes WHERE title='VPN guide (2)'").fetchone()[0]
    assert (wl["source_note_id"], wl["target_note_id"]) == (src, tgt)
    el = conn.execute(
        "SELECT source_type, source_id, target_type, target_id FROM entity_links").fetchone()
    assert el["source_type"] == "jira_issue" and el["target_type"] == "kb_note"
    conn.close()


def test_migration_is_idempotent(legacy_app):
    path, app = legacy_app
    # A second boot must not duplicate or re-rename anything.
    from app import db as dbmod2
    with app.app_context():
        dbmod2.init_db()
    conn = sqlite3.connect(path)
    assert conn.execute("SELECT COUNT(*) FROM jira_issues").fetchone()[0] == 3
    assert conn.execute("SELECT COUNT(*) FROM kb_notes").fetchone()[0] == 3
    assert conn.execute("SELECT COUNT(*) FROM entity_comments").fetchone()[0] == 2
    conn.close()


def test_fresh_db_skips_migration_cleanly():
    """A brand-new database gets the new schema without legacy noise."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["OPERADESK_SECRET"] = "test-secret"
    config.DB_PATH = path
    application = create_app()
    conn = sqlite3.connect(path)
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert "jira_issues" in tables
    assert "_backup_tickets" not in tables
    assert "tickets" in tables      # legacy schema still created for compat
    assert "users" in tables
    conn.close()
    for f in (path, path + "-wal", path + "-shm"):
        try:
            os.remove(f)
        except OSError:
            pass