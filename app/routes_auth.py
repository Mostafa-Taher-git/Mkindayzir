"""
Authentication routes: login, logout, current user info.

Uses server-side sessions (cookie signed by SECRET_KEY). Passwords are
hashed with Werkzeug's pbkdf2. SSO can be layered on later without
changing the rest of the app.
"""
from flask import Blueprint, request, session, jsonify, render_template

from . import db
from . import helpers
from .helpers import login_required

auth = Blueprint("auth", __name__)


@auth.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    row = db.get_db().execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    if not row:
        return jsonify(error="Invalid email or password"), 401

    from werkzeug.security import check_password_hash
    if not check_password_hash(row["password"], password):
        return jsonify(error="Invalid email or password"), 401

    session["user_id"] = row["id"]
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
