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
    # Per-user AI availability: the panel shows when THIS user has supplied a
    # key (or a deployment-wide key exists). Also hand the SPA the curated list
    # of free models for the settings picker.
    from . import config as _cfg
    from .helpers import decrypt_secret
    import os as _os
    u = request.current_user
    has_key = bool(decrypt_secret(u.get("ai_key")) or
                   _os.environ.get("OPERADESK_OPENROUTER_KEY"))
    ai_enabled = _cfg.AI_ENABLED and has_key
    return jsonify(user=row_to_public(u),
                   ai_enabled=ai_enabled,
                   ai_model=u.get("ai_model") or _cfg.AI_MODEL_DEFAULT,
                   ai_free_models=_cfg.AI_FREE_MODELS)


def row_to_public(u):
    """Strip the password hash before sending a user to the client."""
    return {
        "id": u["id"],
        "name": u["name"],
        "email": u["email"],
        "role": u["role"],
        "team_id": u["team_id"],
    }


# ---------------------------------------------------------------------------
# Password reset (Phase 1). Two-step, token-by-email.
#   /api/auth/forgot-password  POST {email}            -> mints+emails a token
#   /api/auth/reset-password   POST {token,password}   -> sets new password
# If SMTP is not configured the token is not emailed, but we still return a
# generic success (we never confirm whether the address exists) and the admin
# can surface it in-app. For local/dev convenience the token is printed to the
# server console so you are not blocked without mail.
# ---------------------------------------------------------------------------
import secrets as _secrets
from datetime import datetime as _dt, timezone as _tz, timedelta


@auth.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    # Always return the same generic response to avoid account enumeration.
    generic = jsonify(ok=True,
                      message="If that account exists, a reset link is on its way.")

    row = db.get_db().execute(
        "SELECT id, email, name FROM users WHERE email = ?", (email,)
    ).fetchone()
    if not row:
        return generic, 200

    token = _secrets.token_urlsafe(32)
    expires = _dt.now(_tz.utc) + timedelta(minutes=config.RESET_TOKEN_MINUTES)
    db.get_db().execute(
        "INSERT OR REPLACE INTO password_resets (token, email, expires_at, used) "
        "VALUES (?,?,?,0)",
        (token, row["email"], expires.isoformat()),
    )
    db.get_db().commit()

    link = f"{config.APP_BASE_URL}/#/reset?token={token}"
    # Best-effort email; if no SMTP, print the link so devs aren't blocked.
    if config.SMTP_HOST:
        try:
            from .notifications import _send_email
            _send_email(row["id"], "OpsDesk password reset",
                        f"Hi {row['name']},\n\nReset your password here (valid "
                        f"{config.RESET_TOKEN_MINUTES} min): {link}\n")
        except Exception as exc:  # noqa: BLE001
            print(f"[forgot-password] email failed: {exc}; dev link: {link}")
    else:
        print(f"[forgot-password] SMTP not configured — dev reset link: {link}")

    return generic, 200


@auth.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    new_pw = data.get("password") or ""

    if len(new_pw) < config.PASSWORD_MIN_LENGTH:
        return jsonify(error=f"Password must be at least "
                             f"{config.PASSWORD_MIN_LENGTH} characters"), 400

    row = db.get_db().execute(
        "SELECT token, email, expires_at, used FROM password_resets WHERE token = ?",
        (token,),
    ).fetchone()
    if not row or row["used"]:
        return jsonify(error="Invalid or expired reset token"), 400
    if _dt.fromisoformat(row["expires_at"]) < _dt.now(_tz.utc):
        return jsonify(error="Invalid or expired reset token"), 400

    from werkzeug.security import generate_password_hash
    db.get_db().execute(
        "UPDATE users SET password = ? WHERE email = ?",
        (generate_password_hash(new_pw), row["email"]),
    )
    db.get_db().execute(
        "UPDATE password_resets SET used = 1 WHERE token = ?", (token,))
    db.get_db().commit()
    return jsonify(ok=True, message="Password updated. You can sign in now.")
