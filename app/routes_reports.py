"""
Reporting & CSAT (Phase 4).

Manager/admin endpoints:
  GET /api/reports/summary      -> counts, backlog, SLA attainment %, avg/median/p90 resolution, CSAT + distribution
  GET /api/reports/workload     -> per-agent open/reassigned counts + avg resolution
  GET /api/reports/sla          -> SLA attainment (met / breached / pending)
  GET /api/reports/trend        -> tickets created/resolved per day (?days=30)
  GET /api/reports/export.csv   -> full ticket dump (CSV)
  GET /api/dashboard/action-center -> unassigned, SLA breaches, stale tickets

Requester satisfaction:
  POST /api/tickets/<id>/rate   -> requester rates 1-5 (owns ticket, once)

All report endpoints accept optional filters:
  ?team_id=&assignee_id=&date_from=&date_to=&days=
"""
import csv
import io
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, Response

from . import db, config, helpers

reports = Blueprint("reports", __name__)


def _mgr_only(user):
    return user["role"] in ("manager", "admin")


def _parse_date_range():
    days = request.args.get("days", "30")
    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        try:
            date_from = datetime.fromisoformat(date_from).strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            date_from = None
    if date_to:
        try:
            date_to = datetime.fromisoformat(date_to).strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            date_to = None
    return days, date_from, date_to


def _date_filter_sql(date_from, date_to, column="t.created_at"):
    clauses = []
    params = []
    if date_from:
        clauses.append(f"{column} >= ?")
        params.append(date_from)
    if date_to:
        clauses.append(f"{column} <= ?")
        params.append(date_to + " 23:59:59")
    return " AND ".join(clauses), params


def _team_filter_sql():
    team_id = request.args.get("team_id", type=int)
    if team_id:
        return "t.team_id = ?", [team_id]
    return "", []


def _agent_filter_sql():
    agent_id = request.args.get("assignee_id", type=int)
    if agent_id:
        return "t.assignee_id = ?", [agent_id]
    return "", []


def _extend_where(where, where_params, extra_sql, extra_params):
    extra_params = list(extra_params)
    if where:
        return f"{where} AND {extra_sql}", where_params + extra_params
    return f" WHERE {extra_sql}", extra_params


def _combined_where():
    team_sql, team_params = _team_filter_sql()
    agent_sql, agent_params = _agent_filter_sql()
    days, date_from, date_to = _parse_date_range()
    date_sql, date_params = _date_filter_sql(date_from, date_to)
    parts = []
    params = []
    if team_sql:
        parts.append(team_sql)
        params.extend(team_params)
    if agent_sql:
        parts.append(agent_sql)
        params.extend(agent_params)
    if date_sql:
        parts.append(date_sql)
        params.extend(date_params)
    where = (" WHERE " + " AND ".join(parts)) if parts else ""
    return where, params, days


