"""AI assistance endpoints (v2).

All three are DRAFT-ONLY: they return text a human reviews before use and never
mutate anything. Access requires login + agent/manager, the feature flag on, and
a provider key. Without a key the flag is off and every endpoint returns 503 with
a clear message (fail-closed). Each endpoint re-fetches the ticket inside the
request so the model only ever sees authorized data.
"""

from flask import Blueprint, jsonify, request

from . import db, config, helpers
from .routes_tickets import _fetch, _comments_for
from .helpers import can_view_ticket, role_required
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
    return jsonify(error="AI assistance is not enabled on this server"), 503


@aibp.route("/api/ai/suggest-reply/<int:tid>", methods=["GET"])
@role_required(config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)
def suggest_reply(tid):
    if not (config.AI_ENABLED and ai.ai_enabled()):
        return _offline()
    user = request.current_user
    loaded = _load(tid, user)
    if not loaded:
        return jsonify(error="Not found"), 404
    t, comments = loaded
    out = ai.suggest_reply(t, comments)
    if out is None:
        return jsonify(error="AI request failed; try again later"), 502
    return jsonify(draft=out)


@aibp.route("/api/ai/summarize/<int:tid>", methods=["GET"])
@role_required(config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)
def summarize(tid):
    if not (config.AI_ENABLED and ai.ai_enabled()):
        return _offline()
    user = request.current_user
    loaded = _load(tid, user)
    if not loaded:
        return jsonify(error="Not found"), 404
    t, comments = loaded
    out = ai.summarize_ticket(t, comments)
    if out is None:
        return jsonify(error="AI request failed; try again later"), 502
    return jsonify(summary=out)


@aibp.route("/api/ai/suggest-priority/<int:tid>", methods=["GET"])
@role_required(config.ROLE_AGENT, config.ROLE_MANAGER, config.ROLE_ADMIN)
def suggest_priority(tid):
    if not (config.AI_ENABLED and ai.ai_enabled()):
        return _offline()
    user = request.current_user
    loaded = _load(tid, user)
    if not loaded:
        return jsonify(error="Not found"), 404
    t, comments = loaded
    out = ai.suggest_priority(t, comments)
    if out is None:
        return jsonify(error="AI request failed; try again later"), 502
    return jsonify(priority=out)
