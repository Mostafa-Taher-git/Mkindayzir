"""AI Chat Core (Phase 4A + 4B): conversation + streaming chat + agentic tools.

Endpoints (all require login; POST/DELETE also require CSRF):
  GET    /api/ai/conversations                 list the current user's chats
  POST   /api/ai/conversations                 create a new chat
  DELETE /api/ai/conversations/<id>            delete a chat (owner only)
  GET    /api/ai/conversations/<id>/messages   list a chat's messages
  POST   /api/ai/chat/<conv_id>                SSE-stream a reply (rate-limited)
  POST   /api/ai/tool-confirm/<msg_id>         record approve/reject decision
  GET    /api/ai/tools                          list available agent tools
  GET    /api/ai/models                        available OpenRouter models
  GET    /api/ai/usage                         usage aggregates for the user

Chat loop (4B): the model may emit tool_calls. Each call is stored as a
`tool_call` ai_message. Tools that require confirmation pause the stream
(awaiting_confirmation) and resume later via { "resume": true }. Tools run AS
the authenticated user through ai.tools.execute_tool, which enforces RBAC.

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
from .ai import tools as ai_tools

ai_agent = Blueprint("ai_agent", __name__)

# In-memory per-user rate limiter: user_id -> [epoch seconds]. Single-process
# deploy only (matches the existing LoginRateLimit approach in auth).
RATE_LIMIT = {}
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 20

# Copilot system prompt injected ahead of the reconstructed conversation.
CHAT_SYSTEM_PROMPT = (
    "You are OpsDesk's AI copilot for IT/support staff. Use the provided tools "
    "when they help. When a tool result is shown, answer the user's question "
    "using it."
)

# Guard against a model that never stops emitting tool calls.
MAX_TURNS = 5


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


@ai_agent.route("/api/ai/tools", methods=["GET"])
@login_required
def list_ai_tools():
    """Public catalog of the agent's tools (for the client UI)."""
    tools = [{
        "name": t["name"],
        "description": t["description"],
        "parameters": t["parameters"],
        "requires_confirm": t["requires_confirm"],
    } for t in ai_tools.REGISTRY.values()]
    return jsonify(tools=tools)


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
    is_resume = bool(data.get("resume"))

    # Validation: either a fresh message, or a resume flag.
    if not is_resume and not message:
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
    # On a fresh message we persist the user turn; on resume we do NOT.
    if not is_resume:
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

    return Response(
        _chat_stream(conv_id, user, key, model, is_resume),
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


# ---------------------------------------------------------------------------
# Tool-calling chat loop
# ---------------------------------------------------------------------------
def _reconstruct_messages(conv_id):
    """Build an OpenAI-protocol message list from stored ai_messages.

    tool_call rows become assistant messages carrying tool_calls (with the
    model's call id pulled from the stored _call_id), and tool_result rows
    become tool messages. The final assistant message we are about to generate
    is NOT stored, so every row here is included.
    """
    rows = db.get_db().execute(
        "SELECT role, content, tool_name, tool_args FROM ai_messages "
        "WHERE conversation_id = ? ORDER BY id ASC",
        (conv_id,),
    ).fetchall()

    messages = []
    i = 0
    n = len(rows)
    while i < n:
        r = dict(rows[i])
        role = r["role"]
        if role == "user":
            messages.append({"role": "user", "content": r["content"]})
            i += 1
        elif role == "assistant":
            messages.append({"role": "assistant", "content": r["content"]})
            i += 1
        elif role == "tool_call":
            # Group consecutive tool_call rows into one assistant message.
            tool_calls = []
            while i < n and dict(rows[i])["role"] == "tool_call":
                cr = dict(rows[i])
                args = json.loads(cr["tool_args"] or "{}")
                call_id = args.pop("_call_id", None)
                tool_calls.append({
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": cr["tool_name"],
                        "arguments": json.dumps(args),
                    },
                })
                i += 1
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": tool_calls,
            })
        elif role == "tool_result":
            args = json.loads(r["tool_args"] or "{}")
            call_id = args.get("_call_id")
            messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": r["content"],
            })
            i += 1
        else:
            i += 1
    return messages


def _store_tool_result(conv_id, tool_name, tool_args, result):
    """Persist a tool_result ai_message (content = JSON of result)."""
    cur = db.get_db()
    res = cur.execute(
        "INSERT INTO ai_messages "
        "(conversation_id, role, content, tool_name, tool_args, tool_status, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (conv_id, "tool_result", json.dumps(result), tool_name,
         tool_args, "executed", db.now_iso()),
    )
    cur.commit()
    return res.lastrowid


