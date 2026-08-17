"""
Reporting & CSAT (Phase 4).

Manager/admin endpoints:
  GET /api/reports/summary   -> counts, SLA attainment %, avg resolution, avg CSAT
  GET /api/reports/workload  -> per-agent open/reassigned counts + avg resolution
  GET /api/reports/sla        -> SLA attainment (met / breached / pending)
  GET /api/reports/trend      -> tickets created/resolved per day (?days=30)
  GET /api/reports/export.csv -> full ticket dump (CSV)

Requester satisfaction:
  POST /api/tickets/<id>/rate -> requester rates 1-5 (owns ticket, once)
"""
import csv
import io

from flask import Blueprint, request, jsonify, Response

from . import db, config, helpers

reports = Blueprint("reports", __name__)


def _mgr_only(user):
    return user["role"] in ("manager", "admin")


def _avg_resolution_seconds():
    """Average seconds from created_at to resolved_at across resolved tickets."""
    rows = db.get_db().execute(
        "SELECT created_at, resolved_at FROM tickets WHERE resolved_at IS NOT NULL"
    ).fetchall()
    total = 0
    n = 0
    for r in rows:
        c = helpers._parse_iso(r["created_at"])
        rv = helpers._parse_iso(r["resolved_at"])
        if c and rv:
            total += (rv - c).total_seconds()
            n += 1
    return (total / n) if n else None


@reports.route("/api/reports/summary", methods=["GET"])
@helpers.login_required
def summary():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    conn = db.get_db()
    counts = {}
    for row in conn.execute(
        "SELECT status, COUNT(*) c FROM tickets GROUP BY status"
    ).fetchall():
        counts[row["status"]] = row["c"]
    total = sum(counts.values())
    # SLA attainment
    sla = conn.execute(
        "SELECT "
        "SUM(CASE WHEN resolution_met = 1 THEN 1 ELSE 0 END) met, "
        "SUM(CASE WHEN resolution_met = 0 OR breached = 1 THEN 1 ELSE 0 END) missed, "
        "COUNT(*) all_sla "
        "FROM ticket_sla"
    ).fetchone()
    met = sla["met"] or 0
    missed = sla["missed"] or 0
    sla_pct = round(100.0 * met / (met + missed), 1) if (met + missed) else None
    avg_res = _avg_resolution_seconds()
    csat_rows = conn.execute(
        "SELECT AVG(csat) avg_csat, COUNT(csat) n FROM tickets WHERE csat IS NOT NULL"
    ).fetchone()
    return jsonify(
        total=total,
        by_status=counts,
        open=counts.get("new", 0) + counts.get("assigned", 0) + counts.get("in_progress", 0) + counts.get("blocked", 0) + counts.get("reopened", 0),
        sla_attainment_pct=sla_pct,
        sla_met=met,
        sla_missed=missed,
        avg_resolution_hours=round(avg_res / 3600, 1) if avg_res else None,
        avg_csat=round(csat_rows["avg_csat"], 2) if csat_rows["avg_csat"] else None,
        csat_responses=csat_rows["n"] or 0,
    )


@reports.route("/api/reports/workload", methods=["GET"])
@helpers.login_required
def workload():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    conn = db.get_db()
    agents = conn.execute(
        "SELECT id, name, team_id FROM users WHERE role IN ('agent','manager','admin')"
    ).fetchall()
    out = []
    for a in agents:
        open_n = conn.execute(
            "SELECT COUNT(*) c FROM tickets WHERE assignee_id=? AND status IN "
            "('assigned','in_progress','blocked','reopened')", (a["id"],)
        ).fetchone()["c"]
        resolved = conn.execute(
            "SELECT COUNT(*) c FROM tickets WHERE assignee_id=? AND resolved_at IS NOT NULL",
            (a["id"],)
        ).fetchone()["c"]
        avg = None
        rows = conn.execute(
            "SELECT created_at, resolved_at FROM tickets "
            "WHERE assignee_id=? AND resolved_at IS NOT NULL", (a["id"],)
        ).fetchall()
        if rows:
            tot = 0
            for r in rows:
                c = helpers._parse_iso(r["created_at"])
                rv = helpers._parse_iso(r["resolved_at"])
                if c and rv:
                    tot += (rv - c).total_seconds()
            avg = round(tot / len(rows) / 3600, 1)
        out.append({
            "id": a["id"], "name": a["name"],
            "open": open_n, "resolved": resolved,
            "avg_resolution_hours": avg,
        })
    return jsonify(agents=out)


