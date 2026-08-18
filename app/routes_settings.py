"""User settings endpoints (v2).

Lets a logged-in user store their OWN OpenRouter API key + chosen model so the
AI assist feature works per-user without a deployment-wide key. The key is
encrypted at rest (helpers.encrypt_secret) and never returned to the client in
any form. Only the user themselves can read/write their own settings.
"""

import re

from flask import Blueprint, jsonify, request

from . import db, config, helpers
from .helpers import encrypt_secret, decrypt_secret

settingsbp = Blueprint("settings", __name__)


@settingsbp.route("/api/settings/ai", methods=["GET"])
@helpers.login_required
def get_ai_settings():
    user = request.current_user
    # Use the live OpenRouter model list available to this user's key (cached 1h).
    # Falls back to the curated config list on any failure.
    from app.ai.client import get_openrouter_models

    api_key = decrypt_secret(user.get("ai_key")) or __import__("os").environ.get("OPERADESK_OPENROUTER_KEY")
    models = get_openrouter_models(api_key) or config.AI_FREE_MODELS
    # Return the user's stored model (or empty string if unset). The frontend
    # is responsible for selecting a sensible default in the dropdown.
    return jsonify(
        has_key=bool(user.get("ai_key")),
        model=user.get("ai_model") or "",
        models=models,
    )


@settingsbp.route("/api/settings/ai", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def save_ai_settings():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    raw_key = (data.get("api_key") or "").strip()
    model = (data.get("model") or "").strip()

    # Preserve existing key unless caller explicitly sends a new key or an
    # explicit empty string to clear it.
    if "api_key" not in data:
        enc = user.get("ai_key")
    elif raw_key:
        if not re.match(r"^sk-[A-Za-z0-9\-]{10,}$", raw_key) and \
           not raw_key.startswith("sk-or-"):
            return jsonify(error="That doesn't look like a valid API key"), 400
        enc = encrypt_secret(raw_key)
    else:
        enc = None

    chosen = model or user.get("ai_model") or config.AI_MODEL_DEFAULT
    db.get_db().execute(
        "UPDATE users SET ai_key=?, ai_model=? WHERE id=?",
        (enc, chosen, user["id"]),
    )
    db.get_db().commit()
    return jsonify(ok=True, has_key=bool(enc), model=chosen)


@settingsbp.route("/api/settings/password", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def change_password():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    current = (data.get("current_password") or "").strip()
    new = (data.get("new_password") or "").strip()

    if not current or not new:
        return jsonify(error="Current password and new password are required"), 400

    user_row = db.get_db().execute("SELECT password FROM users WHERE id=?", (user["id"],)).fetchone()
    if not user_row:
        return jsonify(error="User not found"), 404

    from werkzeug.security import check_password_hash, generate_password_hash
    if not check_password_hash(user_row["password"], current):
        return jsonify(error="Current password is incorrect"), 401

    if len(new) < config.PASSWORD_MIN_LENGTH:
        return jsonify(error=f"New password must be at least {config.PASSWORD_MIN_LENGTH} characters"), 400

    db.get_db().execute(
        "UPDATE users SET password=? WHERE id=?",
        (generate_password_hash(new), user["id"]),
    )
    db.get_db().commit()
    return jsonify(ok=True)
