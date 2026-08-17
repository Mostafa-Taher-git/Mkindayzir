"""
Authentication routes: login, logout, current user info, CSRF token.

Uses server-side sessions (cookie signed by SECRET_KEY). Passwords are
hashed with Werkzeug's pbkdf2. SSO can be layered on later without
changing the rest of the app.
"""
import time

from flask import Blueprint, request, session, jsonify, render_template

from . import db
from . import helpers
from . import config
from .helpers import login_required, get_csrf_token

auth = Blueprint("auth", __name__)

# In-memory login attempt tracking (single-process deploy only — see PLAN.md).
# Keyed by lower-cased email. A shared/redis store would be needed for multi-worker.
_LOGIN_ATTEMPTS = {}


def _lock_info(email):
    return _LOGIN_ATTEMPTS.get(email)


def _register_failure(email):
    info = _LOGIN_ATTEMPTS.get(email, {"count": 0, "locked_until": 0})
    info["count"] += 1
    if info["count"] >= config.LOGIN_MAX_ATTEMPTS:
        info["locked_until"] = time.time() + config.LOGIN_LOCKOUT_SECONDS
    _LOGIN_ATTEMPTS[email] = info


def _register_success(email):
    _LOGIN_ATTEMPTS.pop(email, None)


@auth.route("/api/auth/csrf", methods=["GET"])
def csrf_token():
    """Return the per-session CSRF token the client must send on mutations.

    NOTE: intentionally NOT @login_required. A fresh visitor has no session
    yet, but the SPA fetches this token *before* POSTing /api/auth/login
    (which is a mutation and therefore CSRF-protected). If this endpoint
    required login it would 401, the SPA would throw "Authentication required",
    and login could never start. The token lives in the session cookie Flask
    mints on the first request, so an anonymous client can safely read it.
    """
    return jsonify(csrf_token=get_csrf_token())


@auth.route("/api/auth/login", methods=["POST"])
@helpers.csrf_protect
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify(error="Email and password are required"), 400

    # Brute-force lockout: block this account for a window after N failures.
    info = _lock_info(email)
    if info and info.get("locked_until", 0) > time.time():
        return jsonify(error="Too many attempts. Try again later."), 429

    row = db.get_db().execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    from werkzeug.security import check_password_hash
    if not row or not check_password_hash(row["password"], password):
        _register_failure(email)
        return jsonify(error="Invalid email or password"), 401

    _register_success(email)
    session["user_id"] = row["id"]
    session["last_active"] = time.time()
    return jsonify(user=row_to_public(row))


@auth.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify(ok=True)


@auth.route("/api/auth/me")
@login_required
def me():
    return jsonify(user=row_to_public(request.current_user))


def row_to_public(u):
    """Strip the password hash before sending a user to the client."""
    return {
        "id": u["id"],
        "name": u["name"],
        "email": u["email"],
        "role": u["role"],
        "team_id": u["team_id"],
    }
