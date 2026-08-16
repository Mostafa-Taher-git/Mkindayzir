"""
Shared helpers: session/authentication, role checks, and JSON helpers.

These keep the route modules small and the security rules in one place:
* login_required  - any logged-in user
* role_required    - specific role(s)
* agent_or_manager - can handle tickets / see queues
"""
from functools import wraps
from flask import session, jsonify, request, redirect, url_for

from . import db
from . import config


def get_current_user():
    """Return the current user row (dict) or None if not logged in."""
    uid = session.get("user_id")
    if not uid:
        return None
    return db.get_db().execute(
        "SELECT * FROM users WHERE id = ?", (uid,)
    ).fetchone()


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            # API call -> 401 JSON, browser call -> redirect to login
            if request.path.startswith("/api/"):
                return jsonify(error="Authentication required"), 401
            return redirect(url_for("auth.login"))
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
                if request.path.startswith("/api/"):
                    return jsonify(error="Forbidden"), 403
                return redirect(url_for("auth.login"))
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