@reports.route("/api/reports/sla", methods=["GET"])
@helpers.login_required
def sla_report():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    conn = db.get_db()
    met = conn.execute("SELECT COUNT(*) c FROM ticket_sla WHERE resolution_met=1").fetchone()["c"]
    missed = conn.execute("SELECT COUNT(*) c FROM ticket_sla WHERE resolution_met=0 OR breached=1").fetchone()["c"]
    pending = conn.execute(
        "SELECT COUNT(*) c FROM ticket_sla ts JOIN tickets t ON t.id=ts.ticket_id "
        "WHERE ts.resolution_met IS NULL AND t.status NOT IN ('resolved','closed')"
    ).fetchone()["c"]
    return jsonify(met=met, missed=missed, pending=pending,
                   attainment_pct=round(100.0 * met / (met + missed), 1) if (met + missed) else None)


@reports.route("/api/reports/trend", methods=["GET"])
@helpers.login_required
def trend():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    days = request.args.get("days", "30")
    try:
        days = int(days)
    except ValueError:
        days = 30
    days = max(1, min(days, 365))
    conn = db.get_db()
    created = conn.execute(
        "SELECT substr(created_at,1,10) d, COUNT(*) c FROM tickets "
        "WHERE created_at >= date('now', ?) GROUP BY d ORDER BY d",
        (f"-{days} days",)
    ).fetchall()
    resolved = conn.execute(
        "SELECT substr(resolved_at,1,10) d, COUNT(*) c FROM tickets "
        "WHERE resolved_at IS NOT NULL AND resolved_at >= date('now', ?) GROUP BY d ORDER BY d",
        (f"-{days} days",)
    ).fetchall()
    created_map = {r["d"]: r["c"] for r in created}
    resolved_map = {r["d"]: r["c"] for r in resolved}
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        series.append({"date": d, "created": created_map.get(d, 0),
                       "resolved": resolved_map.get(d, 0)})
    return jsonify(days=days, series=series)


@reports.route("/api/reports/export.csv", methods=["GET"])
@helpers.login_required
def export_csv():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    conn = db.get_db()
    rows = conn.execute(
        "SELECT id, ticket_ref, subject, status, priority, requester_id, "
        "assignee_id, team_id, category_id, created_at, resolved_at, closed_at, csat "
        "FROM tickets ORDER BY id"
    ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)

    def _safe(v):
        # Prevent CSV/formula injection: a leading = + - @ makes Excel/LibreOffice
        # treat the cell as a formula. Prefix with a single quote to neutralize.
        s = "" if v is None else str(v)
        if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
            return "'" + s
        return s

    w.writerow(["id", "ref", "subject", "status", "priority", "requester_id",
                "assignee_id", "team_id", "category_id", "created_at",
                "resolved_at", "closed_at", "csat"])
    for r in rows:
        w.writerow([_safe(r["id"]), _safe(r["ticket_ref"]), _safe(r["subject"]), _safe(r["status"]), _safe(r["priority"]),
                    _safe(r["requester_id"]), _safe(r["assignee_id"]), _safe(r["team_id"]), _safe(r["category_id"]),
                    _safe(r["created_at"]), _safe(r["resolved_at"]), _safe(r["closed_at"]), _safe(r["csat"])])
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=opsdesk-tickets.csv"})


@reports.route("/api/tickets/<int:tid>/rate", methods=["POST"])
@helpers.login_required
@helpers.csrf_protect
def rate_ticket(tid):
    user = request.current_user
    t = db.get_db().execute(
        "SELECT id, requester_id, status, csat, resolved_at FROM tickets WHERE id=?", (tid,)
    ).fetchone()
    if not t:
        return jsonify(error="Not found"), 404
    if user["role"] != "requester" or t["requester_id"] != user["id"]:
        return jsonify(error="Forbidden"), 403
    if t["csat"] is not None:
        return jsonify(error="Already rated"), 400
    if t["status"] not in ("resolved", "closed"):
        return jsonify(error="Can only rate resolved tickets"), 400
    data = request.get_json(force=True, silent=True) or {}
    score = data.get("score")
    if not isinstance(score, int) or score < 1 or score > 5:
        return jsonify(error="score must be 1-5"), 400
    db.get_db().execute("UPDATE tickets SET csat=? WHERE id=?", (score, tid))
    db.get_db().commit()
    return jsonify(ok=True, csat=score)
