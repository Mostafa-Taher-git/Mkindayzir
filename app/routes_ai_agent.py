"""AI Chat Core (Phase 4A): conversation + streaming chat backend.

Endpoints (all require login; POST/DELETE also require CSRF):
  GET    /api/ai/conversations                 list the current user's chats
  POST   /api/ai/conversations                 create a new chat
  DELETE /api/ai/conversations/<id>            delete a chat (owner only)
  GET    /api/ai/conversations/<id>/messages   list a chat's messages
  POST   /api/ai/chat/<conv_id>                SSE-stream a reply (rate-limited)
  POST   /api/ai/tool-confirm/<msg_id>         record approve/reject decision
  GET    /api/ai/models                        available OpenRouter models
  GET    /api/ai/usage                         usage aggregates for the user

All data is scoped to the authenticated owner. The chat stream is fail-closed:
without a key it returns a 503 JSON error rather than opening an SSE stream.
"""

import json
import os
import time

from flask import Blueprint, jsonify, request, Response

from . import db, config, helpers
from .helpers import login_required, csrf_protect, decrypt_secret
from . import ai

ai_agent = Blueprint("ai_agent", __name__)

# In-memory per-user rate limiter: user_id -> [epoch seconds]. Single-process
# deploy only (matches the existing LoginRateLimit approach in auth).
RATE_LIMIT = {}
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 20


def _resolve_key_and_model(user):
    """Decrypt the user's stored OpenRouter key (+ chosen model), falling back
    to the deployment-wide OPERADESK_OPENROUTER_KEY env var."""
    key = decrypt_secret(user.get("ai_key")) or os.environ.get("OPERADESK_OPENROUTER_KEY")
    model = user.get("ai_model") or config.AI_MODEL_DEFAULT
    return key, model


def _conv_or_error(conv_id, user):
    """Return (row, err): row is the conversation dict if owned by `user`,
    otherwise err is a Flask response (404 not found / 403 forbidden)."""
    row = db.get_db().execute(
        "SELECT * FROM ai_conversations WHERE id = ?", (conv_id,)
    ).fetchone()
    if not row:
        return None, (jsonify(error="Not found"), 404)
    row = dict(row)
    if row["user_id"] != user["id"]:
        return None, (jsonify(error="Forbidden"), 403)
    return row, None


@ai_agent.route("/api/ai/conversations", methods=["GET"])
@login_required
def list_conversations():
    user = request.current_user
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = int(request.args.get("per_page", 25))
    except (TypeError, ValueError):
        per_page = 25
    per_page = min(max(per_page, 1), 100)
    offset = (page - 1) * per_page

    cur = db.get_db()
    total = cur.execute(
        "SELECT COUNT(*) AS c FROM ai_conversations WHERE user_id = ?",
        (user["id"],),
    ).fetchone()["c"]
    rows = cur.execute(
        "SELECT id, title, created_at, updated_at FROM ai_conversations "
        "WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
        (user["id"], per_page, offset),
    ).fetchall()
    conversations = [dict(r) for r in rows]
    return jsonify(conversations=conversations, total=total,
                   page=page, per_page=per_page)


@ai_agent.route("/api/ai/conversations", methods=["POST"])
@login_required
@csrf_protect
def create_conversation():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    title = data.get("title") or "New Chat"
    now = db.now_iso()

    cur = db.get_db()
    res = cur.execute(
        "INSERT INTO ai_conversations (user_id, title, created_at, updated_at) "
        "VALUES (?,?,?,?)",
        (user["id"], title, now, now),
    )
    cid = res.lastrowid
    cur.commit()
    row = cur.execute(
        "SELECT id, title, created_at, updated_at FROM ai_conversations WHERE id = ?",
        (cid,),
    ).fetchone()
    return jsonify(conversation=dict(row)), 201


@ai_agent.route("/api/ai/conversations/<int:conv_id>", methods=["DELETE"])
@login_required
@csrf_protect
def delete_conversation(conv_id):
    user = request.current_user
    row, err = _conv_or_error(conv_id, user)
    if err:
        return err
    db.get_db().execute("DELETE FROM ai_conversations WHERE id = ?", (conv_id,))
    db.get_db().commit()
    return jsonify(ok=True)


@ai_agent.route("/api/ai/conversations/<int:conv_id>/messages", methods=["GET"])
@login_required
def get_messages(conv_id):
    user = request.current_user
    row, err = _conv_or_error(conv_id, user)
    if err:
        return err
    rows = db.get_db().execute(
        "SELECT id, role, content, tool_name, tool_args, tool_status, "
        "tokens_prompt, tokens_completion, cost_usd, created_at "
        "FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC",
        (conv_id,),
    ).fetchall()
    messages = [dict(r) for r in rows]
    return jsonify(messages=messages)


