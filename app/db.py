"""
Database layer for OpsDesk.

A single SQLite file is used. This module owns:
  * opening connections
  * creating the schema on first run (init_db)
  * seeding starter teams, categories, and an admin user

All other modules import `get_db()` to talk to SQLite. No ORM is used so
the code stays readable and easy to edit.
"""
import os
import sqlite3
from datetime import datetime, timezone

from flask import g

from . import config

# Connections are created PER REQUEST and stored on Flask's `g` (request
# context). This fixes the old module-level single connection, which was a
# latent threading bug even in dev (check_same_thread=False masked it) and
# would not survive a multi-worker deploy. SQLite runs in WAL mode as a
# single-writer process — that is the supported deploy model (see PLAN.md).


def get_db():
    """Return a SQLite connection for the current request/app context.

    Uses Flask `g` so each request gets its own connection; the teardown
    (close_db) closes it. Outside a request context this raises, which is
    intentional — callers should run inside an app context.
    """
    if "db" not in g:
        os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row  # rows behave like dicts
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")  # single-writer safe
        g.db = conn
    return g.db


def close_db(e=None):
    """Close the per-request connection (registered as teardown)."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso():
    """Current UTC timestamp as ISO string. Used for all created/updated_at."""
    return datetime.now(timezone.utc).isoformat()


def init_db():
    """Create tables if they do not exist, then seed starter data."""
    db = get_db()
    db.executescript(SCHEMA)
    db.commit()
    _seed(db)
    _migrate(db)


SCHEMA = """
CREATE TABLE IF NOT EXISTS teams (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    email    TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,            -- hashed
    role     TEXT NOT NULL,            -- requester|agent|manager|admin
    team_id  INTEGER REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    default_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tickets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_ref     TEXT NOT NULL UNIQUE,   -- human-readable e.g. OPS-1042
    subject         TEXT NOT NULL,
    description     TEXT,
    category_id     INTEGER REFERENCES categories(id),
    requester_id    INTEGER NOT NULL REFERENCES users(id),
    assignee_id     INTEGER REFERENCES users(id),
    team_id         INTEGER REFERENCES teams(id),
    priority        TEXT NOT NULL DEFAULT 'normal',
    status          TEXT NOT NULL DEFAULT 'new',
    blocked_reason  TEXT,
    reopen_count    INTEGER NOT NULL DEFAULT 0,
    csat            INTEGER,               -- requester satisfaction 1-5
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    resolved_at     TEXT,
    closed_at       TEXT
);

