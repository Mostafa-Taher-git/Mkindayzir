"""
OpsDesk application factory.

Creates the Flask app, wires up the blueprints, serves the single-page
frontend from /, and provides the auto-close background job.
"""
import os
import threading
import time
from datetime import datetime, timezone, timedelta

from flask import Flask, send_from_directory, jsonify

from . import config, db
from . import helpers
from .routes_auth import auth as auth_bp
from .routes_tickets import tickets as tickets_bp
from .routes_admin import admin as admin_bp


def create_app():
    app = Flask(__name__, static_folder=os.path.join(config.BASE_DIR, "static"))
    app.secret_key = config.SECRET_KEY

    # Ensure DB + seed is ready before serving.
    db.init_db()

    app.register_blueprint(auth_bp)
    app.register_blueprint(tickets_bp)
    app.register_blueprint(admin_bp)

    # ---- Serve the single-page frontend ----
    @app.route("/")
    @app.route("/<path:path>")
    def index(path=""):
        # API paths are handled by blueprints; everything else -> app shell.
        if path.startswith("api/"):
            return jsonify(error="Not found"), 404
        from flask import send_file
        return send_file(f"{config.BASE_DIR}/templates/index.html")

    # ---- Auto-close job (FR-22): resolved -> closed after 72h ----
    @app.route("/api/admin/run-autoclose", methods=["POST"])
    @helpers.role_required(config.ROLE_ADMIN)
    def run_autoclose():
        n = auto_close_resolved()
        return jsonify(closed=n)

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
