"""
Admin routes: CRUD for teams, categories, and users/roles (FR-20).

All endpoints require the admin role. Kept deliberately simple and
readable so it is easy to extend (e.g. add permissions later).
"""
from flask import Blueprint, request, jsonify

from . import db, config, helpers
from .helpers import login_required, role_required

admin = Blueprint("admin", __name__)


@admin.route("/api/admin/teams", methods=["GET"])
@role_required(config.ROLE_ADMIN)
def list_teams():
    rows = db.get_db().execute("SELECT * FROM teams ORDER BY name").fetchall()
    return jsonify(teams=[dict(r) for r in rows])


@admin.route("/api/admin/teams", methods=["POST"])
@role_required(config.ROLE_ADMIN)
def create_team():
    name = (request.get_json(silent=True) or {}).get("name", "").strip()
    if not name:
        return jsonify(error="Name is required"), 400
    try:
        cur = db.get_db().execute(
            "INSERT INTO teams (name) VALUES (?)", (name,))
        db.get_db().commit()
    except db.get_db().IntegrityError:
        return jsonify(error="Team already exists"), 400
    return jsonify(team=dict(db.get_db().execute(
        "SELECT * FROM teams WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@admin.route("/api/admin/teams/<int:tid>", methods=["DELETE"])
@role_required(config.ROLE_ADMIN)
def delete_team(tid):
    db.get_db().execute("DELETE FROM teams WHERE id=?", (tid,))
    db.get_db().commit()
    return jsonify(ok=True)


@admin.route("/api/admin/categories", methods=["GET"])
@role_required(config.ROLE_ADMIN)
def list_categories():
    rows = db.get_db().execute(
        "SELECT * FROM categories ORDER BY name").fetchall()
    return jsonify(categories=[dict(r) for r in rows])


@admin.route("/api/admin/categories", methods=["POST"])
@role_required(config.ROLE_ADMIN)
def create_category():
    d = request.get_json(silent=True) or {}
    name = (d.get("name") or "").strip()
    if not name:
        return jsonify(error="Name is required"), 400
    db.get_db().execute(
        "INSERT INTO categories (name, description, active) VALUES (?,?,1)",
        (name, d.get("description") or ""))
    db.get_db().commit()
    return jsonify(ok=True), 201


@admin.route("/api/admin/categories/<int:cid>", methods=["DELETE"])
@role_required(config.ROLE_ADMIN)
def delete_category(cid):
    db.get_db().execute("UPDATE categories SET active=0 WHERE id=?", (cid,))
    db.get_db().commit()
    return jsonify(ok=True)


@admin.route("/api/admin/users", methods=["GET"])
@role_required(config.ROLE_ADMIN)
def list_users():
    rows = db.get_db().execute(
        "SELECT id, name, email, role, team_id FROM users ORDER BY name").fetchall()
    return jsonify(users=[dict(r) for r in rows])


@admin.route("/api/admin/users", methods=["POST"])
@role_required(config.ROLE_ADMIN)
def create_user():
    d = request.get_json(silent=True) or {}
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    role = d.get("role")
    team_id = d.get("team_id")
    password = d.get("password") or "password"
    if not name or not email:
        return jsonify(error="Name and email are required"), 400
    if role not in config.ROLES:
        return jsonify(error="Invalid role"), 400
    from werkzeug.security import generate_password_hash
    try:
        db.get_db().execute(
            "INSERT INTO users (name, email, password, role, team_id) \
             VALUES (?,?,?,?,?)",
            (name, email, generate_password_hash(password), role, team_id))
        db.get_db().commit()
    except db.get_db().IntegrityError:
        return jsonify(error="Email already exists"), 400
    return jsonify(ok=True), 201


@admin.route("/api/admin/users/<int:uid>", methods=["PATCH"])
@role_required(config.ROLE_ADMIN)
def update_user(uid):
    d = request.get_json(silent=True) or {}
    sets, params = [], []
    for col in ("name", "email", "role", "team_id"):
        if col in d:
            sets.append(f"{col} = ?")
            params.append(d[col] if col != "email" else d[col].strip().lower())
    if d.get("password"):
        from werkzeug.security import generate_password_hash
        sets.append("password = ?")
        params.append(generate_password_hash(d["password"]))
    if not sets:
        return jsonify(ok=True)
    params.append(uid)
    db.get_db().execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", params)
    db.get_db().commit()
    return jsonify(ok=True)


@admin.route("/api/admin/users/<int:uid>", methods=["DELETE"])
@role_required(config.ROLE_ADMIN)
def delete_user(uid):
    db.get_db().execute("DELETE FROM users WHERE id=?", (uid,))
    db.get_db().commit()
    return jsonify(ok=True)
