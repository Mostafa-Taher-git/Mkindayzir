"""
Shared helpers: session/authentication, role checks, and JSON helpers.

These keep the route modules small and the security rules in one place:
* login_required  - any logged-in user
* role_required    - specific role(s)
* agent_or_manager - can handle tickets / see queues
"""
from functools import wraps
import time

from flask import session, jsonify, request, redirect, url_for, g

from . import db
from . import config
from datetime import datetime, timezone


def _parse_iso(s):
    """Parse an ISO timestamp (with optional 'Z' or offset) to a tz-aware datetime."""
    if not s:
        return None
    s = s.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        try:
            return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def get_current_user():
    """Return the current user row (dict) or None if not logged in."""
    uid = session.get("user_id")
    if not uid:
        return None
    return db.get_db().execute(
        "SELECT * FROM users WHERE id = ?", (uid,)
    ).fetchone()


def get_csrf_token():
    """Return a per-session CSRF token, minting one on first use.

    The token is stored in the session and sent to the client via
    /api/auth/csrf. Mutating requests must echo it back in the
    X-CSRF-Token header. Because that header makes the request
    non-simple, browsers block cross-site forgeries automatically.
    """
    if "csrf_token" not in session:
        import secrets
        session["csrf_token"] = secrets.token_hex(32)
    return session["csrf_token"]


def csrf_protect(f):
    """Reject unsafe requests that don't carry a valid X-CSRF-Token header."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            expected = session.get("csrf_token")
            if not expected or request.headers.get("X-CSRF-Token") != expected:
                return jsonify(error="CSRF validation failed"), 403
        return f(*args, **kwargs)
    return wrapper


def _session_expired():
    """True if the session has been idle longer than SESSION_IDLE_MINUTES."""
    last = session.get("last_active")
    if not last:
        return False
    return (time.time() - last) > config.SESSION_IDLE_MINUTES * 60


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if _session_expired():
            session.clear()
        user = get_current_user()
        if not user:
            # Always return a JSON 401. The SPA's boot() catches this and shows
            # the login view; a redirect here would point the browser at a
            # non-existent /auth/login route and loop. The login PAGE is a
            # client-side view, not a server route.
            return jsonify(error="Authentication required"), 401
        session["last_active"] = time.time()
        request.current_user = user
        return f(*args, **kwargs)
    return wrapper


def role_required(*roles):
    """Decorator factory: allow only the given roles."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user or user["role"] not in roles:
                # Same as login_required: JSON only, no redirect (see above).
                return jsonify(error="Forbidden"), 403
            request.current_user = user
            return f(*args, **kwargs)
        return wrapper
    return decorator


def is_agent_or_manager(user):
    return user["role"] in (config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)


def can_view_ticket(user, ticket):
    """RBAC: who may see a given ticket (PRD FR-21)."""
    role = user["role"]
    if role in (config.ROLE_ADMIN, config.ROLE_MANAGER):
        return True
    if role == config.ROLE_AGENT:
        # Agents see tickets belonging to their team.
        if ticket["team_id"] is None:
            return True
        return ticket["team_id"] == user["team_id"]
    # Requester sees only their own tickets.
    return ticket["requester_id"] == user["id"]


def log_activity(ticket_id, actor_id, action, from_status=None,
                 to_status=None, note=None):
    """Append a row to the activity log. Called from ticket mutations."""
    db.get_db().execute(
        """INSERT INTO ticket_activity
           (ticket_id, actor_id, action, from_status, to_status, note, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (ticket_id, actor_id, action, from_status, to_status, note, db.now_iso()),
    )
    db.get_db().commit()
