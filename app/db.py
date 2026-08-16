"""
Database layer for OpsDesk.

A single SQLite file is used. This module owns:
  * opening connections
  * creating the schema on first run (init_db)
  * seeding starter teams, categories, and an admin user

All other modules import `get_db()` to talk to SQLite. No ORM is used so
the code stays readable and easy to edit.
"""
import sqlite3
from datetime import datetime, timezone

from . import config

# A module-level connection is fine for a single-process dev server.
_conn = None


def get_db():
    """Return the shared SQLite connection, opening it on first use."""
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row  # rows behave like dicts
        _conn.execute("PRAGMA foreign_keys = ON")
    return _conn


def now_iso():
    """Current UTC timestamp as ISO string. Used for all created/updated_at."""
    return datetime.now(timezone.utc).isoformat()


def init_db():
    """Create tables if they do not exist, then seed starter data."""
    db = get_db()
    db.executescript(SCHEMA)
    db.commit()
    _seed(db)


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
    active      INTEGER NOT NULL DEFAULT 1
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
    cats = [
        ("Access & Accounts", "Logins, permissions, provisioning", 1),
        ("Hardware", "Laptops, peripherals, equipment", 1),
        ("Software", "Installs, licenses, bugs", 1),
        ("HR Request", "Leave, payroll, policy", 1),
        ("Finance", "Invoices, expenses, budgets", 1),
        ("Other", "Anything that does not fit above", 1),
    ]
    for name, desc, active in cats:
        db.execute(
            "INSERT INTO categories (name, description, active) VALUES (?,?,?)",
            (name, desc, active),
        )

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


def _hash(plain):
    """Hash a password using Werkzeug's pbkdf2 helper (no extra deps)."""
    from werkzeug.security import generate_password_hash
    return generate_password_hash(plain)