@ai_agent.route("/api/ai/chat/<int:conv_id>", methods=["POST"])
@login_required
@csrf_protect
def chat(conv_id):
    user = request.current_user
    row, err = _conv_or_error(conv_id, user)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify(error="Empty message"), 400

    # Rate limit: prune old timestamps, then check + append.
    now = time.time()
    uid = user["id"]
    stamps = [t for t in RATE_LIMIT.get(uid, []) if now - t < RATE_LIMIT_WINDOW]
    if len(stamps) >= RATE_LIMIT_MAX:
        RATE_LIMIT[uid] = stamps
        return jsonify(error="Rate limit exceeded"), 429
    stamps.append(now)
    RATE_LIMIT[uid] = stamps

    key, model = _resolve_key_and_model(user)
    if not key:
        return jsonify(error="Add your OpenRouter API key in Settings to use AI chat"), 503

    cur = db.get_db()
    now_iso = db.now_iso()
    cur.execute(
        "INSERT INTO ai_messages (conversation_id, role, content, created_at) "
        "VALUES (?,?,?,?)",
        (conv_id, "user", message, now_iso),
    )
    cur.execute(
        "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
        (now_iso, conv_id),
    )
    cur.commit()

    history_rows = cur.execute(
        "SELECT role, content FROM ai_messages WHERE conversation_id = ? "
        "ORDER BY id ASC",
        (conv_id,),
    ).fetchall()
    history = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    def generate():
        accumulated = []
        tokens_prompt = 0
        tokens_completion = 0
        try:
            for chunk in ai.stream_chat(model, history, api_key=key):
                if isinstance(chunk, dict) and "__usage__" in chunk:
                    u = chunk["__usage__"]
                    tokens_prompt = u.get("prompt_tokens", 0)
                    tokens_completion = u.get("completion_tokens", 0)
                    continue
                accumulated.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

            content = "".join(accumulated)
            ts = db.now_iso()
            c2 = db.get_db()
            c2.execute(
                "INSERT INTO ai_messages (conversation_id, role, content, "
                "tokens_prompt, tokens_completion, cost_usd, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (conv_id, "assistant", content, tokens_prompt,
                 tokens_completion, 0.0, ts),
            )
            c2.execute(
                "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
                (ts, conv_id),
            )
            c2.commit()
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI request failed'})}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@ai_agent.route("/api/ai/tool-confirm/<int:msg_id>", methods=["POST"])
@login_required
@csrf_protect
def tool_confirm(msg_id):
    user = request.current_user
    data = request.get_json(silent=True) or {}
    decision = data.get("decision")
    if decision not in ("approve", "reject"):
        return jsonify(error="Invalid decision"), 400

    cur = db.get_db()
    msg = cur.execute(
        "SELECT m.id, c.user_id FROM ai_messages m "
        "JOIN ai_conversations c ON c.id = m.conversation_id "
        "WHERE m.id = ?",
        (msg_id,),
    ).fetchone()
    if not msg:
        return jsonify(error="Not found"), 404
    if msg["user_id"] != user["id"]:
        return jsonify(error="Forbidden"), 403

    status = "approved" if decision == "approve" else "rejected"
    cur.execute(
        "UPDATE ai_messages SET tool_status = ? WHERE id = ?",
        (status, msg_id),
    )
    cur.commit()
    return jsonify(ok=True, status=status)


@ai_agent.route("/api/ai/models", methods=["GET"])
@login_required
def list_models():
    user = request.current_user
    key, _ = _resolve_key_and_model(user)
    models = ai.get_openrouter_models(key)
    return jsonify(models=models)


@ai_agent.route("/api/ai/usage", methods=["GET"])
@login_required
def usage():
    user = request.current_user
    cur = db.get_db()
    agg = cur.execute(
        "SELECT COALESCE(SUM(m.tokens_prompt), 0) AS tp, "
        "COALESCE(SUM(m.tokens_completion), 0) AS tc, "
        "COALESCE(SUM(m.cost_usd), 0.0) AS cost, "
        "COUNT(m.id) AS messages "
        "FROM ai_messages m "
        "JOIN ai_conversations c ON c.id = m.conversation_id "
        "WHERE c.user_id = ?",
        (user["id"],),
    ).fetchone()
    convs = cur.execute(
        "SELECT COUNT(*) AS c FROM ai_conversations WHERE user_id = ?",
        (user["id"],),
    ).fetchone()["c"]
    return jsonify(
        tokens_prompt=agg["tp"],
        tokens_completion=agg["tc"],
        cost_usd=agg["cost"],
        messages=agg["messages"],
        conversations=convs,
    )