def _chat_stream(conv_id, user, key, model, is_resume):
    """Generator yielding SSE events for the agentic chat loop."""
    cur = db.get_db()

    # --- Resume: replay approved/rejected tool calls left pending. ----------
    if is_resume:
        pending = cur.execute(
            "SELECT * FROM ai_messages WHERE conversation_id = ? "
            "AND role = 'tool_call' AND tool_status IN "
            "('approved','rejected','pending_confirm') ORDER BY id ASC",
            (conv_id,),
        ).fetchall()
        for prow in pending:
            prow = dict(prow)
            args = json.loads(prow["tool_args"] or "{}")
            # Strip the internal call id before handing args to the handler.
            exec_args = {k: v for k, v in args.items() if k != "_call_id"}
            original_args = prow["tool_args"]
            if prow["tool_status"] == "approved":
                result = ai_tools.execute_tool(prow["tool_name"], user, exec_args)
                _store_tool_result(conv_id, prow["tool_name"], original_args, result)
            else:
                # rejected (or still pending) -> report to the model.
                result = {"error": "rejected by user"}
                _store_tool_result(conv_id, prow["tool_name"], original_args, result)
            cur.execute(
                "UPDATE ai_messages SET tool_status = 'executed' WHERE id = ?",
                (prow["id"],),
            )
            cur.commit()

    # --- Tool loop -----------------------------------------------------------
    for _turn in range(MAX_TURNS):
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        messages += _reconstruct_messages(conv_id)

        resp = ai.chat_completion(model, messages, api_key=key,
                                  tools=ai_tools.list_tool_schemas())
        if resp is None:
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI request failed'})}\n\n"
            return

        if resp.get("tool_calls"):
            any_pending = False
            for tc in resp["tool_calls"]:
                name = tc["name"]
                arguments = tc["arguments"] or {}
                requires_conf = ai_tools.requires_confirm(name)
                stored_args = json.dumps({**arguments, "_call_id": tc["id"]})
                res = cur.execute(
                    "INSERT INTO ai_messages "
                    "(conversation_id, role, content, tool_name, tool_args, "
                    "tool_status, created_at) VALUES (?,?,?,?,?,?,?)",
                    (conv_id, "tool_call", "", name, stored_args,
                     "pending_confirm" if requires_conf else "approved",
                     db.now_iso()),
                )
                mid = res.lastrowid
                cur.commit()

                if requires_conf:
                    any_pending = True
                    event = json.dumps({'type': 'tool_call', 'id': mid,
                                        'name': name, 'args': arguments,
                                        'requires_confirm': True})
                    yield f"data: {event}\n\n"
                else:
                    result = ai_tools.execute_tool(name, user, arguments)
                    _store_tool_result(conv_id, name, stored_args, result)
                    yield (
                        f"data: {json.dumps({'type': 'tool_result', 'id': mid})}\n\n"
                    )

            if any_pending:
                yield (
                    f"data: {json.dumps({'type': 'done', 'awaiting_confirmation': True})}\n\n"
                )
                return
            # All auto-executed: loop again so the model can answer with results.
            continue

        # --- Final answer (no tool calls) ------------------------------------
        content = resp.get("content") or ""
        usage = resp.get("usage") or {}
        tokens_prompt = int(usage.get("prompt_tokens", 0) or 0)
        tokens_completion = int(usage.get("completion_tokens", 0) or 0)

        words = content.split()
        if not words:
            yield f"data: {json.dumps({'type': 'chunk', 'text': ' '})}\n\n"
        else:
            for w in words:
                yield f"data: {json.dumps({'type': 'chunk', 'text': w + ' '})}\n\n"

        ts = db.now_iso()
        cur.execute(
            "INSERT INTO ai_messages (conversation_id, role, content, "
            "tokens_prompt, tokens_completion, cost_usd, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (conv_id, "assistant", content, tokens_prompt,
             tokens_completion, 0.0, ts),
        )
        cur.execute(
            "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
            (ts, conv_id),
        )
        cur.commit()
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return

    # Exceeded MAX_TURNS without a final answer.
    yield f"data: {json.dumps({'type': 'error', 'message': 'AI request failed'})}\n\n"
