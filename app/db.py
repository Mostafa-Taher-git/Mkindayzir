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
    """Create tables if they do not exist, then seed starter data.

    Order matters:
      1. LEGACY_SCHEMA  — the original ticket/KB tables, kept so pre-Phase-0
         databases still open cleanly and can be migrated in place.
      2. _seed/_migrate — starter teams/users/categories + legacy column fixes.
      3. NEW_SCHEMA     — the unified OpsDesk Enterprise schema (jira, trello,
         kb notes, ai, shared entity_* tables).
      4. _migrate_v2    — atomic Phase-0 data migration (rename legacy tables
         to _backup_*, copy rows into the new tables, all in one transaction).
    """
    db = get_db()
    db.executescript(LEGACY_SCHEMA)
    db.commit()
    _seed(db)
    _migrate(db)
    db.executescript(NEW_SCHEMA)
    db.commit()
    _migrate_v2(db)
    _seed_workflow(db)
    _seed_default_project(db)


LEGACY_SCHEMA = """
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


# ---------------------------------------------------------------------------
# OpsDesk Enterprise unified schema (Master Plan §4).
# Created on every install; legacy databases are migrated into these tables
# by _migrate_v2(). All CREATEs are idempotent (IF NOT EXISTS).
# ---------------------------------------------------------------------------
NEW_SCHEMA = """
-- 4.1 Core & auth (preserved + extended)
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
    team_id  INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    ai_key   TEXT,                     -- AES-GCM encrypted OpenRouter key
    ai_model TEXT                      -- user's chosen model id
);

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    default_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    details     TEXT,               -- JSON of changed fields
    ip_address  TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

-- 4.2 Module 1: Jira Enterprise Suite
CREATE TABLE IF NOT EXISTS jira_projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    lead_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category    TEXT NOT NULL DEFAULT 'Software',
    next_seq    INTEGER NOT NULL DEFAULT 1,    -- for issue key generation
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jira_proj_lead ON jira_projects(lead_id);

CREATE TABLE IF NOT EXISTS jira_sprints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES jira_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    goal        TEXT,
    start_date  TEXT,
    end_date    TEXT,
    status      TEXT NOT NULL DEFAULT 'future',  -- future | active | closed
    velocity    INTEGER,                          -- calculated on close
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sprint_project ON jira_sprints(project_id);

-- Configurable workflow transitions. project_id NULL = the default scheme
-- (seeded from lifecycle.ALLOWED); a project-level row overrides the default
-- for the same (from_status, to_status) pair. Phase 1B builds the admin
-- "workflow scheme builder" UI on top of this table.
CREATE TABLE IF NOT EXISTS jira_workflow_transitions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER REFERENCES jira_projects(id) ON DELETE CASCADE,
    from_status     TEXT NOT NULL,
    to_status       TEXT NOT NULL,
    allowed_roles   TEXT NOT NULL DEFAULT '["agent","manager","admin"]', -- JSON array
    reason_required INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, from_status, to_status)
);
CREATE INDEX IF NOT EXISTS idx_wf_trans_project ON jira_workflow_transitions(project_id, from_status);

