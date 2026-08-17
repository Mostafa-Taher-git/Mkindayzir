"""
SLA policies & ticketing SLA tracking (Phase 3).

- sla_policies: named targets (response/resolution hours) keyed by priority and
  optionally category.
- ticket_sla: per-ticket row linking to the matched policy, recording the
  first-response timestamp and the resolution breach deadline.

The matching + booking happens in routes_tickets (create/assign/status) so the
SLA is attached exactly once at creation and evaluated on resolution. This
module exposes helpers + read/admin endpoints and keeps Python thin.
"""
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify

from . import db, config, helpers

sla = Blueprint("sla", __name__)


def pick_policy(category_id, priority):
    """Choose the best SLA policy for a ticket.

    Preference: category+priority match, then priority-only, then any
    (category-specific Standard), finally the first available.
    """
    conn = db.get_db()
    rows = [dict(r) for r in conn.execute("SELECT * FROM sla_policies").fetchall()]
    if not rows:
        return None
    by_cat_pri = [r for r in rows if r["category_id"] == category_id and r["priority"] == priority]
    if by_cat_pri:
        return by_cat_pri[0]
    by_pri = [r for r in rows if r["priority"] == priority]
    if by_pri:
        return by_pri[0]
    by_cat = [r for r in rows if r["category_id"] == category_id]
    if by_cat:
        return by_cat[0]
    return rows[0]


def attach_sla(ticket):
    """Create a ticket_sla row for a brand-new ticket. Idempotent."""
    ticket = dict(ticket)  # sqlite3.Row -> dict for .get() access
    conn = db.get_db()
    exists = conn.execute(
        "SELECT 1 FROM ticket_sla WHERE ticket_id=?", (ticket["id"],)).fetchone()
    if exists:
        return
    policy = pick_policy(ticket.get("category_id"), ticket.get("priority", "normal"))
    created = helpers._parse_iso(ticket["created_at"]) or datetime.now(timezone.utc)
    if policy:
        breach_at = created + timedelta(hours=policy["resolution_hours"])
    else:
        breach_at = created + timedelta(hours=72)
    conn.execute(
        """INSERT INTO ticket_sla (ticket_id, policy_id, first_response_at, breach_at, breached, response_met, resolution_met)
           VALUES (?,?,?,?,0,NULL,NULL)""",
        (ticket["id"], policy["id"] if policy else None,
         None, breach_at.isoformat()))
    conn.commit()


def record_first_response(ticket_id):
    """Mark first agent response (assign/comment) if not already set."""
    conn = db.get_db()
    row = conn.execute("SELECT * FROM ticket_sla WHERE ticket_id=?", (ticket_id,)).fetchone()
    if not row or row["first_response_at"]:
        return
    now = db.now_iso()
    conn.execute("UPDATE ticket_sla SET first_response_at=? WHERE ticket_id=?",
                 (now, ticket_id))
    conn.commit()


def summarize(ticket_id):
    """Single source of truth for a ticket's SLA state.

    Computes `breached` LIVE (now > breach_at) so overdue open tickets show as
    breached in the UI instead of always "on track". For resolved/closed tickets
    the stored response_met / resolution_met are authoritative.
    """
    conn = db.get_db()
    row = conn.execute(
        "SELECT ts.*, sp.name AS policy_name FROM ticket_sla ts "
        "LEFT JOIN sla_policies sp ON sp.id=ts.policy_id WHERE ts.ticket_id=?",
        (ticket_id,)).fetchone()
    if not row:
        return None
    now = datetime.now(timezone.utc)
    breach_at = helpers._parse_iso(row["breach_at"])
    ticket = conn.execute("SELECT status FROM tickets WHERE id=?", (ticket_id,)).fetchone()
    is_open = ticket and ticket["status"] not in ("resolved", "closed")
    breached = bool(row["breached"]) or (is_open and breach_at is not None and now > breach_at)
    return {
        "policy_name": row["policy_name"],
        "breach_at": row["breach_at"],
        "breached": breached,
        "first_response_at": row["first_response_at"],
        "response_met": row["response_met"],
        "resolution_met": row["resolution_met"],
    }


def evaluate_on_resolve(ticket_id):
    """When a ticket is resolved, decide response_met / resolution_met / breached."""
    conn = db.get_db()
    row = conn.execute("SELECT * FROM ticket_sla WHERE ticket_id=?", (ticket_id,)).fetchone()
    if not row:
        return
    now = datetime.now(timezone.utc)
    breach = helpers._parse_iso(row["breach_at"]) or now
    breached = 1 if now > breach else 0
    policy = conn.execute("SELECT * FROM sla_policies WHERE id=?",
                          (row["policy_id"],)).fetchone() if row["policy_id"] else None
    response_met = None
    if row["first_response_at"] and policy:
        # Response SLA: first response must arrive within response_hours of *creation*.
        created = helpers._parse_iso(conn.execute(
            "SELECT created_at FROM tickets WHERE id=?", (ticket_id,)).fetchone()["created_at"])
        if created:
            resp_target = created + timedelta(hours=policy["response_hours"])
            response_met = 1 if helpers._parse_iso(row["first_response_at"]) <= resp_target else 0
        else:
            response_met = 0
    else:
        # Resolved with no first response -> response SLA missed.
        response_met = 0
    conn.execute(
        "UPDATE ticket_sla SET breached=?, response_met=?, resolution_met=? WHERE ticket_id=?",
        (breached, response_met, 0 if breached else 1, ticket_id))
    conn.commit()


@sla.route("/api/sla-policies", methods=["GET"])
@helpers.login_required
def list_policies():
    rows = db.get_db().execute("SELECT * FROM sla_policies ORDER BY priority, name").fetchall()
    return jsonify(policies=[dict(r) for r in rows])


@sla.route("/api/sla-policies", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def create_policy():
    user = request.current_user
    if user["role"] not in ("manager", "admin"):
        return jsonify(error="Not allowed"), 403
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    try:
        response_hours = float(data.get("response_hours"))
        resolution_hours = float(data.get("resolution_hours"))
    except (TypeError, ValueError):
        return jsonify(error="response_hours and resolution_hours must be numbers"), 400
    if not name or response_hours <= 0 or resolution_hours <= 0:
        return jsonify(error="Invalid policy fields"), 400
    cur = db.get_db().execute(
        """INSERT INTO sla_policies (name, priority, category_id, response_hours, resolution_hours)
           VALUES (?,?,?,?,?)""",
        (name, data.get("priority", "normal"), data.get("category_id") or None,
         response_hours, resolution_hours))
    db.get_db().commit()
    return jsonify(policy=dict(db.get_db().execute(
        "SELECT * FROM sla_policies WHERE id=?", (cur.lastrowid,)).fetchone())), 201


@sla.route("/api/tickets/<int:tid>/sla", methods=["GET"])
@helpers.login_required
def ticket_sla(tid):
    from .routes_tickets import _fetch
    t = _fetch(tid)
    if not t or not helpers.can_view_ticket(request.current_user, t):
        return jsonify(error="Not found"), 404
    row = db.get_db().execute(
        "SELECT ts.*, sp.name AS policy_name FROM ticket_sla ts "
        "LEFT JOIN sla_policies sp ON sp.id=ts.policy_id WHERE ts.ticket_id=?",
        (tid,)).fetchone()
    if not row:
        return jsonify(sla=None)
    # Compute breach live (overdue open tickets) via summarize() so the client
    # sees accurate state without a separate sweep.
    return jsonify(sla=summarize(tid))
