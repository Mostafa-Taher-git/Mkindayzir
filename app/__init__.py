"""
OpsDesk application factory.

Creates the Flask app, wires up the blueprints, serves the single-page
frontend from /, and provides the auto-close background job.
"""
import os
import threading
import time
from datetime import datetime, timezone, timedelta

from flask import Flask, jsonify

from . import config, db
from . import helpers
from .routes_auth import auth as auth_bp
from .routes_tickets import tickets as tickets_bp
from .routes_admin import admin as admin_bp


def create_app():
    app = Flask(__name__, static_folder=config.STATIC_DIR)
    # (A) SECRET_KEY hardening note:
    #   config.SECRET_KEY reads from the OPERADESK_SECRET env var and only
    #   falls back to the fixed "dev-secret-change-me" for local/dev. For ANY
    #   real/production deployment you MUST set OPERADESK_SECRET to a long
    #   random value (e.g. `python -c "import secrets;print(secrets.token_hex(32))"`).
    #   If this value is guessable, session cookies can be forged.
    app.secret_key = config.SECRET_KEY

    # (B) Session cookie hardening (Phase 0):
    #   HTTPONLY=True  -> JS can never read the cookie (XSS can't steal it)
    #   SAMESITE='Lax' -> cross-site fetch forgeries are blocked while our own
    #                     same-site fetch calls still work
    #   SECURE         -> only set when behind HTTPS (env OPERADESK_COOKIE_SECURE=1).
    #                     The dev server is plain HTTP, so it defaults to False.
    app.config["SESSION_COOKIE_SECURE"] = config.SESSION_COOKIE_SECURE
    app.config["SESSION_COOKIE_HTTPONLY"] = config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = config.SESSION_COOKIE_SAMESITE

    # Close the per-request DB connection after each request.
    app.teardown_appcontext(db.close_db)

    # Ensure DB + seed is ready before serving (runs inside the app context).
    with app.app_context():
        db.init_db()

    app.register_blueprint(auth_bp)
    app.register_blueprint(tickets_bp)
    app.register_blueprint(admin_bp)

    # ---- Serve the single-page frontend ----
    # The shell is just static markup, so it does NOT require login. Client-side
    # boot() calls /api/auth/me and shows the login view when unauthenticated.
    # NOTE: never decorate this with @login_required — there is no server-rendered
    # login page, so a logged-out browser would bounce to a non-existent route
    # and loop. Auth is enforced on every /api/* endpoint instead.
    @app.route("/")
    @app.route("/<path:path>")
    def index(path=""):
        # API paths are handled by blueprints; everything else -> app shell.
        if path.startswith("api/"):
            return jsonify(error="Not found"), 404
        from flask import send_file
        # Ensure the data directory (uploads) exists even on a fresh clone.
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        return send_file(f"{config.BASE_DIR}/templates/index.html")

    # ---- Auto-close job (FR-22): resolved -> closed after 72h ----
    @app.route("/api/admin/run-autoclose", methods=["POST"])
    @helpers.role_required(config.ROLE_ADMIN)
    @helpers.csrf_protect
    def run_autoclose():
        n = auto_close_resolved()
        return jsonify(closed=n)

    # (C) Error handling: in debug mode an unhandled exception would otherwise
    #   dump a raw Werkzeug stack trace (HTML) to the client. API consumers
    #   (the SPA) expect JSON. Return JSON errors for /api/* paths; debug
    #   behaviour is otherwise unchanged. No routes are disabled.
    @app.errorhandler(400)
    @app.errorhandler(404)
    @app.errorhandler(405)
    @app.errorhandler(409)
    @app.errorhandler(413)
    @app.errorhandler(500)
    def _json_api_errors(err):
        from flask import request
        if request.path.startswith("/api/"):
            code = getattr(err, "code", 500) or 500
            msg = getattr(err, "description", "Internal server error")
            return jsonify(error=msg), code
        # Non-API paths keep Flask's default handling.
        return err

    _start_autoclose_thread(app)
    return app


def auto_close_resolved():
    """Close any resolved ticket whose reopen window has elapsed."""
    cutoff = (datetime.now(timezone.utc) - timedelta(
        hours=config.AUTO_CLOSE_HOURS)).isoformat()
    cur = db.get_db().execute(
        """UPDATE tickets SET status='closed', closed_at=? , updated_at=?
           WHERE status='resolved' AND resolved_at <= ?""",
        (datetime.now(timezone.utc).isoformat(),
         datetime.now(timezone.utc).isoformat(), cutoff),
    )
    db.get_db().commit()
    n = cur.rowcount
    if n:
        # log each closure lightly
        for t in db.get_db().execute(
                "SELECT id FROM tickets WHERE status='closed' AND closed_at >= ?",
                (cutoff,)).fetchall():
            helpers.log_activity(t["id"], None, "auto_closed",
                                 config.STATUS_RESOLVED, config.STATUS_CLOSED)
    return n


def _start_autoclose_thread(app):
    """Run auto-close every hour in the background (no cron needed)."""
    def loop():
        while True:
            try:
                with app.app_context():
                    auto_close_resolved()
            except Exception:
                pass
            time.sleep(3600)
    t = threading.Thread(target=loop, daemon=True)
    t.start()