CREATE TABLE IF NOT EXISTS ticket_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id  INTEGER REFERENCES users(id),
    body       TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public',  -- public|internal
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id),
    filename    TEXT NOT NULL,
    file_size   INTEGER,
    storage_path TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id    INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT,
    note        TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id  INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,        -- assigned|resolved|internal_note|etc.
    message    TEXT NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at TEXT NOT NULL,        -- UTC ISO
    used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kb_articles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    author_id    INTEGER REFERENCES users(id),
    status       TEXT NOT NULL DEFAULT 'draft',   -- draft|published
    views        INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS sla_policies (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    priority         TEXT NOT NULL DEFAULT 'normal',
    category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    response_hours   REAL NOT NULL,
    resolution_hours REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_sla (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id        INTEGER NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id        INTEGER REFERENCES sla_policies(id),
    first_response_at TEXT,
    breach_at        TEXT NOT NULL,
    breached         INTEGER NOT NULL DEFAULT 0,
    response_met     INTEGER,
    resolution_met   INTEGER
);

CREATE TABLE IF NOT EXISTS kb_feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    helpful    INTEGER NOT NULL,      -- 1 = yes, 0 = no
    comment    TEXT,
    created_at TEXT NOT NULL
);
"""


def _seed(db):
    """Insert starter teams, categories and one admin user if tables empty."""
    # Idempotent: only seed if there are no users yet.
    if db.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"] > 0:
        return

    # Teams
    teams = ["IT", "HR", "Ops", "Finance"]
    team_ids = {}
    for t in teams:
        cur = db.execute("INSERT INTO teams (name) VALUES (?)", (t,))
        team_ids[t] = cur.lastrowid

    # Categories
    cat_teams = {
        "Access & Accounts": "IT",
        "Hardware": "IT",
        "Software": "IT",
        "HR Request": "HR",
        "Finance": "Finance",
        "Other": "Ops",
    }
    cats = [
        ("Access & Accounts", "Logins, permissions, provisioning"),
        ("Hardware", "Laptops, peripherals, equipment"),
        ("Software", "Installs, licenses, bugs"),
        ("HR Request", "Leave, payroll, policy"),
        ("Finance", "Invoices, expenses, budgets"),
        ("Other", "Anything that does not fit above"),
    ]
    team_by_name = {n: i for n, i in team_ids.items()}
    for name, desc in cats:
        cur = db.execute(
            "INSERT INTO categories (name, description, active, default_team_id) VALUES (?,?,?,?)",
            (name, desc, 1, team_by_name.get(cat_teams.get(name))))

    # Starter users. Password for every seeded account is "password".
    # In production you would change these immediately.
    users = [
        ("Admin User", "admin@opsdesk.local", "admin", None),
        ("Ops Manager", "manager@opsdesk.local", "manager", None),
        ("IT Agent", "agent@opsdesk.local", "agent", team_ids["IT"]),
        ("HR Agent", "hragent@opsdesk.local", "agent", team_ids["HR"]),
        ("Sam Requester", "sam@opsdesk.local", "requester", team_ids["IT"]),
    ]
    for name, email, role, team_id in users:
        db.execute(
            "INSERT INTO users (name, email, password, role, team_id) VALUES (?,?,?,?,?)",
            (name, email, _hash("password"), role, team_id),
        )

    db.commit()

    # Sample SLA policies (one per priority + a couple category-specific).
    if db.execute("SELECT COUNT(*) AS c FROM sla_policies").fetchone()["c"] == 0:
        db.executemany(
            "INSERT INTO sla_policies (name, priority, category_id, response_hours, resolution_hours) VALUES (?,?,?,?,?)",
            [
                ("Standard", "normal", None, 8, 72),
                ("Urgent", "urgent", None, 1, 8),
                ("HR - normal", "normal", _cat_id(db, "HR Request"), 4, 48),
                ("Finance - normal", "normal", _cat_id(db, "Finance"), 4, 48),
            ])
    db.commit()


def _cat_id(db, name):
    row = db.execute("SELECT id FROM categories WHERE name=?", (name,)).fetchone()
    return row["id"] if row else None

def _migrate(db):
    cols = [r[1] for r in db.execute("PRAGMA table_info(categories)").fetchall()]
    if "default_team_id" not in cols:
        db.execute("ALTER TABLE categories ADD COLUMN default_team_id INTEGER REFERENCES teams(id)")
    fb_cols = [r[1] for r in db.execute("PRAGMA table_info(kb_feedback)").fetchall()]
    if "user_id" not in fb_cols:
        db.execute("ALTER TABLE kb_feedback ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL")
    t_cols = [r[1] for r in db.execute("PRAGMA table_info(tickets)").fetchall()]
    if "csat" not in t_cols:
        db.execute("ALTER TABLE tickets ADD COLUMN csat INTEGER")
    u_cols = [r[1] for r in db.execute("PRAGMA table_info(users)").fetchall()]
    if "ai_key" not in u_cols:
        db.execute("ALTER TABLE users ADD COLUMN ai_key TEXT")
    if "ai_model" not in u_cols:
        db.execute("ALTER TABLE users ADD COLUMN ai_model TEXT")
    link_table = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_kb_links'").fetchone()
    if not link_table:
        db.execute("""
            CREATE TABLE ticket_kb_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
                linked_by_id INTEGER REFERENCES users(id),
                note TEXT,
                created_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS ticket_kb_unique ON ticket_kb_links(ticket_id, article_id)")
    coll_table = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='kb_collections'").fetchone()
    if not coll_table:
        db.execute("""
            CREATE TABLE kb_collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                owner_id INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE kb_collection_articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_id INTEGER NOT NULL REFERENCES kb_collections(id) ON DELETE CASCADE,
                article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS kb_collection_article_unique ON kb_collection_articles(collection_id, article_id)")
    version_table = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='kb_article_versions'").fetchone()
    if not version_table:
        db.execute("""
            CREATE TABLE kb_article_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                category_id INTEGER,
                status TEXT NOT NULL,
                created_by INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL
            )
        """)
    link_table = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='kb_article_links'").fetchone()
    if not link_table:
        db.execute("""
            CREATE TABLE kb_article_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
                target_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
                created_by INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS kb_article_link_unique ON kb_article_links(source_id, target_id)")
    team_by_name = {r["name"]: r["id"] for r in db.execute("SELECT id, name FROM teams").fetchall()}
    cat_teams = {"Access & Accounts": "IT", "Hardware": "IT", "Software": "IT",
                 "HR Request": "HR", "Finance": "Finance", "Other": "Ops"}
    for name, team in cat_teams.items():
        db.execute("UPDATE categories SET default_team_id=? WHERE name=? AND default_team_id IS NULL",
                   (team_by_name.get(team), name))
    if db.execute("SELECT COUNT(*) AS c FROM sla_policies").fetchone()["c"] == 0:
        db.executemany(
            "INSERT INTO sla_policies (name, priority, category_id, response_hours, resolution_hours) VALUES (?,?,?,?,?)",
            [
                ("Standard", "normal", None, 8, 72),
                ("Urgent", "urgent", None, 1, 8),
                ("HR - normal", "normal", _cat_id(db, "HR Request"), 4, 48),
                ("Finance - normal", "normal", _cat_id(db, "Finance"), 4, 48),
            ])
    db.commit()


def _hash(plain):
    """Hash a password using Werkzeug's pbkdf2 helper (no extra deps)."""
    from werkzeug.security import generate_password_hash
    return generate_password_hash(plain)
