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
    # Use the live OpenRouter free-model list (cached 1h). Falls back to the
    # hardcoded config list if the API call fails.
    from app.ai.client import get_openrouter_free_models
    api_key = decrypt_secret(user.get("ai_key")) or __import__("os").environ.get("OPERADESK_OPENROUTER_KEY")
    free_models = get_openrouter_free_models(api_key) or config.AI_FREE_MODELS
    # Return the user's stored model (or empty string if unset). The frontend
    # is responsible for selecting a sensible default in the dropdown.
    return jsonify(
        has_key=bool(user.get("ai_key")),
        model=user.get("ai_model") or "",
        free_models=free_models,
    )


@settingsbp.route("/api/settings/ai", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def save_ai_settings():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    raw_key = (data.get("api_key") or "").strip()
    model = (data.get("model") or "").strip()

    # Allow clearing the key by sending an empty string.
    if raw_key:
        # Basic shape check: OpenRouter keys look like "sk-or-...". We don't
        # validate it works here (that happens on first AI call); we just reject
        # obvious garbage so a typo doesn't get stored.
        if not re.match(r"^sk-[A-Za-z0-9\-]{10,}$", raw_key) and \
           not raw_key.startswith("sk-or-"):
            return jsonify(error="That doesn't look like a valid API key"), 400
        enc = encrypt_secret(raw_key)
    else:
        enc = None  # clear it

    chosen = model or config.AI_MODEL_DEFAULT
    db.get_db().execute(
        "UPDATE users SET ai_key=?, ai_model=? WHERE id=?",
        (enc, chosen, user["id"]),
    )
    db.get_db().commit()
    return jsonify(ok=True, has_key=bool(enc), model=chosen)
