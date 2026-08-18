"""AI assistance endpoints (v2).

All three are DRAFT-ONLY: they return text a human reviews before use and never
mutate anything. Access requires login + agent/manager, the feature flag on, and
a provider key. Without a key the flag is off and every endpoint returns 503 with
a clear message (fail-closed). Each endpoint re-fetches the ticket inside the
request so the model only ever sees authorized data.
"""

from flask import Blueprint, jsonify, request

from . import db, config, helpers
from .routes_jira import _fetch, _comments_for
from .helpers import can_view_ticket, role_required, decrypt_secret
from . import ai

aibp = Blueprint("ai", __name__)


def _load(tid, user):
    """Return (ticket_dict, comments_list) or None if not found / not visible.

    Both are converted to plain dicts so the AI client (which uses .get()) never
    touches a sqlite3.Row, and so nothing unserializable reaches it.
    """
    t = _fetch(tid)
    if not t or not can_view_ticket(user, t):
        return None
    comments = [dict(c) for c in _comments_for(tid, user)]
    return dict(t), comments


def _offline():
    # No key configured for this user (or globally disabled) -> clear message.
    return jsonify(error="Add your OpenRouter API key in Settings to use AI assist"), 503


def _user_key_and_model(user):
    """Decrypt the current user's stored OpenRouter key + chosen model.

    Falls back to the deployment-wide OPERADESK_OPENROUTER_KEY env var if the
    user hasn't set their own. Returns (key, model) where key may be None.
    """
    key = decrypt_secret(user.get("ai_key")) or         __import__("os").environ.get("OPERADESK_OPENROUTER_KEY")
    model = user.get("ai_model") or config.AI_MODEL_DEFAULT
    return key, model


@aibp.route("/api/ai/suggest-reply/<int:tid>", methods=["GET"])
@role_required(config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)
def suggest_reply(tid):
    user = request.current_user
    key, model = _user_key_and_model(user)
    if not key:
        return _offline()
    loaded = _load(tid, user)
    if not loaded:
        return jsonify(error="Not found"), 404
    t, comments = loaded
    out = ai.suggest_reply(t, comments, api_key=key, model=model)
    if out is None:
        return jsonify(error="AI request failed; try again later"), 502
    return jsonify(draft=out)


@aibp.route("/api/ai/summarize/<int:tid>", methods=["GET"])
@role_required(config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)
def summarize(tid):
    user = request.current_user
    key, model = _user_key_and_model(user)
    if not key:
        return _offline()
    loaded = _load(tid, user)
    if not loaded:
        return jsonify(error="Not found"), 404
    t, comments = loaded
    out = ai.summarize_ticket(t, comments, api_key=key, model=model)
    if out is None:
        return jsonify(error="AI request failed; try again later"), 502
    return jsonify(summary=out)


@aibp.route("/api/ai/suggest-priority/<int:tid>", methods=["GET"])
@role_required(config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)
def suggest_priority(tid):
    user = request.current_user
    key, model = _user_key_and_model(user)
    if not key:
        return _offline()
    loaded = _load(tid, user)
    if not loaded:
        return jsonify(error="Not found"), 404
    t, comments = loaded
    out = ai.suggest_priority(t, comments, api_key=key, model=model)
    if out is None:
        return jsonify(error="AI request failed; try again later"), 502
    return jsonify(priority=out)
