"""AI assistance module (v2, deferred from the MVP plan).

Design constraints (per PLAN.md §5 "AI / agy — DEFERRED to v2"):
  * Key-gated: requires OPERADESK_OPENROUTER_KEY; OFF if the key is absent.
  * Feature-flagged: config.AI_ENABLED must be True (default True when key set).
  * Draft-only: produces SUGGESTIONS (reply text, summary, priority) that a
    human reviews and edits before use. It never auto-applies anything.
  * Prompt-injection hardened: ticket/comment text is treated as UNTRUSTED DATA,
    never as instructions. The system prompt explicitly forbids following
    directives embedded in user content, and we use a strict delimited
    structure so the model cannot confuse data with commands.
  * Fails closed: any provider error, timeout, or missing key returns a clear
    "AI unavailable" response (never a stack trace, never a silent wrong answer).

Provider: OpenRouter (deepseek free tier) via the chat completions endpoint.
No third-party SDK — urllib only, keeping Python thin and dependency-free.
"""

from .client import (
    ai_enabled,
    suggest_reply,
    summarize_ticket,
    suggest_priority,
    get_openrouter_models,
    stream_chat,
    chat_completion,
)

__all__ = [
    "ai_enabled",
    "suggest_reply",
    "summarize_ticket",
    "suggest_priority",
    "get_openrouter_models",
    "stream_chat",
    "chat_completion",
]