def _avg_resolution_seconds(where="", where_params=None):
    where_params = where_params or []
    resolved_where, resolved_params = _extend_where(where, where_params, "t.resolved_at IS NOT NULL", [])
    rows = db.get_db().execute(
        f"SELECT created_at, resolved_at FROM tickets t{resolved_where}",
        resolved_params,
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
    where, where_params, _ = _combined_where()
    conn = db.get_db()
    counts = {}
    for row in conn.execute(
        f"SELECT status, COUNT(*) c FROM tickets t{where} GROUP BY status",
        where_params,
    ).fetchall():
        counts[row["status"]] = row["c"]
    total = sum(counts.values())
    open_count = sum(counts.get(st, 0) for st in ("new", "assigned", "in_progress", "blocked", "reopened"))
    backlog_sql = f"""
        SELECT
          COALESCE(SUM(CASE WHEN t.status IN ('new','assigned','in_progress','blocked','reopened') THEN 1 ELSE 0 END),0) opening,
          COALESCE(SUM(CASE WHEN t.created_at IS NOT NULL THEN 1 ELSE 0 END),0) new_tickets,
          COALESCE(SUM(CASE WHEN t.resolved_at IS NOT NULL THEN 1 ELSE 0 END),0) resolved,
          COALESCE(SUM(CASE WHEN t.status='reopened' THEN 1 ELSE 0 END),0) reopened
        FROM tickets t {where}
    """
    backlog = conn.execute(backlog_sql, where_params).fetchone()
    ending_backlog = (backlog["opening"] or 0) + (backlog["new_tickets"] or 0) - (backlog["resolved"] or 0) + (backlog["reopened"] or 0)
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
    avg_res = _avg_resolution_seconds(where, where_params)
    res_times = []
    resolved_where, resolved_params = _extend_where(where, where_params, "t.resolved_at IS NOT NULL", [])
    for r in conn.execute(
        f"SELECT created_at, resolved_at FROM tickets t{resolved_where}",
        resolved_params,
    ).fetchall():
        c = helpers._parse_iso(r["created_at"])
        rv = helpers._parse_iso(r["resolved_at"])
        if c and rv:
            res_times.append((rv - c).total_seconds())
    median_res_hours = None
    p90_res_hours = None
    if res_times:
        res_times.sort()
        median_res_hours = round(res_times[len(res_times) // 2] / 3600, 1)
        p90_res_hours = round(res_times[int(len(res_times) * 0.9)] / 3600, 1)
    csat_where, csat_params = _extend_where(where, where_params, "t.csat IS NOT NULL", [])
    csat_rows = conn.execute(
        f"SELECT AVG(csat) avg_csat, COUNT(csat) n FROM tickets t{csat_where}",
        csat_params,
    ).fetchone()
    csat_distribution = {}
    for score in range(1, 6):
        csat_score_where, csat_score_params = _extend_where(where, where_params, "t.csat = ?", [score])
        row = conn.execute(
            f"SELECT COUNT(*) c FROM tickets t{csat_score_where}",
            csat_score_params,
        ).fetchone()
        csat_distribution[score] = row["c"]
    return jsonify(
        total=total,
        by_status=counts,
        open=open_count,
        backlog=dict(
            opening=backlog["opening"] or 0,
            new=backlog["new_tickets"] or 0,
            resolved=backlog["resolved"] or 0,
            reopened=backlog["reopened"] or 0,
            ending=ending_backlog,
        ),
        sla_attainment_pct=sla_pct,
        sla_met=met,
        sla_missed=missed,
        avg_resolution_hours=round(avg_res / 3600, 1) if avg_res else None,
        median_resolution_hours=median_res_hours,
        p90_resolution_hours=p90_res_hours,
        avg_csat=round(csat_rows["avg_csat"], 2) if csat_rows["avg_csat"] else None,
        csat_responses=csat_rows["n"] or 0,
        csat_distribution=csat_distribution,
    )


@reports.route("/api/reports/workload", methods=["GET"])
@helpers.login_required
def workload():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    where, where_params, _ = _combined_where()
    conn = db.get_db()
    agents = conn.execute(
        "SELECT id, name, team_id FROM users WHERE role IN ('agent','manager','admin')"
    ).fetchall()
    out = []
    for a in agents:
        open_n = conn.execute(
            f"SELECT COUNT(*) c FROM tickets t {where} AND t.assignee_id=? AND t.status IN ('assigned','in_progress','blocked','reopened')",
            where_params + [a["id"]],
        ).fetchone()["c"]
        resolved = conn.execute(
            f"SELECT COUNT(*) c FROM tickets t {where} AND t.assignee_id=? AND t.resolved_at IS NOT NULL",
            where_params + [a["id"]],
        ).fetchone()["c"]
        avg = None
        rows = conn.execute(
            f"SELECT created_at, resolved_at FROM tickets t {where} AND t.assignee_id=? AND t.resolved_at IS NOT NULL",
            where_params + [a["id"]],
        ).fetchall()
        if rows:
            tot = 0
            n = 0
            for r in rows:
                c = helpers._parse_iso(r["created_at"])
                rv = helpers._parse_iso(r["resolved_at"])
                if c and rv:
                    tot += (rv - c).total_seconds()
                    n += 1
            avg = round(tot / n / 3600, 1) if n else None
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
    where, where_params, _ = _combined_where()
    conn = db.get_db()
    met = conn.execute(
        f"SELECT COUNT(*) c FROM ticket_sla ts JOIN tickets t ON t.id=ts.ticket_id {where} AND ts.resolution_met=1",
        where_params,
    ).fetchone()["c"]
    missed = conn.execute(
        f"SELECT COUNT(*) c FROM ticket_sla ts JOIN tickets t ON t.id=ts.ticket_id {where} AND (ts.resolution_met=0 OR ts.breached=1)",
        where_params,
    ).fetchone()["c"]
    pending = conn.execute(
        f"SELECT COUNT(*) c FROM ticket_sla ts JOIN tickets t ON t.id=ts.ticket_id {where} AND ts.resolution_met IS NULL AND t.status NOT IN ('resolved','closed')",
        where_params,
    ).fetchone()["c"]
    return jsonify(met=met, missed=missed, pending=pending,
                   attainment_pct=round(100.0 * met / (met + missed), 1) if (met + missed) else None)


@reports.route("/api/dashboard/action-center", methods=["GET"])
@helpers.login_required
def action_center():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    where, where_params, _ = _combined_where()
    conn = db.get_db()
    unassigned_where, unassigned_params = _extend_where(where, where_params, "t.assignee_id IS NULL AND t.status NOT IN ('resolved','closed')", [])
    unassigned = conn.execute(
        f"SELECT id, subject, status, priority, created_at FROM tickets t {unassigned_where} ORDER BY created_at ASC",
        unassigned_params,
    ).fetchall()
    breached_where, breached_params = _extend_where(where, where_params, "ts.breached=1", [])
    breached = conn.execute(
        f"SELECT t.id, t.subject, t.status, t.priority, ts.breach_at FROM ticket_sla ts "
        f"JOIN tickets t ON t.id=ts.ticket_id {breached_where} ORDER BY ts.breach_at ASC",
        breached_params,
    ).fetchall()
    stale_where, stale_params = _extend_where(where, where_params, "t.status IN ('assigned','in_progress') AND t.updated_at <= datetime('now','-24 hours','utc')", [])
    stale = conn.execute(
        f"SELECT t.id, t.subject, t.status, t.priority, t.updated_at FROM tickets t {stale_where} ORDER BY t.updated_at ASC",
        stale_params,
    ).fetchall()

    def _serialize_ticket(row):
        return {
            "id": row["id"],
            "subject": row["subject"],
            "status": row["status"],
            "priority": row["priority"],
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "breach_at": row.get("breach_at"),
        }
    return jsonify(
        unassigned=[_serialize_ticket(r) for r in unassigned],
        breached=[_serialize_ticket(r) for r in breached],
        stale=[_serialize_ticket(r) for r in stale],
    )


@reports.route("/api/reports/trend", methods=["GET"])
@helpers.login_required
def trend():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    days, date_from, date_to = _parse_date_range()
    date_sql, date_params = _date_filter_sql(date_from, date_to)
    team_sql, team_params = _team_filter_sql()
    agent_sql, agent_params = _agent_filter_sql()
    where_parts = []
    where_params = []
    if team_sql:
        where_parts.append(team_sql)
        where_params.extend(team_params)
    if agent_sql:
        where_parts.append(agent_sql)
        where_params.extend(agent_params)
    if date_sql:
        where_parts.append(date_sql)
        where_params.extend(date_params)
    where = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""
    resolved_where = where
    resolved_params = list(where_params)
    if resolved_where:
        resolved_where += " AND t.resolved_at IS NOT NULL"
    else:
        resolved_where = " WHERE t.resolved_at IS NOT NULL"
    conn = db.get_db()
    created = conn.execute(
        f"SELECT substr(t.created_at,1,10) d, COUNT(*) c FROM tickets t {where} GROUP BY d ORDER BY d",
        where_params,
    ).fetchall()
    resolved = conn.execute(
        f"SELECT substr(t.resolved_at,1,10) d, COUNT(*) c FROM tickets t {resolved_where} GROUP BY d ORDER BY d",
        resolved_params,
    ).fetchall()
    created_map = {r["d"]: r["c"] for r in created}
    resolved_map = {r["d"]: r["c"] for r in resolved}
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
    where, where_params, _ = _combined_where()
    conn = db.get_db()
    query = (
        "SELECT id, ticket_ref, subject, status, priority, requester_id, "
        "assignee_id, team_id, category_id, created_at, resolved_at, closed_at, csat "
        f"FROM tickets t {where} ORDER BY id"
    )
    rows = conn.execute(query, where_params).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)

    def _safe(v):
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
        "SELECT id, requester_id, status, csat FROM tickets WHERE id=?", (tid,)
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
    helpers.log_activity(tid, user["id"], "rated", note=f"CSAT {score}/5")
    return jsonify(ok=True, csat=score)


@reports.route("/api/reports/knowledge", methods=["GET"])
@helpers.login_required
def knowledge_report():
    if not _mgr_only(request.current_user):
        return jsonify(error="Forbidden"), 403
    where, where_params, _ = _combined_where()
    conn = db.get_db()
    stats = conn.execute("""
        SELECT
          (SELECT COALESCE(SUM(views),0) FROM kb_articles) AS views,
          (SELECT COUNT(*) FROM kb_articles) AS articles,
          (SELECT COALESCE(SUM(helpful),0) FROM kb_feedback) AS helpful,
          (SELECT COUNT(*) FROM kb_feedback) AS feedbacks,
          (SELECT COUNT(DISTINCT ticket_id) FROM ticket_kb_links) AS linked_tickets,
          (SELECT COUNT(*) FROM kb_articles) -
          (SELECT COUNT(DISTINCT article_id) FROM ticket_kb_links) AS orphan_articles
    """).fetchone()
    no_result_searches = 0
    top_gaps = []
    return jsonify(
        article_views=stats["views"],
        articles=stats["articles"],
        helpful_count=stats["helpful"],
        feedback_count=stats["feedbacks"],
        ticket_usage_count=stats["linked_tickets"],
        orphan_count=stats["orphan_articles"],
        no_result_searches=no_result_searches,
        top_gaps=top_gaps,
    )
