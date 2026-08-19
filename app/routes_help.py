"""
Help Center routes (Phase 5, Master Plan §5.5).

Endpoints:
  GET  /api/help/guides          -> tabbed guide structure (5 fixed tabs)
  GET  /api/help/guides/<tab>    -> published notes for one tab
  GET  /api/help/progress        -> user's onboarding milestones
  POST /api/help/progress        -> record a milestone (idempotent)
  GET  /api/help/shortcuts       -> keyboard shortcuts reference
  GET  /api/help/tours/<tour>    -> tour step definitions

Help content is stored as KB notes under a special `__help__` folder that is
seeded lazily on first read (see _ensure_help_content).
"""
from flask import Blueprint, request, jsonify

from . import db, helpers
from .helpers import login_required, csrf_protect

help = Blueprint("help", __name__)

# The 5 fixed Help Center tabs. labels are shown to the user; subfolders under
# `__help__` carry the same key name.
HELP_TABS = {
    "jira": "Jira",
    "trello": "Trello",
    "kb": "Knowledge Base",
    "ai": "AI Copilot",
    "admin": "Admin",
}

# Onboarding milestones known to the product. `total` is derived from this.
DEFINED_MILESTONES = [
    "created_first_issue",
    "created_first_card",
    "published_first_kb",
    "completed_getting_started_tour",
    "invited_a_member",
    "used_ai_copilot",
]

# Fixed keyboard shortcuts reference (see §5.5).
SHORTCUTS = [
    {"keys": "C", "description": "Quick create (issue or card)"},
    {"keys": "Ctrl+J / Cmd+J", "description": "Toggle AI Copilot drawer"},
    {"keys": "Ctrl+K / Cmd+K", "description": "Open omnisearch palette"},
    {"keys": "?", "description": "Show keyboard shortcuts"},
    {"keys": "Escape", "description": "Close modal / drawer / palette"},
    {"keys": "G then D", "description": "Go to Dashboard"},
    {"keys": "G then B", "description": "Go to Backlog"},
    {"keys": "G then K", "description": "Go to KB Vault"},
]

# Tour step definitions keyed by tour_key.
TOURS = {
    "getting_started": {
        "key": "getting_started",
        "title": "Getting Started",
        "steps": [
            {"selector": "#nav-dashboard", "title": "Dashboard",
             "text": "Your command center. Track issues, cards and KB activity at a glance.",
             "position": "bottom"},
            {"selector": "#nav-jira", "title": "Jira",
             "text": "Create and manage issues. Use the Quick Create shortcut (press C) anytime.",
             "position": "bottom"},
            {"selector": "#nav-kb", "title": "KB Vault",
             "text": "Write knowledge base articles and build collections for your team.",
             "position": "bottom"},
            {"selector": "#nav-ai", "title": "AI Copilot",
             "text": "Ask the copilot to summarize, draft, or search. Toggle with Ctrl+J / Cmd+J.",
             "position": "left"},
        ],
    },
    "kb-basics": {
        "key": "kb-basics",
        "title": "KB Vault Basics",
        "steps": [
            {"selector": "#nav-kb", "title": "Open the Vault",
             "text": "The KB Vault organizes notes into folders you can nest freely.",
             "position": "bottom"},
            {"selector": "#nav-kb", "title": "Publish",
             "text": "Draft notes stay private until you publish them — published notes appear in search and guides.",
             "position": "bottom"},
            {"selector": "#nav-kb", "title": "Collections",
             "text": "Group related notes into collections to share curated reading lists.",
             "position": "bottom"},
        ],
    },
}