CREATE TABLE IF NOT EXISTS jira_goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_date TEXT,
    quarter     TEXT,
    status      TEXT NOT NULL DEFAULT 'on_track',
    progress    INTEGER NOT NULL DEFAULT 0,
    parent_id   INTEGER REFERENCES jira_goals(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jira_issues (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_key       TEXT NOT NULL UNIQUE,
    project_id      INTEGER NOT NULL REFERENCES jira_projects(id) ON DELETE CASCADE,
    issue_type      TEXT NOT NULL DEFAULT 'Task',   -- Epic | Story | Task | Bug | Subtask
    summary         TEXT NOT NULL,
    description     TEXT,
    priority        TEXT NOT NULL DEFAULT 'normal',
    status          TEXT NOT NULL DEFAULT 'new',
    category_id     INTEGER REFERENCES categories(id),
    requester_id    INTEGER NOT NULL REFERENCES users(id),
    assignee_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    team_id         INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    sprint_id       INTEGER REFERENCES jira_sprints(id) ON DELETE SET NULL,
    parent_issue_id INTEGER REFERENCES jira_issues(id) ON DELETE SET NULL,
    epic_id         INTEGER REFERENCES jira_issues(id) ON DELETE SET NULL,
    goal_id         INTEGER REFERENCES jira_goals(id) ON DELETE SET NULL,
    story_points    INTEGER,
    due_date        TEXT,
    blocked_reason  TEXT,
    reopen_count    INTEGER NOT NULL DEFAULT 0,
    csat            INTEGER,
    csat_comment    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    resolved_at     TEXT,
    closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_issue_project ON jira_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issue_status ON jira_issues(status);
CREATE INDEX IF NOT EXISTS idx_issue_assignee ON jira_issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issue_sprint ON jira_issues(sprint_id);
CREATE INDEX IF NOT EXISTS idx_issue_epic ON jira_issues(epic_id);
CREATE INDEX IF NOT EXISTS idx_issue_goal ON jira_issues(goal_id);
CREATE INDEX IF NOT EXISTS idx_issue_requester ON jira_issues(requester_id);
CREATE INDEX IF NOT EXISTS idx_issue_team ON jira_issues(team_id);

CREATE TABLE IF NOT EXISTS jira_issue_links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_issue_id INTEGER NOT NULL REFERENCES jira_issues(id) ON DELETE CASCADE,
    target_issue_id INTEGER NOT NULL REFERENCES jira_issues(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL,    -- blocks | is_blocked_by | duplicates | relates_to
    created_at      TEXT NOT NULL,
    UNIQUE(source_issue_id, target_issue_id, link_type)
);

CREATE TABLE IF NOT EXISTS sla_policies (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    priority         TEXT NOT NULL DEFAULT 'normal',
    category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    response_hours   REAL NOT NULL,
    resolution_hours REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_sla (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id         INTEGER NOT NULL UNIQUE REFERENCES jira_issues(id) ON DELETE CASCADE,
    policy_id        INTEGER REFERENCES sla_policies(id),
    first_response_at TEXT,
    breach_at        TEXT NOT NULL,
    breached         INTEGER NOT NULL DEFAULT 0,
    response_met     INTEGER,
    resolution_met   INTEGER
);

CREATE TABLE IF NOT EXISTS jira_workflow_schemes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER REFERENCES jira_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    transitions TEXT NOT NULL,      -- JSON: [{"from":"new","to":"in_progress","roles":["agent","admin"]}]
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jira_custom_field_defs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER REFERENCES jira_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    field_type  TEXT NOT NULL,       -- text | number | date | select | user
    options     TEXT,                -- JSON array for select type
    required    INTEGER NOT NULL DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jira_custom_field_values (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id    INTEGER NOT NULL REFERENCES jira_issues(id) ON DELETE CASCADE,
    field_id    INTEGER NOT NULL REFERENCES jira_custom_field_defs(id) ON DELETE CASCADE,
    value_text  TEXT,
    value_num   REAL,
    value_date  TEXT,
    UNIQUE(issue_id, field_id)
);

-- 4.3 Module 2: Trello Workspaces
CREATE TABLE IF NOT EXISTS trello_workspaces (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    owner_id    INTEGER NOT NULL REFERENCES users(id),
    visibility  TEXT NOT NULL DEFAULT 'workspace',  -- private | workspace | public
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trello_workspace_members (
    workspace_id INTEGER NOT NULL REFERENCES trello_workspaces(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member',     -- admin | member | viewer
    joined_at    TEXT NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS trello_boards (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES trello_workspaces(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    background   TEXT DEFAULT '#0079BF',
    is_starred   INTEGER NOT NULL DEFAULT 0,
    is_archived  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_workspace ON trello_boards(workspace_id);

CREATE TABLE IF NOT EXISTS trello_lists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id    INTEGER NOT NULL REFERENCES trello_boards(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    position    REAL NOT NULL DEFAULT 65535,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_list_board ON trello_lists(board_id);

CREATE TABLE IF NOT EXISTS trello_cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id     INTEGER NOT NULL REFERENCES trello_lists(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    position    REAL NOT NULL DEFAULT 65535,
    due_date    TEXT,
    is_complete INTEGER NOT NULL DEFAULT 0,
    cover_color TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_list ON trello_cards(list_id);

CREATE TABLE IF NOT EXISTS trello_card_members (
    card_id  INTEGER NOT NULL REFERENCES trello_cards(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, user_id)
);

CREATE TABLE IF NOT EXISTS trello_checklists (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id  INTEGER NOT NULL REFERENCES trello_cards(id) ON DELETE CASCADE,
    title    TEXT NOT NULL DEFAULT 'Checklist',
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trello_checklist_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL REFERENCES trello_checklists(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    is_checked   INTEGER NOT NULL DEFAULT 0,
    position     REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trello_labels (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES trello_boards(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    color    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trello_card_labels (
    card_id  INTEGER NOT NULL REFERENCES trello_cards(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES trello_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
);

-- 4.4 Module 3: Obsidian Knowledge Base
CREATE TABLE IF NOT EXISTS kb_folders (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    parent_id INTEGER REFERENCES kb_folders(id) ON DELETE CASCADE,
    UNIQUE(name, parent_id)
);

CREATE TABLE IF NOT EXISTS kb_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id   INTEGER REFERENCES kb_folders(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    frontmatter TEXT,
    author_id   INTEGER NOT NULL REFERENCES users(id),
    status      TEXT NOT NULL DEFAULT 'draft',  -- draft | published
    views       INTEGER NOT NULL DEFAULT 0,
    helpful_yes INTEGER NOT NULL DEFAULT 0,
    helpful_no  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE(folder_id, title)
);
CREATE INDEX IF NOT EXISTS idx_note_folder ON kb_notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_note_author ON kb_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_note_status ON kb_notes(status);

CREATE TABLE IF NOT EXISTS kb_wikilinks (
    source_note_id INTEGER NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
    target_note_id INTEGER NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
    alias          TEXT,
    created_at     TEXT NOT NULL,
    PRIMARY KEY (source_note_id, target_note_id)
);
CREATE INDEX IF NOT EXISTS idx_wikilink_target ON kb_wikilinks(target_note_id);

CREATE TABLE IF NOT EXISTS kb_tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS kb_note_tags (
    note_id INTEGER NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES kb_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_notetag_tag ON kb_note_tags(tag_id);

CREATE TABLE IF NOT EXISTS kb_note_versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id     INTEGER NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    saved_by_id INTEGER REFERENCES users(id),
    change_note TEXT,
    saved_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_note_feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    helpful    INTEGER NOT NULL,
    comment    TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_collections_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    owner_id    INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_collection_notes (
    collection_id INTEGER NOT NULL REFERENCES kb_collections_v2(id) ON DELETE CASCADE,
    note_id       INTEGER NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (collection_id, note_id)
);

-- 4.5 Module 4: AI Agent & Copilot
CREATE TABLE IF NOT EXISTS ai_conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aiconv_user ON ai_conversations(user_id);

CREATE TABLE IF NOT EXISTS ai_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,       -- user | assistant | tool_call | tool_result | system
    content         TEXT NOT NULL,
    tool_name       TEXT,
    tool_args       TEXT,
    tool_status     TEXT,                -- pending_confirm | approved | rejected | executed | failed
    tokens_prompt   INTEGER DEFAULT 0,
    tokens_completion INTEGER DEFAULT 0,
    cost_usd        REAL DEFAULT 0.0,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aimsg_conv ON ai_messages(conversation_id);

-- 4.6 Cross-cutting shared tables
CREATE TABLE IF NOT EXISTS entity_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,       -- jira_issue | trello_card | kb_note
    entity_id   INTEGER NOT NULL,
    author_id   INTEGER NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    visibility  TEXT NOT NULL DEFAULT 'public',  -- public | internal
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ecomment_entity ON entity_comments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS entity_attachments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,
    entity_id    INTEGER NOT NULL,
    uploaded_by  INTEGER NOT NULL REFERENCES users(id),
    filename     TEXT NOT NULL,
    file_size    INTEGER,
    storage_path TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eattach_entity ON entity_attachments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS entity_activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    actor_id    INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    detail      TEXT,               -- JSON with from/to values
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eactivity_entity ON entity_activity(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS entity_followers (
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id, user_id)
);

CREATE TABLE IF NOT EXISTS entity_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id   INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id   INTEGER NOT NULL,
    created_by  INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL,
    UNIQUE(source_type, source_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_elink_source ON entity_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_elink_target ON entity_links(target_type, target_id);

CREATE TABLE IF NOT EXISTS notifications_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT,               -- jira_issue | trello_card | kb_note | goal | ai_chat
    entity_id   INTEGER,
    kind        TEXT NOT NULL,
    message     TEXT NOT NULL,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications_v2(user_id, read);

CREATE TABLE IF NOT EXISTS user_milestones (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone_key TEXT NOT NULL,
    completed_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, milestone_key)
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
                ("Low", "low", None, 24, 168),
                ("Standard", "normal", None, 8, 72),
                ("High", "high", None, 2, 24),
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
    fol_table = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_followers'").fetchone()
    if not fol_table:
        db.execute("""
            CREATE TABLE ticket_followers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE (ticket_id, user_id)
            )
        """)
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
                ("Low", "low", None, 24, 168),
                ("Standard", "normal", None, 8, 72),
                ("High", "high", None, 2, 24),
                ("Urgent", "urgent", None, 1, 8),
                ("HR - normal", "normal", _cat_id(db, "HR Request"), 4, 48),
                ("Finance - normal", "normal", _cat_id(db, "Finance"), 4, 48),
            ])
    # Existing DBs from before the 4-level priority scale: backfill the
    # low/high policies so pick_policy has a priority match for them.
    for name, prio, resp, res in (("Low", "low", 24, 168), ("High", "high", 2, 24)):
        missing = db.execute("SELECT COUNT(*) AS c FROM sla_policies WHERE priority=?", (prio,)).fetchone()["c"]
        if missing == 0:
            db.execute(
                "INSERT INTO sla_policies (name, priority, category_id, response_hours, resolution_hours) VALUES (?,?,?,?,?)",
                (name, prio, None, resp, res))
    db.commit()


def _table_exists(db, name):
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _migrate_v2(db):
    """Phase-0 migration: legacy ticket/KB tables -> the unified schema.

    Atomic: legacy tables are renamed to _backup_* and their rows copied into
    the new tables inside a SINGLE transaction — any failure rolls everything
    back. Once the copy succeeds, the _backup_* tables are DROPPED (Phase 7).

    Idempotent: once the legacy 'tickets' table is renamed away, the
    migration is considered done and is a no-op on re-runs.

    The id mapping (ticket_id -> issue_id, article_id -> note_id) is built in
    Python from the real issue_key/title values because old ticket_refs are NOT
    guaranteed to equal 'OPS-<id>' (ticket 17 has ref OPS-0014) and article
    titles are NOT unique. The Master Plan's SQL used 'OPS-' || ticket_id,
    which would silently corrupt those rows.
    """
    import json as _json

    # Idempotent: run the migration ONLY when a legacy 'tickets' table is
    # still present (it is renamed away during a successful migration, so a
    # later run sees no 'tickets' and skips cleanly). This no longer keys off
    # the _backup_* tables, which are dropped at the end of a successful run.
    if not _table_exists(db, "tickets"):
        return
    # A brand-new install also has legacy tables (created empty by
    # LEGACY_SCHEMA); there is nothing to migrate — keep the DB pristine.
    if db.execute("SELECT COUNT(*) AS c FROM tickets").fetchone()["c"] == 0:
        return

    now = now_iso()
    # Legacy table -> backup table name (all renames happen up front).
    RENAMES = {
        "tickets": "_backup_tickets",
        "ticket_comments": "_backup_ticket_comments",
        "ticket_attachments": "_backup_ticket_attachments",
        "ticket_activity": "_backup_ticket_activity",
        "ticket_followers": "_backup_ticket_followers",
        "ticket_sla": "_backup_ticket_sla",
        "ticket_kb_links": "_backup_ticket_kb_links",
        "kb_articles": "_backup_kb_articles",
        "kb_article_versions": "_backup_kb_article_versions",
        "kb_article_links": "_backup_kb_article_links",
        "kb_feedback": "_backup_kb_feedback",
        "kb_collections": "_backup_kb_collections",
        "kb_collection_articles": "_backup_kb_collection_articles",
        "notifications": "_backup_notifications",
    }
    try:
        db.execute("BEGIN")
        for old, backup in RENAMES.items():
            if _table_exists(db, old):
                db.execute(f"ALTER TABLE {old} RENAME TO {backup}")

        # --- Jira: default project + issues ---------------------------------
        admin = db.execute(
            "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
        cur = db.execute(
            """INSERT INTO jira_projects (key, name, description, lead_id, category, created_at)
               VALUES ('OPS', 'Operations Desk',
                       'Migrated from legacy ticket system', ?, 'Service Desk', ?)""",
            (admin["id"] if admin else None, now),
        )
        ops_project_id = cur.lastrowid

        issue_by_ticket_id = {}
        for t in db.execute("SELECT * FROM _backup_tickets").fetchall():
            cur = db.execute(
                """INSERT INTO jira_issues (
                       issue_key, project_id, issue_type, summary, description,
                       category_id, requester_id, assignee_id, team_id,
                       priority, status, blocked_reason, reopen_count,
                       story_points, due_date, csat, csat_comment,
                       created_at, updated_at, resolved_at, closed_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (t["ticket_ref"], ops_project_id, "Task", t["subject"],
                 t["description"], t["category_id"], t["requester_id"],
                 t["assignee_id"], t["team_id"], t["priority"], t["status"],
                 t["blocked_reason"], t["reopen_count"], None, None,
                 t["csat"], None, t["created_at"], t["updated_at"],
                 t["resolved_at"], t["closed_at"]),
            )
            issue_by_ticket_id[t["id"]] = cur.lastrowid

        # Keep generating keys above the largest migrated number.
        max_seq = 0
        for t in db.execute(
                "SELECT issue_key FROM jira_issues WHERE issue_key LIKE 'OPS-%'").fetchall():
            try:
                max_seq = max(max_seq, int(t["issue_key"].split("-", 1)[1]))
            except (IndexError, ValueError):
                continue
        db.execute("UPDATE jira_projects SET next_seq=? WHERE id=?",
                   (max_seq + 1, ops_project_id))

        # --- Shared entity tables (ticket data -> entity_type 'jira_issue') --
        for c in db.execute("SELECT * FROM _backup_ticket_comments").fetchall():
            db.execute(
                "INSERT INTO entity_comments (entity_type, entity_id, author_id, body, visibility, created_at) "
                "VALUES ('jira_issue',?,?,?,?,?)",
                (issue_by_ticket_id[c["ticket_id"]], c["author_id"], c["body"],
                 c["visibility"], c["created_at"]))
        for a in db.execute("SELECT * FROM _backup_ticket_attachments").fetchall():
            db.execute(
                "INSERT INTO entity_attachments (entity_type, entity_id, uploaded_by, filename, file_size, storage_path, created_at) "
                "VALUES ('jira_issue',?,?,?,?,?,?)",
                (issue_by_ticket_id[a["ticket_id"]], a["uploaded_by"],
                 a["filename"], a["file_size"], a["storage_path"], a["created_at"]))
        for act in db.execute("SELECT * FROM _backup_ticket_activity").fetchall():
            detail = _json.dumps({"from_status": act["from_status"],
                                  "to_status": act["to_status"],
                                  "note": act["note"]})
            db.execute(
                "INSERT INTO entity_activity (entity_type, entity_id, actor_id, action, detail, created_at) "
                "VALUES ('jira_issue',?,?,?,?,?)",
                (issue_by_ticket_id[act["ticket_id"]], act["actor_id"],
                 act["action"], detail, act["created_at"]))
        for f in db.execute("SELECT * FROM _backup_ticket_followers").fetchall():
            db.execute(
                "INSERT OR IGNORE INTO entity_followers (entity_type, entity_id, user_id, created_at) "
                "VALUES ('jira_issue',?,?,?)",
                (issue_by_ticket_id[f["ticket_id"]], f["user_id"], f["created_at"]))

        # --- SLA + notifications + links --------------------------------------
        for s in db.execute("SELECT * FROM _backup_ticket_sla").fetchall():
            db.execute(
                "INSERT INTO issue_sla (issue_id, policy_id, first_response_at, breach_at, breached, response_met, resolution_met) "
                "VALUES (?,?,?,?,?,?,?)",
                (issue_by_ticket_id[s["ticket_id"]], s["policy_id"],
                 s["first_response_at"], s["breach_at"], s["breached"],
                 s["response_met"], s["resolution_met"]))
        for n in db.execute("SELECT * FROM _backup_notifications").fetchall():
            if n["ticket_id"] is None or n["ticket_id"] not in issue_by_ticket_id:
                continue
            db.execute(
                "INSERT INTO notifications_v2 (user_id, entity_type, entity_id, kind, message, read, created_at) "
                "VALUES (?, 'jira_issue', ?, ?, ?, ?, ?)",
                (n["user_id"], issue_by_ticket_id[n["ticket_id"]], n["kind"],
                 n["message"], n["read"], n["created_at"]))

        # --- KB: folders + notes -----------------------------------------------
        cur = db.execute("INSERT INTO kb_folders (name, parent_id) VALUES ('General', NULL)")
        general_folder_id = cur.lastrowid
        folder_by_category_id = {None: general_folder_id}
        for cat in db.execute(
                """SELECT DISTINCT c.id, c.name FROM _backup_kb_articles a
                   JOIN categories c ON c.id = a.category_id
                   WHERE a.category_id IS NOT NULL""").fetchall():
            cur = db.execute("INSERT INTO kb_folders (name, parent_id) VALUES (?,?)",
                             (cat["name"], general_folder_id))
            folder_by_category_id[cat["id"]] = cur.lastrowid

        # Titles are only unique per folder; legacy titles were globally unique
        # per article, so dedupe with a numeric suffix to satisfy the new key.
        note_by_article_id = {}
        used_titles = {}
        for a in db.execute("SELECT * FROM _backup_kb_articles").fetchall():
            title = a["title"]
            used = used_titles.get(a["category_id"], set())
            base, n = title, 2
            while base in used:
                base = f"{title} ({n})"
                n += 1
            used.add(base)
            used_titles[a["category_id"]] = used
            cur = db.execute(
                """INSERT INTO kb_notes (folder_id, title, content, frontmatter, author_id,
                       status, views, helpful_yes, helpful_no, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (folder_by_category_id.get(a["category_id"], general_folder_id),
                 base, a["body"], None, a["author_id"], a["status"], a["views"],
                 db.execute("SELECT COALESCE(SUM(helpful),0) c FROM _backup_kb_feedback "
                            "WHERE article_id=? AND helpful=1", (a["id"],)).fetchone()["c"],
                 db.execute("SELECT COUNT(*) c FROM _backup_kb_feedback "
                            "WHERE article_id=? AND helpful=0", (a["id"],)).fetchone()["c"],
                 a["created_at"], a["updated_at"]),
            )
            note_by_article_id[a["id"]] = cur.lastrowid

        for v in db.execute("SELECT * FROM _backup_kb_article_versions").fetchall():
            if v["article_id"] not in note_by_article_id:
                continue
            db.execute(
                "INSERT INTO kb_note_versions (note_id, title, body, saved_by_id, change_note, saved_at) "
                "VALUES (?,?,?,?,?,?)",
                (note_by_article_id[v["article_id"]], v["title"], v["body"],
                 v["created_by"], "", v["created_at"]))
        for l in db.execute("SELECT * FROM _backup_kb_article_links").fetchall():
            if l["source_id"] not in note_by_article_id or l["target_id"] not in note_by_article_id:
                continue
            db.execute(
                "INSERT OR IGNORE INTO kb_wikilinks (source_note_id, target_note_id, alias, created_at) "
                "VALUES (?,?,?,?)",
                (note_by_article_id[l["source_id"]],
                 note_by_article_id[l["target_id"]], None, l["created_at"]))
        for f in db.execute("SELECT * FROM _backup_kb_feedback").fetchall():
            if f["article_id"] not in note_by_article_id:
                continue
            db.execute(
                "INSERT INTO kb_note_feedback (note_id, user_id, helpful, comment, created_at) "
                "VALUES (?,?,?,?,?)",
                (note_by_article_id[f["article_id"]], f["user_id"], f["helpful"],
                 f["comment"], f["created_at"]))

        # --- KB collections ------------------------------------------------------
        for c in db.execute("SELECT * FROM _backup_kb_collections").fetchall():
            db.execute(
                "INSERT INTO kb_collections_v2 (id, name, description, owner_id, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?)",
                (c["id"], c["name"], c["description"], c["owner_id"],
                 c["created_at"], c["updated_at"]))
        for ca in db.execute("SELECT * FROM _backup_kb_collection_articles").fetchall():
            if ca["article_id"] not in note_by_article_id:
                continue
            db.execute(
                "INSERT OR IGNORE INTO kb_collection_notes (collection_id, note_id, position, created_at) "
                "VALUES (?,?,?,?)",
                (ca["collection_id"], note_by_article_id[ca["article_id"]],
                 ca["position"], ca["created_at"]))

        # --- Ticket <-> KB links become cross-module entity links ---------------
        for l in db.execute("SELECT * FROM _backup_ticket_kb_links").fetchall():
            if l["ticket_id"] not in issue_by_ticket_id or l["article_id"] not in note_by_article_id:
                continue
            db.execute(
                "INSERT OR IGNORE INTO entity_links (source_type, source_id, target_type, target_id, created_by, created_at) "
                "VALUES ('jira_issue',?,'kb_note',?,?,?)",
                (issue_by_ticket_id[l["ticket_id"]],
                 note_by_article_id[l["article_id"]], l["linked_by_id"],
                 l["created_at"]))

        db.commit()
    except Exception:
        db.rollback()
        raise
    else:
        # Phase 7: migration verified complete — drop the _backup_* tables.
        # They are no longer needed for reversibility (all rows now live in
        # the new schema). Done outside the copy transaction, with FK checks
        # off, because some backups are still referenced by others' foreign
        # keys and SQLite forbids PRAGMA foreign_keys changes mid-transaction.
        db.execute("PRAGMA foreign_keys = OFF")
        try:
            for backup in RENAMES.values():
                db.execute(f"DROP TABLE IF EXISTS {backup}")
        finally:
            db.execute("PRAGMA foreign_keys = ON")
        db.commit()


def _seed_workflow(db):
    """Seed the default workflow scheme (lifecycle.ALLOWED) into
    jira_workflow_transitions. Idempotent: project-level overrides created
    later by admins are never clobbered."""
    from . import lifecycle
    import json as _json
    for from_status, dests in lifecycle.ALLOWED.items():
        for to_status, reason_required in dests.items():
            db.execute(
                "INSERT OR IGNORE INTO jira_workflow_transitions "
                "(project_id, from_status, to_status, allowed_roles, reason_required) "
                "VALUES (NULL, ?, ?, ?, ?)",
                (from_status, to_status,
                 _json.dumps(["agent", "manager", "admin"]),
                 int(bool(reason_required))))
    db.commit()


def _seed_default_project(db):
    """Fresh installs get the OPS project so the Jira suite has a home
    (migrated DBs already have it from _migrate_v2; idempotent either way)."""
    if db.execute("SELECT 1 FROM jira_projects WHERE key='OPS'").fetchone():
        return
    admin = db.execute(
        "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
    db.execute(
        "INSERT INTO jira_projects (key, name, description, lead_id, category, created_at) "
        "VALUES ('OPS', 'Operations Desk', 'Default operational queue', ?, 'Service Desk', ?)",
        (admin["id"] if admin else None, now_iso()))
    db.commit()


def _hash(plain):
    """Hash a password using Werkzeug's pbkdf2 helper (no extra deps)."""
    from werkzeug.security import generate_password_hash
    return generate_password_hash(plain)
