"""
Central configuration for OpsDesk.

Everything that you might want to tune lives here or in the .env-style
constants below. The database is a single SQLite file (zero-setup, easy
to back up or later swap for Postgres).
"""
import os

# Base directory of the project (two levels up from this file: app/ -> project root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Where the SQLite database file lives.
DB_PATH = os.path.join(BASE_DIR, "data", "opsdesk.db")

# Where the app shell and static assets live.
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Where uploaded attachments are stored on disk.
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")

# Secret used to sign session cookies. In production set this via the
# OPERATION environment variable. For local/dev it defaults to a fixed
# value so the app runs without setup.
SECRET_KEY = os.environ.get("OPERADESK_SECRET", "dev-secret-change-me")

# Comma-separated list of values allowed for CATEGORY/TEAM seeds etc.
# (kept here for easy editing)

# Workflow timing windows (hours). These mirror BRD §10 proposed defaults.
REOPEN_WINDOW_HOURS = 72          # requester may reopen within this window
AUTO_CLOSE_HOURS = 72             # resolved -> closed automatically
AGED_NEW_HOURS = 4                # new & unassigned longer than this = aged
AGED_PROGRESS_HOURS = 48          # in_progress with no update longer than this = aged

# Attachment rules (BRD §10 / FR-03).
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB total per ticket

# Roles (string constants used across the app).
ROLE_REQUESTER = "requester"
ROLE_AGENT = "agent"
ROLE_MANAGER = "manager"
ROLE_ADMIN = "admin"
ROLES = [ROLE_REQUESTER, ROLE_AGENT, ROLE_MANAGER, ROLE_ADMIN]

# Ticket statuses (the fixed 6-state lifecycle + reopened).
STATUS_NEW = "new"
STATUS_ASSIGNED = "assigned"
STATUS_IN_PROGRESS = "in_progress"
STATUS_BLOCKED = "blocked"
STATUS_RESOLVED = "resolved"
STATUS_CLOSED = "closed"
STATUS_REOPENED = "reopened"
STATUSES = [STATUS_NEW, STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_BLOCKED,
            STATUS_RESOLVED, STATUS_CLOSED, STATUS_REOPENED]

# Priorities.
PRIORITY_NORMAL = "normal"
PRIORITY_URGENT = "urgent"
PRIORITIES = [PRIORITY_NORMAL, PRIORITY_URGENT]

# Comment visibility.
VIS_PUBLIC = "public"
VIS_INTERNAL = "internal"
VISIBILITIES = [VIS_PUBLIC, VIS_INTERNAL]