# ---------------------------------------------------------------------------
# Lazy seed of help content (idempotent, concurrency-safe)
# ---------------------------------------------------------------------------
def _ensure_help_content():
    """Create the `__help__` folder + 5 subfolders + seed notes if missing.

    Idempotent: if the `__help__` folder already exists we return immediately.
    Inside the write path we re-check existence so two concurrent first-reads
    don't double-insert (the UNIQUE(name, parent_id) constraint is the backstop).
    """
    dbc = db.get_db()
    existing = dbc.execute(
        "SELECT id FROM kb_folders WHERE name='__help__' AND parent_id IS NULL"
    ).fetchone()
    if existing:
        return

    try:
        dbc.execute("BEGIN")
        # Re-check now that we hold the write transaction.
        existing = dbc.execute(
            "SELECT id FROM kb_folders WHERE name='__help__' AND parent_id IS NULL"
        ).fetchone()
        if existing:
            dbc.execute("COMMIT")
            return

        admin = dbc.execute(
            "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1"
        ).fetchone()
        admin_id = admin["id"] if admin else None
        now = db.now_iso()

        root = dbc.execute(
            "INSERT INTO kb_folders (name, parent_id) VALUES ('__help__', NULL)"
        ).lastrowid

        # {tab_key: [(title, content), ...]}
        seed = {
            "jira": [
                ("Getting started with Jira",
                 "# Getting started with Jira\n\n"
                 "Create an issue from **Backlog** with the quick-create shortcut (`C`).\n\n"
                 "- Pick a category to auto-route to the right team\n"
                 "- Set priority so SLA is picked automatically\n"
                 "- Use sprints to plan work"),
                ("Issue statuses & transitions",
                 "# Issue statuses\n\n"
                 "Issues move through `new -> assigned -> in_progress -> resolved -> closed`.\n\n"
                 "Blocked issues need a reason; reopens bump the reopen counter."),
            ],
            "trello": [
                ("Creating your first Trello board",
                 "# Creating your first Trello board\n\n"
                 "1. Open a workspace and click **New board**\n"
                 "2. Add lists (e.g. *To Do*, *Doing*, *Done*)\n"
                 "3. Drag cards between lists as work progresses\n\n"
                 "Star boards you use often."),
                ("Cards, checklists & labels",
                 "# Cards\n\n"
                 "Cards hold descriptions, checklists, due dates and labels.\n"
                 "Members can be added so everyone sees who owns what."),
            ],
            "kb": [
                ("Writing KB articles",
                 "# Writing KB articles\n\n"
                 "Notes live in folders you can nest. Draft privately, then **publish**.\n\n"
                 "Use markdown headings, lists and code blocks. Tag notes to surface them in search."),
                ("Collections & feedback",
                 "# Collections\n\n"
                 "Group notes into collections for curated reading lists and gather "
                 "helpful / not-helpful feedback from readers."),
            ],
            "ai": [
                ("Using the AI Copilot",
                 "# Using the AI Copilot\n\n"
                 "Open the drawer with `Ctrl+J` / `Cmd+J`. The copilot can:\n\n"
                 "- Summarize an issue or ticket\n"
                 "- Draft replies and KB articles\n"
                 "- Search across modules\n\n"
                 "Set your own OpenRouter key in Settings."),
                ("Copilot tips",
                 "# Copilot tips\n\n"
                 "Keep prompts specific. Reference an entity (issue, card, note) and the "
                 "copilot will use its context to give better answers."),
            ],
            "admin": [
                ("Admin essentials",
                 "# Admin essentials\n\n"
                 "Admins manage users, teams, workflow schemes and SLA policies.\n\n"
                 "- Invite members from the Admin panel\n"
                 "- Configure workflow transitions per project\n"
                 "- Review the audit log for changes"),
                ("Workflow & SLA",
                 "# Workflow & SLA\n\n"
                 "Define allowed status transitions and the roles that may use them. "
                 "SLA policies map priority (and category) to response/resolution targets."),
            ],
        }

        for tab_key, label in HELP_TABS.items():
            folder_id = dbc.execute(
                "INSERT INTO kb_folders (name, parent_id) VALUES (?,?)",
                (tab_key, root),
            ).lastrowid
            for title, content in seed.get(tab_key, []):
                dbc.execute(
                    """INSERT INTO kb_notes
                       (folder_id, title, content, author_id, status, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (folder_id, title, content, admin_id, "published", now, now),
                )

        dbc.execute("COMMIT")
    except Exception:
        dbc.execute("ROLLBACK")
        raise


def _tab_subfolder_id(dbc, tab_key):
    """Return the subfolder id for a tab, or None if not seeded yet."""
    row = dbc.execute(
        "SELECT id FROM kb_folders WHERE name=? AND parent_id=("
        "SELECT id FROM kb_folders WHERE name='__help__' AND parent_id IS NULL)",
        (tab_key,),
    ).fetchone()
    return row["id"] if row else None


# ---------------------------------------------------------------------------
# Guides
# ---------------------------------------------------------------------------
@help.route("/api/help/guides")
@login_required
def list_guides():
    _ensure_help_content()
    dbc = db.get_db()
    guides = []
    for tab_key, label in HELP_TABS.items():
        folder_id = _tab_subfolder_id(dbc, tab_key)
        count = 0
        if folder_id:
            count = dbc.execute(
                "SELECT COUNT(*) AS c FROM kb_notes WHERE folder_id=? AND status='published'",
                (folder_id,),
            ).fetchone()["c"]
        guides.append({"key": tab_key, "label": label, "note_count": count})
    return jsonify(guides=guides)


@help.route("/api/help/guides/<tab_key>")
@login_required
def get_guide(tab_key):
    if tab_key not in HELP_TABS:
        return jsonify(error="Unknown guide tab"), 404
    _ensure_help_content()
    dbc = db.get_db()
    folder_id = _tab_subfolder_id(dbc, tab_key)
    notes = []
    if folder_id:
        rows = dbc.execute(
            "SELECT id, title, content FROM kb_notes "
            "WHERE folder_id=? AND status='published' ORDER BY title",
            (folder_id,),
        ).fetchall()
        notes = [dict(r) for r in rows]
    return jsonify(tab=tab_key, label=HELP_TABS[tab_key], notes=notes)


# ---------------------------------------------------------------------------
# Onboarding progress
# ---------------------------------------------------------------------------
@help.route("/api/help/progress")
@login_required
def get_progress():
    dbc = db.get_db()
    rows = dbc.execute(
        "SELECT milestone_key, completed_at FROM user_milestones WHERE user_id=?",
        (request.current_user["id"],),
    ).fetchall()
    completed = [r["milestone_key"] for r in rows]
    return jsonify(
        milestones=[dict(r) for r in rows],
        completed=completed,
        total=len(DEFINED_MILESTONES),
    )


@help.route("/api/help/progress", methods=["POST"])
@login_required
@csrf_protect
def record_progress():
    data = request.get_json(silent=True) or {}
    key = (data.get("milestone_key") or "").strip()
    if not key:
        return jsonify(error="milestone_key is required"), 400
    completed_at = db.now_iso()
    db.get_db().execute(
        "INSERT OR IGNORE INTO user_milestones (user_id, milestone_key, completed_at) "
        "VALUES (?,?,?)",
        (request.current_user["id"], key, completed_at),
    )
    db.get_db().commit()
    return jsonify(ok=True, milestone_key=key, completed_at=completed_at)


# ---------------------------------------------------------------------------
# Shortcuts & tours (static references)
# ---------------------------------------------------------------------------
@help.route("/api/help/shortcuts")
@login_required
def get_shortcuts():
    return jsonify(shortcuts=SHORTCUTS)


@help.route("/api/help/tours/<tour_key>")
@login_required
def get_tour(tour_key):
    tour = TOURS.get(tour_key)
    if not tour:
        return jsonify(error="Unknown tour"), 404
    return jsonify(tour=tour)
