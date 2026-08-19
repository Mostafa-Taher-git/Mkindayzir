/* ==========================================================================
   OpsDesk views (extracted from app.js).

   Every screen's render function lives here and registers on
   window.OpsDesk.views. This file loads BEFORE app.js, so shared helpers
   (OD.h) and state (OD.state) are only referenced at call time — never at
   load time — through the thin lazy aliases below.

   Edit this file to change what each screen shows.
   ========================================================================== */
(() => {
  "use strict";

  window.OpsDesk = window.OpsDesk || {};
  const OD = window.OpsDesk;
  OD.views = OD.views || {};
  const views = OD.views;

  /* Lazy aliases into OD.h (defined by app.js, which loads after this file). */
  const H = () => OD.h;
  const $ = (s, r) => H().$(s, r);
  const el = (t, a, ...c) => H().el(t, a, ...c);
  const esc = (s) => H().esc(s);
  const toast = (m, k) => H().toast(m, k);
  const fmtDate = (i) => H().fmtDate(i);
  const ago = (i) => H().ago(i);
  const statusBadge = (s) => H().statusBadge(s);
  const priorityLabel = (p) => H().priorityLabel(p);
  const priorityPill = (p) => H().priorityPill(p);
  const slaBadge = (t) => H().slaBadge(t);
  const STATUS_LABELS = () => H().STATUS_LABELS;
  const isAgent = () => H().isAgent();
  const isAdmin = () => H().isAdmin();
  const isStaffRole = (r) => H().isStaffRole(r);
  const nameOf = (id, fb) => H().nameOf(id, fb);
  const teamName = (id) => H().teamName(id);
  const catName = (id) => H().catName(id);
  const categoryName = (id) => H().categoryName(id);
  const loadMeta = () => H().loadMeta();
  const brandEl = () => H().brandEl();
  const shell = (inner) => H().shell(inner);
  const navigate = (h) => H().navigate(h);
  const openModal = (t, b, s) => H().openModal(t, b, s);
  const closeModal = () => H().closeModal();
  const confirmModal = (m, l, c) => H().confirmModal(m, l, c);
  const refreshBell = () => H().refreshBell();
  const startNotifPolling = () => H().startNotifPolling();

  /* View-layer helpers (only used by views, so they live here). */
  function field(label, input, hint) {
    return el("label", { class: "field" },
      el("span", { class: "label" }, label),
      input,
      hint ? el("span", { class: "muted", style: "font-size:12px" }, hint) : null);
  }
  function catSelect(selected) {
    const sel = el("select", { name: "category_id", id: "category_id" },
      el("option", { value: "" }, "Uncategorized"));
    (OD.state.meta ? OD.state.meta.categories : []).forEach((cat) => {
      const o = el("option", { value: cat.id }, cat.name);
      if (String(cat.id) === String(selected)) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function statTile(num, label, kind) {
    return el("div", { class: "stat " + kind },
      el("div", { class: "num" }, String(num)),
      el("div", { class: "lbl label" }, label));
  }
  function renderPager(containerId, pagination, onGo) {
    const container = document.getElementById(containerId);
    if (!container || !pagination) { container?.replaceChildren(""); return; }
    const { page, pages, total } = pagination;
    if (pages <= 1) { container.replaceChildren(el("span", { class: "muted" }, `${total} tickets`)); return; }
    const pagesToShow = [1];
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) pagesToShow.push(i);
    if (pagesToShow[pagesToShow.length - 1] !== pages) pagesToShow.push(pages);
    const items = [];
    items.push(el("button", { class: "btn ghost sm", onclick: () => onGo(Math.max(1, page - 1)), disabled: page <= 1 ? "" : undefined }, "← Prev"));
    pagesToShow.forEach((p) => {
      const active = p === page;
      items.push(el("button", { class: "btn ghost sm" + (active ? "" : " outline"), onclick: () => onGo(p), "aria-current": active ? "page" : undefined }, String(p)));
    });
    items.push(el("button", { class: "btn ghost sm", onclick: () => onGo(Math.min(pages, page + 1)), disabled: page >= pages ? "" : undefined }, "Next →"));
    items.push(el("span", { class: "muted ml-2" }, `page ${page}/${pages} · ${total}`));
    container.replaceChildren(el("div", { class: "row wrap mt-3" }, ...items));
  }

  /* ----------------------------- notifications (Phase 1) ----------------------------- */
  async function openNotifications() {
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Notifications"),
        el("div", { class: "spacer" }),
        el("button", { class: "btn ghost sm", onclick: () => markAllAndRefresh() }, "Mark all read")),
      el("div", { class: "mt-4", id: "notif-list" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")),
      el("div", { class: "row between mt-3" },
        el("div", { class: "row" }, "Page ", el("input", { type: "number", id: "notif-page", min: "1", value: "1", style: "width:70px" }), el("button", { class: "btn ghost sm", onclick: () => loadNotifications() }, "Go")),
        el("div", { id: "notif-pager", class: "muted" }, "")));
    shell(main);
    await loadNotifications();
  }

  async function loadNotifications() {
    const listEl = $("#notif-list");
    if (!listEl) return;
    const page = Math.max(1, parseInt((document.getElementById("notif-page")?.value || "1"), 10));
    try {
      const data = await API.notifications({ page: String(page), per_page: "25" });
      const notifications = data.notifications || [];
      if (!notifications.length) {
        listEl.replaceChildren(el("div", { class: "empty" }, "You're all caught up. 🎉"));
        document.getElementById("notif-pager")?.replaceChildren(el("span", { class: "muted" }, ""));
        return;
      }
      listEl.replaceChildren(el("div", { class: "notif-list" },
        ...notifications.map((n) => {
          const item = el("a", { href: n.ticket_id ? `#/ticket/${n.ticket_id}` : "#", class: "notif" + (n.read ? "" : " unread"),
            onclick: async (e) => {
              e.preventDefault();
              if (!n.read) { try { await API.markNotifRead(n.id); } catch (_) {} refreshBell(); }
              if (n.ticket_id) navigate(`/ticket/${n.ticket_id}`);
            } },
            el("div", { class: "notif-msg" }, n.message),
            el("div", { class: "notif-meta muted" }, n.ticket_ref ? `${n.ticket_ref} · ` : "", ago(n.created_at)));
          return item;
        })));
      renderPager("notif-pager", data.pagination, (p) => {
        const el2 = document.getElementById("notif-page");
        if (el2) el2.value = String(p);
        loadNotifications();
      });
    } catch (e) { toast(e.message, "error"); }
  }

  async function markAllAndRefresh() {
    try { await API.markAllNotifRead(); } catch (_) {}
    refreshBell();
    openNotifications();
  }

  /* ----------------------------- login ----------------------------- */
  function viewLogin() {
    const root = $("#app");
    root.innerHTML = "";
    const card = el("div", { class: "login-wrap" },
      el("div", { class: "card login-card" },
        brandEl(),
        el("p", { class: "muted", style: "text-align:center" }, "Internal Service Request Platform"),
        el("form", { id: "loginForm", onsubmit: onLogin },
          field("Email", el("input", { type: "email", name: "email", required: "", autocomplete: "username", placeholder: "you@opsdesk.local" })),
          field("Password", el("input", { type: "password", name: "password", required: "", autocomplete: "current-password", placeholder: "••••••••" })),
          el("button", { type: "submit", class: "btn primary block" }, "Sign in")),
        el("p", { class: "hint" }, el("a", { href: "#/forgot", onclick: () => navigate("/forgot") }, "Forgot your password?")),
        el("p", { class: "hint" }, "Demo accounts (password: password): admin@, manager@, agent@, hragent@, sam@opsdesk.local")));
    root.appendChild(card);

    async function onLogin(e) {
      e.preventDefault();
      const f = e.target;
      try {
        const u = await API.login(f.email.value, f.password.value);
        OD.state.user = u.user;
        OD.state.aiEnabled = !!u.ai_enabled;
        await loadMeta();
        startNotifPolling();
        navigate("/dashboard");
      } catch (err) {
        toast(err.message, "error");
      }
    }
  }

  /* ----------------------------- password reset (Phase 1) ----------------------------- */
  function viewForgotPassword() {
    const root = $("#app");
    root.innerHTML = "";
    const card = el("div", { class: "login-wrap" },
      el("div", { class: "card login-card" },
        brandEl(),
        el("h2", { class: "h3 mb-4" }, "Reset your password"),
        el("p", { class: "muted" }, "Enter your account email and we'll send a reset link."),
        el("form", { id: "forgotForm", onsubmit: onForgot },
          field("Email", el("input", { type: "email", name: "email", required: "", autocomplete: "username", placeholder: "you@opsdesk.local" })),
          el("button", { type: "submit", class: "btn primary block" }, "Send reset link")),
        el("p", { class: "hint" }, el("a", { href: "#/login", onclick: () => navigate("/login") }, "Back to sign in"))));
    root.appendChild(card);

    async function onForgot(e) {
      e.preventDefault();
      try {
        const r = await API.forgotPassword(e.target.email.value);
        toast(r.message || "If that account exists, a reset link is on its way.", "info");
        navigate("/login");
      } catch (err) { toast(err.message, "error"); }
    }
  }

  function viewResetPassword() {
    const root = $("#app");
    root.innerHTML = "";
    // Token arrives as #/reset?token=XXXX
    const token = new URLSearchParams(location.hash.split("?")[1] || "").get("token") || "";
    const card = el("div", { class: "login-wrap" },
      el("div", { class: "card login-card" },
        brandEl(),
        el("h2", { class: "h3 mb-4" }, "Choose a new password"),
        el("form", { id: "resetForm", onsubmit: onReset },
          el("input", { type: "hidden", name: "token", value: token }),
          field("New password", el("input", { type: "password", name: "password", required: "", autocomplete: "new-password", placeholder: "At least 8 characters" })),
          el("button", { type: "submit", class: "btn primary block" }, "Update password"))));
    root.appendChild(card);
    if (!token) toast("Missing or invalid reset token.", "error");

    async function onReset(e) {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await API.resetPassword(f.token.value, f.password.value);
        toast(r.message || "Password updated.", "info");
        navigate("/login");
      } catch (err) { toast(err.message, "error"); }
    }
  }

  /* ----------------------------- dashboard ----------------------------- */
  async function viewDashboard() {
    shell(el("div", { id: "dash" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading dashboard…")));
    try {
      const d = await API.dashboard();
      if (d.role === "agent") {
        const tiles = el("div", { class: "grid cols-4" },
          statTile(d.my_open, "My Open", "primary"),
          statTile(d.my_urgent, "My Urgent", "primary urgent"),
          statTile(d.my_blocked, "My Blocked", "primary blocked"),
          statTile(d.my_assigned_today, "My New Today", "info"),
          statTile(d.my_resolved_today, "Resolved Today", "ok"),
          statTile(d.my_avg_response_hours != null ? d.my_avg_response_hours + "h" : "—", "My Avg Response", "info"),
          statTile(d.my_avg_resolution_hours != null ? d.my_avg_resolution_hours + "h" : "—", "My Avg Resolution", "info"),
          statTile(d.my_rated_tickets, "My Rated Tickets", ""));
        const agedSection = el("div", { class: "card mt-6" },
          el("h3", { class: "h3 mb-4" }, "Needs Attention"),
          d.aged && d.aged.length ? ticketTable(d.aged, { showAged: true })
                        : el("div", { class: "empty" }, "No aged tickets. 🎉"));
        const inner = el("div", {},
          el("div", { class: "page-head" }, el("h1", { class: "h2" }, "My Dashboard"), el("div", { class: "spacer" }), el("button", { class: "btn secondary sm", onclick: () => navigate("/queue") }, "Open Queue")),
          tiles, agedSection);
        shell(inner);
        return;
      }
      const c = d.counts;
      const tiles = el("div", { class: "grid cols-4" },
        statTile(c.new, "New", "primary"),
        statTile(d.unassigned, "Unassigned", "primary"),
        statTile(d.blocked, "Blocked", "primary blocked"),
        statTile(d.urgent, "Urgent", "primary urgent"),
        statTile(c.in_progress, "In Progress", "info"),
        statTile(c.resolved, "Resolved", "ok"),
        statTile(c.closed, "Closed", ""),
        statTile(d.avg_resolution_hours != null ? d.avg_resolution_hours + "h" : "—", "Avg Res (7d)", "info"));
      const agedSection = el("div", { class: "card mt-6" },
        el("h3", { class: "h3 mb-4" }, "Aged / Needs Attention"),
        d.aged.length ? ticketTable(d.aged, { showAged: true })
                      : el("div", { class: "empty" }, "No aged tickets. 🎉"));
      let actionSection = el("div", {});
      try {
        const ac = await API.actionCenter();
        const section = (title, rows) => el("div", { class: "card mt-4" },
          el("h3", { class: "h3 mt-2" }, title),
          rows.length ? el("table", { class: "table" },
            el("thead", {}, el("tr", {}, el("th", {}, "ID"), el("th", {}, "Subject"), el("th", {}, "Status"), el("th", {}, "Priority"))),
            el("tbody", {}, ...rows.map((r) => el("tr", { style: "cursor:pointer", onclick: () => navigate('/ticket/' + r.id) },
              el("td", {}, "#" + r.id),
              el("td", {}, r.subject),
              el("td", {}, r.status),
              el("td", {}, r.priority),
              ...([r.breach_at, r.updated_at, r.created_at].filter(Boolean).slice(0,1).map((ts) => el("td", { class: "muted" }, String(ts))))))))
            : el("div", { class: "empty muted" }, "None"));
        actionSection = el("div", { class: "mt-6" },
          el("h2", { class: "h3 mb-4" }, "Action Center"),
          section("Unassigned", ac.unassigned),
          section("SLA breaches", ac.breached),
          section("Stale tickets", ac.stale));
      } catch (_) {}
      const inner = el("div", {},
        el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Manager Dashboard"),
          el("div", { class: "spacer" }),
          el("button", { class: "btn secondary sm", onclick: () => navigate("/queue") }, "Open Queue")),
        tiles, agedSection, actionSection);
      shell(inner);
    } catch (e) { toast(e.message, "error"); }
  }

  /* ----------------------------- queue / my requests ----------------------------- */
  let bulkSel = new Set();

  function queueFilters() {
    const m = OD.state.meta;
    const role = OD.state.user.role;
    const fStatus = el("select", { id: "f-status" }, el("option", { value: "" }, "All statuses"),
      ...Object.keys(STATUS_LABELS()).map((s) => el("option", { value: s }, STATUS_LABELS()[s])));
    const fPriority = el("select", { id: "f-priority" },
      el("option", { value: "" }, "Any priority"),
      ...["low", "normal", "high", "urgent"].map((p) => el("option", { value: p }, priorityLabel(p))));
    const fCat = el("select", { id: "f-cat" }, el("option", { value: "" }, "All categories"),
      ...m.categories.map((c) => el("option", { value: c.id }, c.name)));
    const fTeam = el("select", { id: "f-team" }, el("option", { value: "" }, "All teams"),
      ...m.teams.map((t) => el("option", { value: t.id }, t.name)));
    // Each control is wrapped in a <label> so the visible caption is its
    // programmatic label (screen-reader association), not just decorative text.
    const labelled = (caption, control) =>
      el("label", { class: "field" }, el("span", { class: "label" }, caption), control);
    return el("div", { class: "filters" },
      el("label", { class: "search field" },
        el("span", { class: "ic", "aria-hidden": "true" }, "🔍"),
        el("input", { type: "text", id: "f-q", placeholder: "Search subject, ID, description…", "aria-label": "Search tickets" })),
      labelled("Status", fStatus),
      labelled("Priority", fPriority),
      labelled("Category", fCat),
      ...(role !== "requester" ? [labelled("Team", fTeam)] : []),
      ...(role !== "requester" ? [labelled("Assignee", el("select", { id: "f-assignee" },
        el("option", { value: "" }, "Anyone"),
        el("option", { value: "me" }, "Assigned to me"),
        el("option", { value: "unassigned" }, "Unassigned"),
        ...(m.users || []).map((u) => el("option", { value: u.id }, u.name))))] : []),
      el("button", { class: "btn primary sm", onclick: reload }, "Apply"));
  }

  async function viewQueue() {
    if (!isAgent()) { navigate("/my"); return; }
    bulkSel = new Set();
    shell(el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Ticket Queue")),
      queueFilters(),
      bulkBar(),
      el("div", { id: "ticket-list", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")),
      el("div", { class: "row between mt-3" },
        el("div", { class: "row" }, "Page ", el("input", { type: "number", id: "ticket-page", min: "1", value: "1", style: "width:70px" }), el("button", { class: "btn ghost sm", onclick: reload }, "Go")),
        el("div", { id: "ticket-pager", class: "muted" }, ""))));
    await reload();
  }

  /* Bulk selection + actions (staff queue only). */
  function onTicketSel(id, checked) {
    if (checked) bulkSel.add(id); else bulkSel.delete(id);
    const bar = document.getElementById("bulk-bar");
    if (bar) bar.querySelector("#bulk-count").textContent = bulkSel.size + " selected";
    bar.querySelectorAll("button").forEach((b) => { b.disabled = bulkSel.size === 0; });
  }
  function bulkBar() {
    return el("div", { id: "bulk-bar", class: "row wrap mt-3", style: "gap:8px;align-items:center" },
      el("span", { id: "bulk-count", class: "muted" }, "0 selected"),
      el("button", { class: "btn secondary sm", disabled: "", onclick: bulkAssign }, "Assign…"),
      el("button", { class: "btn secondary sm", disabled: "", onclick: bulkStatus }, "Status…"),
      el("button", { class: "btn secondary sm", disabled: "", onclick: bulkPriority }, "Priority…"),
      el("button", { class: "btn ghost sm", disabled: "", onclick: () => bulkRun("unassign", {}) }, "Unassign"),
      el("button", { class: "btn ghost sm", disabled: "", onclick: () => bulkRun("close", {}) }, "Close"),
      el("button", { class: "btn ghost sm", disabled: "", onclick: () => { bulkSel = new Set(); onTicketSel(0, false); reload(); } }, "Clear"));
  }
  async function bulkRun(action, extra) {
    try {
      const res = await API.bulkAction(Object.assign({ ticket_ids: [...bulkSel], action }, extra));
      const skipped = (res.skipped || []).length;
      toast(skipped ? `Updated ${res.processed}, skipped ${skipped}.` : `Updated ${res.processed} ticket(s).`);
      bulkSel = new Set();
      reload();
    } catch (e) { toast(e.message, "error"); }
  }
  function bulkAssign() {
    const sel = el("select", { id: "bulk-assignee" }, el("option", { value: "" }, "Choose an agent…"),
      ...OD.state.meta.users.filter((u) => u.role !== "requester").map((u) => el("option", { value: u.id }, u.name)));
    openModal("Assign " + bulkSel.size + " ticket(s)", el("div", {}, sel), async () => {
      const uid = sel.value;
      if (!uid) { toast("Pick an assignee.", "error"); return false; }
      await bulkRun("assign", { assignee_id: Number(uid) });
      return true;
    });
  }
  function bulkStatus() {
    const opts = [
      ["in_progress", "In Progress"], ["resolved", "Resolved"], ["closed", "Closed"], ["blocked", "Blocked"],
    ];
    const sel = el("select", { id: "bulk-status" }, ...opts.map(([v, l]) => el("option", { value: v }, l)));
    const note = el("input", { type: "text", id: "bulk-note", placeholder: "Reason (required for Blocked)…" });
    openModal("Set status on " + bulkSel.size + " ticket(s)", el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Status"), sel),
      el("label", { class: "field" }, el("span", { class: "label" }, "Note"), note)), async () => {
      await bulkRun("status", { status: sel.value, note: note.value.trim() });
      return true;
    });
  }
  function bulkPriority() {
    const sel = el("select", { id: "bulk-priority" },
      ...["low", "normal", "high", "urgent"].map((p) => el("option", { value: p }, priorityLabel(p))));
    openModal("Set priority on " + bulkSel.size + " ticket(s)", el("div", {}, sel), async () => {
      await bulkRun("priority", { priority: sel.value });
      return true;
    });
  }

  async function viewMyRequests() {
    const head = el("div", { class: "page-head" },
      el("h1", { class: "h2" }, "My Requests"),
      el("div", { class: "spacer" }),
      OD.state.user.role === "requester" ? el("button", { class: "btn primary sm", onclick: () => navigate("/new") }, "New Request") : null);
    const wrap = el("div", {}, head, queueFilters(),
      el("div", { id: "ticket-list", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")),
      el("div", { class: "row between mt-3" },
        el("div", { class: "row" }, "Page ", el("input", { type: "number", id: "ticket-page", min: "1", value: "1", style: "width:70px" }), el("button", { class: "btn ghost sm", onclick: reload }, "Go")),
        el("div", { id: "ticket-pager", class: "muted" }, "")));
    shell(wrap);
    await reload();
  }

  async function reload() {
    const listEl = $("#ticket-list");
    if (!listEl) return;
    const page = Math.max(1, parseInt((document.getElementById("ticket-page")?.value || "1"), 10));
    const params = {
      status: $("#f-status")?.value || "",
      priority: $("#f-priority")?.value || "",
      category_id: $("#f-cat")?.value || "",
      team_id: $("#f-team")?.value || "",
      q: $("#f-q")?.value || "",
      assignee_id: $("#f-assignee")?.value || "",
      page: String(page),
      per_page: "25",
    };
    // requester view: backend already scopes to own; just load
    try {
      const data = await API.listIssues(params);
      const tickets = data.issues || [];
      if (!tickets.length) {
        listEl.replaceChildren(el("div", { class: "empty" }, "No tickets match your filters."));
        document.getElementById("ticket-pager")?.replaceChildren(el("span", { class: "muted" }, ""));
        return;
      }
      listEl.replaceChildren(ticketTable(tickets, { showAged: false, selectable: isAgent() }));
      renderPager("ticket-pager", data.pagination, (p) => {
        $("#ticket-page").value = String(p);
        reload();
      });
    } catch (e) { toast(e.message, "error"); }
  }

  function ticketTable(tickets, opts = {}) {
    const selectable = !!opts.selectable;
    const rows = tickets.map((t) => {
      const urgentCls = t.priority === "urgent" ? "row-urgent" : "";
      const cells = [];
      if (selectable) {
        cells.push(el("td", {},
          el("input", { type: "checkbox", class: "ticket-sel", value: t.id,
            "aria-label": "Select " + t.ticket_ref,
            onclick: (e) => e.stopPropagation(),
            onchange: (e) => onTicketSel(t.id, e.target.checked) })));
      }
      cells.push(
        el("td", {}, el("span", { class: "ref" }, t.ticket_ref)),
        el("td", {}, el("a", { href: `#/ticket/${t.id}`, style: "color:var(--on-surface);text-decoration:none;font-weight:600" }, t.subject)),
        el("td", {}, catName(t.category_id)),
        el("td", {}, statusBadge(t.status)),
        el("td", {}, priorityPill(t.priority)),
        el("td", {}, slaBadge(t) || el("span", { class: "muted" }, "-")),
        el("td", {}, nameOf(t.assignee_id, "Unassigned")),
        el("td", {}, teamName(t.team_id)),
        el("td", { class: "muted" }, ago(t.updated_at)));
      if (opts.showAged) {
        cells.push(el("td", {}, t.status === "new"
          ? el("span", { class: "pill aged" }, "Unassigned >4h")
          : el("span", { class: "pill aged" }, "No update >48h")));
      }
      return el("tr", { class: urgentCls, onclick: () => navigate(`/ticket/${t.id}`) }, ...cells);
    });
    const heads = ["Ref", "Subject", "Category", "Status", "Priority", "SLA", "Assignee", "Team", "Updated",
      ...(opts.showAged ? ["Flag"] : [])];
    if (selectable) heads.unshift("");
    return el("div", { class: "table-wrap" },
      el("table", { class: "tbl" },
        el("thead", {}, el("tr", {}, ...heads.map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, ...rows)));
  }

  /* ----------------------------- ticket detail ----------------------------- */
  async function viewTicket(id) {
    shell(el("div", {}, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading ticket…")));
    try {
      const isStaff = isAgent();
      const [{ issue }, kbRes, suggRes, folRes] = await Promise.all([
        API.getIssue(id),
        isStaff ? API.listIssueKnowledge(id).catch(() => ({ notes: [] })) : Promise.resolve({ notes: [] }),
        API.suggestIssueKnowledge(id).catch(() => ({ suggestions: [] })),
        API.listFollowers(id).catch(() => ({ followers: [] })),
      ]);
      const t = issue;
      const canHandle = isStaff;
      const isRequesterOwner = OD.state.user.role === "requester" && t.requester_id === OD.state.user.id;
      const linkedKb = (kbRes && kbRes.notes) || [];
      const followers = (folRes && folRes.followers) || [];
      const isFollowing = followers.some((f) => f.id === OD.state.user.id);
      const canEdit = canHandle || (isRequesterOwner && t.status === "new");

      // Header
      const header = el("div", { class: "page-head" },
        el("div", {},
          el("div", { class: "ref mono" }, t.ticket_ref),
          el("h2", { class: "h2" }, t.subject)),
        el("div", { class: "spacer" }),
        statusBadge(t.status), priorityPill(t.priority), slaBadge(t));

      // Left column: details + comments
      const detailCard = el("div", { class: "card" },
        kvRow("Requester", nameOf(t.requester_id)),
        kvRow("Assignee", nameOf(t.assignee_id, "Unassigned")),
        kvRow("Team", teamName(t.team_id)),
        kvRow("Category", catName(t.category_id)),
        kvRow("Priority", priorityLabel(t.priority)),
        kvRow("Created", fmtDate(t.created_at)),
        kvRow("Updated", fmtDate(t.updated_at)),
        t.sla ? kvRow("SLA", (t.sla.breached ? "Breached" : (t.sla.resolution_met === 0 ? "At risk" : "On track")) + (t.sla.policy_name ? " (" + t.sla.policy_name + ")" : "") + (t.sla.breach_at ? " . due " + fmtDate(t.sla.breach_at) : "")) : null,
        t.sla && t.sla.response_hours ? kvRow("Expected first response", "Within " + t.sla.response_hours + "h" + (t.sla.response_due_at ? " (due " + fmtDate(t.sla.response_due_at) + ")" : "")) : null,
        t.blocked_reason ? el("div", { class: "mt-4" },
          el("span", { class: "label" }, "Blocked reason"),
          el("div", { class: "comment internal", style: "margin-top:4px" }, t.blocked_reason)) : null,
        csatWidget(t, isRequesterOwner));

      const commentThread = el("div", { class: "mt-6" },
        el("h3", { class: "h3 mb-4" }, "Conversation"),
        ...(t.comments.length ? t.comments.map(renderComment) : [el("div", { class: "muted" }, "No messages yet.")]),
        el("div", { class: "mt-4" },
          el("textarea", { id: "comment-body", placeholder: "Add a reply or note…" }),
          el("div", { class: "row mt-2" },
            el("select", { id: "comment-vis", class: "sm" },
              el("option", { value: "public" }, "Public comment"),
              ...(canHandle ? [el("option", { value: "internal" }, "Internal note (staff only)")] : [])),
            el("div", { class: "spacer" }),
            el("button", { class: "btn primary sm", onclick: () => postComment(t.id) }, "Send"))));

      const attachSection = el("div", { class: "mt-6" },
        el("h3", { class: "h3 mb-4" }, "Attachments"),
        el("div", { class: "row" },
          el("input", { type: "file", id: "att-file", accept: ".pdf,.png,.jpg,.jpeg" }),
          el("button", { class: "btn secondary sm", onclick: () => uploadAtt(t.id) }, "Upload")),
        el("div", { class: "mt-2", id: "att-list" },
          ...(t.attachments.length
            ? t.attachments.map((a) => el("div", { class: "row mt-2" },
                el("a", { href: API.attachmentUrl(t.id, a.id), target: "_blank", class: "btn ghost sm" }, el("span", {"aria-hidden":"true"}, "📎 "), a.filename),
                el("span", { class: "muted" }, (a.file_size / 1024).toFixed(0) + " KB")))
            : [el("span", { class: "muted" }, "None")])));

      // Knowledge Base bridge: linked articles on this ticket (staff can link/unlink).
      const kbSection = el("div", { class: "mt-6" },
        el("h3", { class: "h3 mb-4" }, "Knowledge Base"),
        linkedKb.length
          ? el("div", {}, ...linkedKb.map((a) => el("div", { class: "row between mt-2" },
              el("div", {}, el("a", { class: "btn ghost sm", href: `#/kb/${a.id}`, onclick: () => navigate(`/kb/${a.id}`) }, a.title),
                a.note ? el("span", { class: "muted" }, " — " + a.note) : null),
              canHandle ? el("button", { class: "btn ghost sm", onclick: async () => {
                try { await API.unlinkIssueKnowledge(t.id, a.id); viewTicket(t.id); toast("Unlinked."); }
                catch (e) { toast(e.message, "error"); }
              } }, "Unlink") : null)))
            : el("div", { class: "muted" }, "No linked articles yet."),
        canHandle ? await kbLinkControl(t, linkedKb.map((a) => a.id)) : null);

      // Suggested articles: keyword overlap with this ticket's subject/description.
      const suggestions = (suggRes && suggRes.suggestions) || [];
      const suggestedSection = suggestions.length ? el("div", { class: "mt-6" },
        el("h3", { class: "h3 mb-4" }, "Suggested articles"),
        el("div", { class: "muted", style: "font-size:13px;margin-bottom:8px" }, "Articles that may answer this ticket:"),
        ...suggestions.map((a) => el("div", { class: "row between mt-2" },
          el("a", { class: "btn ghost sm", href: `#/kb/${a.id}`, onclick: () => navigate(`/kb/${a.id}`) }, a.title),
          el("div", { class: "row" },
            a.category_name ? el("span", { class: "pill muted" }, a.category_name) : null,
            canHandle ? el("button", { class: "btn ghost sm", onclick: async () => {
              try { await API.linkIssueKnowledge(t.id, { article_id: a.id }); toast("Linked."); viewTicket(t.id); }
              catch (e) { toast(e.message, "error"); }
            } }, "Link") : null))))
        : null;

      const left = el("div", { class: "flex1" }, detailCard, commentThread, attachSection, kbSection, suggestedSection);

      // Right column: actions + activity
      const actions = el("div", { class: "card compact mb-4" },
        el("div", { class: "label mb-2" }, "Actions"),
        el("div", { class: "row wrap" },
          canEdit ? el("button", { class: "btn secondary sm", onclick: () => editTicket(t) }, "Edit") : null,
          canHandle ? el("button", { class: "btn secondary sm", onclick: () => claim(t) }, t.assignee_id ? "Reassign" : "Claim") : null,
          canHandle ? statusButtons(t) : null,
          canHandle ? el("button", { class: "btn secondary sm", onclick: () => changePriority(t) }, "Change Priority") : null,
          canHandle && ["resolved", "closed"].includes(t.status)
            ? el("button", { class: "btn secondary sm", onclick: () => promoteToKb(t) }, "Promote to KB Article") : null,
          isRequesterOwner && ["resolved", "closed"].includes(t.status)
            ? el("button", { class: "btn danger sm", onclick: () => doReopen(t.id) }, "Reopen") : null,
          el("button", { class: "btn ghost sm", onclick: async () => {
            try {
              if (isFollowing) { await API.unfollowIssue(t.id); toast("Unfollowed."); }
              else { await API.followIssue(t.id); toast("Following — you'll be notified of updates."); }
              viewTicket(t.id);
            } catch (e) { toast(e.message, "error"); }
          } }, isFollowing ? "Unfollow" : "Follow"),
          followers.length ? el("span", { class: "muted", style: "font-size:12px;align-self:center" },
            followers.length + " watching" + (followers.length <= 3 ? ": " + followers.map((f) => f.name).join(", ") : "")) : null));
      const activity = el("div", { class: "card compact" },
        el("div", { class: "label mb-2" }, "Activity"),
        el("ul", { class: "timeline" }, ...t.activity.map(renderActivity)));

      const inner = el("div", {},
        el("div", { class: "row between mb-4" },
          el("button", { class: "btn ghost sm", onclick: () => navigate(OD.state.user.role === "requester" ? "/my" : "/queue") }, "← Back")),
        header,
        el("div", { class: "grid cols-2", style: "align-items:start" }, left,
          el("div", {}, actions, activity, aiPanel(t))));
      shell(inner);
    } catch (e) {
      shell(el("div", { class: "empty" }, "Ticket not found or you do not have access. ", el("a", { href: "#/queue" }, "Back to queue")));
    }
  }

  function kvRow(k, v) {
    return el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
      el("span", { class: "label" }, k), el("span", {}, v));
  }

  function statusButtons(t) {
    if (!t.allowed_transitions.length) return null;
    return el("span", { class: "row wrap" },
      ...t.allowed_transitions.map((to) =>
        el("button", { class: "btn primary sm", onclick: () => changeStatus(t.id, to) }, (STATUS_LABELS()[to] || to))));
  }

  function renderComment(c) {
    const internal = c.visibility === "internal";
    return el("div", { class: "comment" + (internal ? " internal" : "") },
      el("div", { class: "meta" },
        el("span", { class: "author" }, nameOf(c.author_id, "Unknown")),
        el("span", { class: "when" }, ago(c.created_at)),
        internal ? el("span", { class: "tag internal" }, "Internal") : null),
      el("div", {}, c.body));
  }

  function renderActivity(a) {
    const icon = { created: "✚", assigned: "👤", status_change: "⇄", reopened: "↺", auto_closed: "✔" }[a.action] || "•";
    let text = a.action.replace(/_/g, " ");
    if (a.from_status && a.to_status) text = `${a.from_status} → ${a.to_status}`;
    if (a.note) text += `: ${a.note}`;
    return el("li", {},
      el("span", { class: "ic", "aria-hidden": "true" }, icon),
      el("div", {}, el("div", { class: "body" }, text), el("div", { class: "time" }, ago(a.created_at))));
  }

  async function postComment(id) {
    const body = $("#comment-body").value.trim();
    if (!body) { toast("Type a message first.", "error"); return; }
    const visibility = $("#comment-vis").value;
    try {
      await API.comment(id, { body, visibility });
      viewTicket(id);
      toast("Added.");
    } catch (e) { toast(e.message, "error"); }
  }

  async function uploadAtt(id) {
    const file = $("#att-file").files[0];
    if (!file) { toast("Choose a file first.", "error"); return; }
    try {
      await API.upload(id, file);
      viewTicket(id);
      toast("Uploaded.");
    } catch (e) { toast(e.message, "error"); }
  }

  async function claim(t) {
    const users = OD.state.meta.users || [];
    const ticketTeamId = t.team_id;

    // Filter users by team if ticket has a team; otherwise show all agents/managers
    const assignableUsers = users.filter(u =>
      ["agent", "manager", "admin"].includes(u.role) &&
      (ticketTeamId == null || u.team_id == ticketTeamId)
    );

    // For agents: show dropdown with "Claim for me" + team members
    if (OD.state.user.role === "agent") {
      const agentOptions = [
        { value: "me", label: "Claim for me" },
        ...assignableUsers.filter(u => u.id !== OD.state.user.id).map(u => ({ value: u.id, label: `${u.name} (${teamName(u.team_id)})` }))
      ];
      openModal("Assign ticket", el("div", {},
        el("label", { class: "field" }, el("span", { class: "label" }, "Assign to"),
          el("select", { id: "assign-pick" },
            ...agentOptions.map(o => el("option", { value: o.value }, o.label)))),
        el("div", { class: "row" }, el("div", { class: "spacer" }),
          el("button", { class: "btn primary sm", onclick: async () => {
            const val = $("#assign-pick").value;
            if (!val) return;
            const payload = val === "me" ? { self: true } : { assignee_id: val };
            await API.assignIssue(t.id, payload);
            closeModal(); viewTicket(t.id); toast(val === "me" ? "Claimed." : "Assigned.");
          } }, "Save"))));
      return;
    }

    // Manager/Admin: pick anyone (filtered by team if ticket has one)
    openModal("Assign ticket", el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Assign to"),
        el("select", { id: "assign-pick" },
          el("option", { value: "" }, "— Unassigned —"),
          ...assignableUsers.map(u => el("option", { value: u.id }, `${u.name} (${teamName(u.team_id)})`)))),
      el("div", { class: "row" }, el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: async () => {
          const uid = $("#assign-pick").value || null;
          // "— Unassigned —" must hit the backend's dedicated unassign path
          // (resets status to new); sending assignee_id:null alone would
          // leave the ticket stuck in its current status with no assignee.
          await API.assignIssue(t.id, uid ? { assignee_id: uid } : { unassign: true });
          closeModal(); viewTicket(t.id); toast(uid ? "Assigned." : "Unassigned.");
        } }, "Save"))));
  }

  async function changeStatus(id, to) {
    const needsNote = ["blocked", "reopened"].includes(to);
    const body = el("div", {},
      el("p", { class: "muted" }, `Move ticket to "${STATUS_LABELS()[to] || to}".`),
      needsNote
        ? el("label", { class: "field" },
            el("span", { class: "label" }, "Reason / note (required)"),
            el("textarea", { id: "status-note", required: "" }))
        : null);
    openModal("Change status", body, async () => {
      const note = needsNote ? $("#status-note").value.trim() : "";
      if (needsNote && !note) { toast("A reason is required for this status.", "error"); return false; }
      await API.setStatus(id, { status: to, note });
      closeModal();
      viewTicket(id);
      toast("Status updated.");
      return true;
    });
  }

  async function doReopen(id) {
    const confirmed = await confirmModal(
      "Reopen this ticket? It will go back to the queue and the requester will be notified.",
      "Reopen",
      "btn danger sm"
    );
    if (!confirmed) return;
    try { await API.reopen(id); viewTicket(id); toast("Reopened."); }
    catch (e) { toast(e.message, "error"); }
  }

  // Link-article picker used on the ticket detail page (staff only).
  async function kbLinkControl(t, alreadyLinked) {
    let notes = [];
    try { notes = (await API.listKbNotes()).notes || []; } catch (_) {}
    const available = notes.filter((a) => !alreadyLinked.includes(a.id));
    const sel = el("select", { id: "kb-link-pick" },
      el("option", { value: "" }, "Choose an article…"),
      ...available.map((a) => el("option", { value: a.id }, a.title + " (" + a.status + ")")));
    return el("div", { class: "row mt-2" }, sel,
      el("button", { class: "btn secondary sm", onclick: async () => {
        const aid = sel.value;
        if (!aid) { toast("Pick an article first.", "error"); return; }
        try {
          await API.linkIssueKnowledge(t.id, { article_id: Number(aid) });
          toast("Linked."); viewTicket(t.id);
        } catch (e) { toast(e.message, "error"); }
      } }, "Link article"));
  }

  // Create a KB draft from a resolved ticket (staff only).
  async function promoteToKb(t) {
    const confirmed = await confirmModal(
      "Create a KB draft article from this ticket? The draft will be linked to the ticket automatically — you can edit it before publishing.",
      "Promote",
      "btn primary sm"
    );
    if (!confirmed) return;
    try {
      const { article } = await API.promoteIssueToKb(t.id);
      toast("Draft created from ticket.");
      navigate("/kb/new?id=" + article.id);
    } catch (e) { toast(e.message, "error"); }
  }

  async function changePriority(t) {
    const current = t.priority;
    const options = ["low", "normal", "high", "urgent"].filter(p => p !== current);
    if (!options.length) return;
    const body = el("div", {},
      el("p", { class: "muted" }, `Current priority: ${priorityLabel(current)}.`),
      el("label", { class: "field" },
        el("span", { class: "label" }, "New priority"),
        el("select", { id: "priority-pick" },
          ...options.map(p => el("option", { value: p }, priorityLabel(p))))));
    openModal("Change Priority", body, async () => {
      const newPriority = $("#priority-pick").value;
      if (!newPriority) { toast("Select a priority.", "error"); return false; }
      await API.setPriority(t.id, newPriority);
      closeModal();
      viewTicket(t.id);
      toast("Priority updated.");
      return true;
    });
  }

  function editTicket(t) {
    const isStaff = isAgent();
    const subject = el("input", { type: "text", id: "edit-subject", value: t.subject, maxlength: "100" });
    const cat = el("select", { id: "edit-cat" },
      ...OD.state.meta.categories.map((c) => el("option", { value: c.id, selected: c.id === t.category_id ? "" : null }, c.name)));
    const team = isStaff ? el("select", { id: "edit-team" }, el("option", { value: "" }, "Auto (category)"),
      ...OD.state.meta.teams.map((tm) => el("option", { value: tm.id, selected: tm.id === t.team_id ? "" : null }, tm.name))) : null;
    const desc = el("textarea", { id: "edit-desc", rows: "6", maxlength: "2000" }, t.description || "");
    openModal("Edit ticket " + t.ticket_ref, el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Subject"), subject),
      el("label", { class: "field" }, el("span", { class: "label" }, "Category"), cat),
      team ? el("label", { class: "field" }, el("span", { class: "label" }, "Team"), team) : null,
      el("label", { class: "field" }, el("span", { class: "label" }, "Description"), desc)), async () => {
      const payload = {
        subject: subject.value.trim(),
        category_id: cat.value ? Number(cat.value) : null,
        description: desc.value,
      };
      if (!payload.subject) { toast("Subject is required.", "error"); return false; }
      if (team) payload.team_id = team.value ? Number(team.value) : null;
      try {
        await API.updateIssue(t.id, payload);
        closeModal();
        viewTicket(t.id);
        toast("Ticket updated.");
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  async function doDeleteKb(id) {
    const confirmed = await confirmModal(
      "Delete this article? This cannot be undone.",
      "Delete",
      "btn danger sm"
    );
    if (!confirmed) return;
    try { await API.deleteKbNote(id); toast("Deleted.", "info"); navigate("/kb/manage"); }
    catch (e) { toast(e.message, "error"); }
  }

  function csatWidget(t, isOwner) {
    // If a rating exists, show it to everyone who can see the ticket.
    if (t.csat != null) {
      const label = (isOwner && (t.status === "resolved" || t.status === "closed")) ? "Your rating" : "Satisfaction";
      return el("div", { class: "mt-4" },
        el("span", { class: "label" }, label),
        el("div", { class: "muted" }, "★".repeat(t.csat) + "☆".repeat(5 - t.csat) + "  (" + t.csat + "/5)"));
    }
    // Only the requester who owns a resolved/closed ticket can rate (once).
    if (!isOwner || (t.status !== "resolved" && t.status !== "closed")) return null;
    const stars = [1, 2, 3, 4, 5].map((n) => el("button", {
      class: "btn ghost sm", style: "font-size:18px", "aria-label": n + " star" + (n === 1 ? "" : "s"), onclick: async () => {
        try { await API.rateIssue(t.id, n); toast("Thanks for rating!", "info"); viewTicket(t.id); }
        catch (e) { toast(e.message, "error"); }
      }
    }, "★".repeat(n) + "☆".repeat(5 - n)));
    return el("div", { class: "mt-4" },
      el("span", { class: "label" }, "Rate your experience"),
      el("div", { style: "display:flex;gap:4px;margin-top:4px" }, ...stars));
  }

  // v2 — AI assist panel (draft-only suggestions; agent/manager only, when enabled)
  function aiPanel(t) {
    if (!OD.state.aiEnabled) return null;
    if (!isStaffRole(OD.state.user.role)) return null;
    const out = el("div", { class: "card compact mt-4" },
      el("div", { class: "label mb-2" }, "AI assist (draft only)"),
      el("p", { class: "muted", style: "font-size:12px;margin:0 0 8px 0" },
        "Generates draft text from ticket content. Does not send anything to the requester, update tickets, or share your API key."),
      el("details", { class: "mt-2 mb-2", style: "font-size:12px" },
        el("summary", { style: "cursor:pointer;color:var(--primary)" }, "What do these buttons do?"),
        el("ul", { style: "margin:8px 0 0 18px;line-height:1.6" },
          el("li", {}, el("strong", {}, "Summarize"), " — writes a concise summary of the ticket and conversation."),
          el("li", {}, el("strong", {}, "Suggest reply"), " — drafts a public response for the requester based on the thread."),
          el("li", {}, el("strong", {}, "Suggest priority"), " — recommends Low, Normal, High or Urgent based on ticket content."))),
      el("p", { class: "muted", style: "font-size:11px;margin:4px 0 0 0" },
        "All output is a draft. You review, edit, and send it yourself. Requires your OpenRouter API key in Settings."),
      el("p", { class: "muted", style: "font-size:11px;margin:2px 0 0 0" },
        "If the AI fails, check your key at ", el("a", { href: "/#/settings", onclick: () => navigate("/settings") }, "Settings"), " or try again later."));
    const result = el("div", { class: "muted mt-2", style: "white-space:pre-wrap" }, "");
    const btn = (label, fn) => el("button", { class: "btn ghost sm mr-2 mb-2", onclick: async () => {
      result.textContent = "Thinking…";
      try {
        const r = await fn();
        result.textContent = r.text;
      } catch (e) { result.textContent = "AI unavailable: " + e.message; }
    } }, label);
    out.appendChild(el("div", {},
      btn("Summarize", () => API.aiSummarize(t.id).then(d => ({ text: d.summary }))),
      btn("Suggest reply", () => API.aiSuggestReply(t.id).then(d => ({ text: d.draft }))),
      btn("Suggest priority", () => API.aiSuggestPriority(t.id).then(d => ({ text: d.priority })))));
    out.appendChild(result);
    return out;
  }

  /* ----------------------------- create ----------------------------- */
  function viewCreate() {
    const m = OD.state.meta;
    let suggestAck = false;
    shell(el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "New Request")),
      el("div", { class: "card", style: "max-width:640px" },
        el("form", { id: "new-form", onsubmit: onSubmit },
          field("Subject", el("input", { type: "text", name: "subject", maxlength: "100", required: "" }), "Up to 100 characters"),
          field("Category", el("select", { name: "category_id", required: "" },
            el("option", { value: "" }, "Select…"),
            ...m.categories.map((c) => el("option", { value: c.id }, c.name)))),
          field("Priority",
            el("select", { name: "priority" },
              el("option", { value: "low" }, "Low"),
              el("option", { value: "normal", selected: "" }, "Normal"),
              el("option", { value: "high" }, "High"),
              el("option", { value: "urgent" }, "Urgent"))),
          field("Team", el("select", { name: "team_id" },
            el("option", { value: "" }, "Select…"),
            ...m.teams.map((t) => el("option", { value: t.id }, t.name)))),
          field("Description", el("textarea", { name: "description", required: "" }), "What do you need? Include steps, impact, and any error text."),
          el("div", { id: "kb-suggest" }),
          el("button", { type: "submit", class: "btn primary" }, "Submit Request")))));

    async function onSubmit(e) {
      e.preventDefault();
      const f = e.target;
      const payload = {
        subject: f.subject.value.trim(),
        category_id: f.category_id.value ? Number(f.category_id.value) : null,
        priority: f.priority.value,
        team_id: f.team_id.value ? Number(f.team_id.value) : null,
        description: f.description.value,
      };
      if (!payload.subject || !payload.category_id) { toast("Subject and category are required.", "error"); return; }
      // Self-service: if matching articles exist, surface them before creating.
      if (!suggestAck) {
        let suggestions = [];
        try { suggestions = (await API.kbSuggest(payload.subject + " " + payload.description)).suggestions || []; }
        catch (_) {}
        if (suggestions.length) {
          const box = document.getElementById("kb-suggest");
          if (box) box.replaceChildren(
            el("div", { class: "card mt-3", style: "padding:16px;border-color:var(--warn)" },
              el("div", { class: "label mb-2" }, "These articles may already answer your request"),
              ...suggestions.map((s) => el("div", { class: "row between mt-2" },
                el("a", { class: "btn ghost sm", href: `#/kb/${s.id}`, onclick: () => navigate(`/kb/${s.id}`) }, s.title),
                s.category_name ? el("span", { class: "muted" }, s.category_name) : null)),
              el("div", { class: "muted mt-3", style: "font-size:13px" }, "Click Submit Request again to continue anyway.")));
          suggestAck = true;
          return;
        }
      }
      try {
        const { issue } = await API.createIssue(payload);
        toast("Request created: " + issue.ticket_ref);
        navigate(`/ticket/${issue.id}`);
      } catch (err) { toast(err.message, "error"); }
    }
  }

  /* ----------------------------- admin ----------------------------- */
  async function viewSettings() {
    if (!OD.state.user) { navigate("/login"); return; }
    const main = el("div", {}, el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Settings")));
    shell(main);
    let hasKey = false, model = OD.state.user.ai_model || "", models = [];
    try {
      const s = await API.getAiSettings();
      hasKey = s.has_key;
      model = s.model;
      models = s.models || [];
    } catch (e) { toast(e.message, "error"); }

    const card = el("div", { class: "card" },
      el("div", { class: "label mb-2" }, "OpenRouter API key"),
      el("p", { class: "muted mb-2" },
        "Paste your own OpenRouter key to enable AI assist. The key is stored encrypted and used only for your requests. ",
        el("a", { href: "https://openrouter.ai/keys", target: "_blank", rel: "noopener" }, "Get a free key")),
      el("p", { class: "muted mb-2", style: "font-size:12px" },
        "AI assist generates draft text only. It never sends messages to requesters, updates tickets, or shares your key externally."),
      el("details", { class: "mb-3", style: "font-size:12px" },
        el("summary", { style: "cursor:pointer;color:var(--primary)" }, "How to get started"),
        el("ul", { style: "margin:8px 0 0 18px;line-height:1.6" },
          el("li", {}, "Create a free account at ", el("a", { href: "https://openrouter.ai", target: "_blank", rel: "noopener" }, "openrouter.ai"), "."),
          el("li", {}, "Go to ", el("a", { href: "https://openrouter.ai/keys", target: "_blank", rel: "noopener" }, "API Keys"), " and create a new key."),
          el("li", {}, "Paste the key below (it starts with ", el("code", {}, "sk-or-"), ")."),
          el("li", {}, "Choose a model from the dropdown — free models are marked."),
          el("li", {}, "Click Save. The AI buttons will appear in ticket detail for agents and managers."))),
      el("input", { id: "ai-key", type: "password", placeholder: hasKey ? "•••••••• (already set)" : "sk-or-...", class: "mb-2" }),
      el("div", { class: "label mb-2" }, "Model"),
      el("select", { id: "ai-model", class: "mb-2" },
        ...models.map(m => el("option", { value: m.id, selected: m.id === model }, m.label))),
      el("p", { class: "muted", style: "font-size:11px;margin-bottom:8px" },
        "Free models may have rate limits. If you hit errors, wait a moment or try a different model."),
      el("div", { class: "row wrap" },
        el("button", { class: "btn sm", onclick: async () => {
          const mdl = $("#ai-model").value;
          // Only send api_key when the user actually typed a new one; an
          // untouched (blank) field must NOT clear the stored key. Clearing
          // is done explicitly via the "Clear key" button below.
          const payload = { model: mdl };
          const key = $("#ai-key").value.trim();
          if (key) payload.api_key = key;
          const r = await API.saveAiSettings(payload);
          if (r.ok) {
            toast("Settings saved", "info");
            // Refresh local state and reload so AI enablement/dropdown update.
            const s = await API.getAiSettings();
            OD.state.user.ai_model = s.model;
            OD.state.aiEnabled = s.has_key;
            location.reload();
          }
        }}, "Save"),
        hasKey ? el("button", { class: "btn danger sm", onclick: async () => {
          const r = await API.saveAiSettings({ api_key: "", model: $("#ai-model").value });
          if (r.ok) { toast("API key cleared", "ok"); hasKey = false; $("#ai-key").value = ""; }
        }}, "Clear key") : null));
    main.appendChild(card);

    const pwCard = el("div", { class: "card compact mt-4" },
      el("div", { class: "label mb-2" }, "Change my password"),
      el("form", { onsubmit: async (e) => {
        e.preventDefault();
        const current = $("#pw-current").value;
        const next = $("#pw-new").value;
        const confirm = $("#pw-confirm").value;
        if (!current || !next) { toast("Current and new password are required.", "error"); return; }
        if (next !== confirm) { toast("New password and confirmation do not match.", "error"); return; }
        try {
          await API.changePassword({ current_password: current, new_password: next });
          toast("Password updated.", "ok");
          $("#pw-current").value = "";
          $("#pw-new").value = "";
          $("#pw-confirm").value = "";
        } catch (err) { toast(err.message, "error"); }
      } },
        el("label", { class: "field" }, el("span", { class: "label" }, "Current password"),
          el("input", { type: "password", id: "pw-current", required: "", autocomplete: "current-password", placeholder: "••••••••" })),
        el("label", { class: "field mt-2" }, el("span", { class: "label" }, "New password"),
          el("input", { type: "password", id: "pw-new", required: "", autocomplete: "new-password", placeholder: "At least 8 characters" })),
        el("label", { class: "field mt-2" }, el("span", { class: "label" }, "Confirm new password"),
          el("input", { type: "password", id: "pw-confirm", required: "", autocomplete: "new-password", placeholder: "Repeat new password" })),
        el("div", { class: "row mt-3" }, el("div", { class: "spacer" }),
          el("button", { type: "submit", class: "btn primary sm" }, "Update password"))));
    main.appendChild(pwCard);
  }

  async function viewAdmin() {
    if (!isAdmin()) { navigate("/dashboard"); return; }
    shell(el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Admin")),
      el("div", { class: "grid cols-2", style: "align-items:start" },
        el("div", { class: "card" },
          el("h3", { class: "h3 mb-4" }, "Teams"),
          el("div", { id: "teams-list" }, el("span", { class: "spinner" })),
          el("div", { class: "row mt-4" },
            el("input", { type: "text", id: "new-team", placeholder: "New team name" }),
            el("button", { class: "btn primary sm", onclick: addTeam }, "+ Add"))),
        el("div", { class: "card" },
          el("h3", { class: "h3 mb-4" }, "Categories"),
          el("div", { id: "cats-list" }, el("span", { class: "spinner" })),
          el("div", { class: "row mt-4" },
            el("input", { type: "text", id: "new-cat", placeholder: "New category" }),
            el("button", { class: "btn primary sm", onclick: addCat }, "+ Add")))),
      el("div", { class: "card mt-6" },
        el("h3", { class: "h3 mb-4" }, "Users"),
        el("label", { class: "field mb-2" }, el("span", { class: "label" }, "Search users"),
          el("input", { type: "text", id: "user-search", placeholder: "Search by name or email…", oninput: renderUsers })),
        el("div", { id: "users-list" }, el("span", { class: "spinner" })),
        el("button", { class: "btn secondary sm mt-4", onclick: () => openUserModal() }, "+ New User")),
      el("div", { class: "card mt-6" },
        el("h3", { class: "h3 mb-4" }, "Jira Workflows"),
        el("p", { class: "muted small mb-4" }, "Project-level transition overrides layered on the default scheme. Restrict who may use a transition, require a reason, or add custom transitions."),
        el("div", { id: "wf-scope", class: "row gap mb-4" },
          el("label", { class: "field grow" }, el("span", { class: "label" }, "Scope"),
            el("select", { id: "wf-project", onchange: renderWorkflows }, el("option", { value: "" }, "Default scheme"))),
          el("button", { class: "btn primary sm", style: "margin-top:22px", onclick: workflowModal }, "+ Add Transition")),
        el("div", { id: "wf-list" }, el("span", { class: "spinner" })),
        el("h4", { class: "h4 mt-5 mb-3" }, "Default scheme (read-only)"),
        el("div", { id: "wf-defaults", class: "muted small" })),
      el("div", { class: "card mt-6" },
        el("h3", { class: "h3 mb-4" }, "Custom Fields"),
        el("p", { class: "muted small mb-4" }, "Extra fields shown on issue detail. Types: text, number, date, select (with options), user."),
        el("div", { class: "row gap mb-4" },
          el("button", { class: "btn primary sm", onclick: customFieldModal }, "+ New Field")),
        el("div", { id: "cf-list" }, el("span", { class: "spinner" })))));
    await refreshAdmin();
    renderWorkflows();
    renderCustomFields();
  }

  async function refreshAdmin() {
    const [teams, cats, users] = await Promise.all([API.adminTeams(), API.adminCategories(), API.adminUsers()]);
    $("#teams-list").replaceChildren(...teams.teams.map((t) =>
      el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
        el("span", {}, t.name),
        el("button", { class: "btn ghost sm", onclick: async () => {
          if (!await confirmModal("Delete this team? Related tickets/users will be unassigned from it.", "Delete", "btn danger sm")) return;
          await API.adminDeleteTeam(t.id);
          await refreshAdmin();
        } }, "Delete"))));
    $("#cats-list").replaceChildren(...cats.categories.map((c) =>
      el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
        el("span", {}, c.name),
        el("button", { class: "btn ghost sm", onclick: async () => {
          if (!await confirmModal("Deactivate this category? It will no longer be available for new requests.", "Deactivate", "btn danger sm")) return;
          await API.adminDeleteCategory(c.id);
          await refreshAdmin();
        } }, "Deactivate"))));
    renderUsers(users);
  }

  function renderUsers(users) {
    if (typeof users === "undefined") users = window.__adminUsersCache;
    if (!users) return;
    window.__adminUsersCache = users;
    const term = ($("#user-search")?.value || "").trim().toLowerCase();
    const filtered = term
      ? users.users.filter((u) => (u.name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term))
      : users.users;
    $("#users-list").replaceChildren(el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ...["Name", "Email", "Role", "Team", ""].map((h) => el("th", {}, h)))),
      el("tbody", {}, ...filtered.map((u) =>
        el("tr", {},
          el("td", {}, u.name),
          el("td", {}, u.email),
          el("td", {}, u.role),
          el("td", {}, teamName(u.team_id)),
          el("td", {}, el("div", { class: "row wrap" },
            el("button", { class: "btn ghost sm", onclick: () => openUserModal(u) }, "Edit"),
            el("button", { class: "btn danger sm", onclick: async () => {
              if (!await confirmModal("Delete this user? Users with ticket history cannot be deleted.", "Delete", "btn danger sm")) return;
              await API.adminDeleteUser(u.id);
              await refreshAdmin();
            } }, "Delete"))
          )
        )
      ))
    ));
  }

  /* ---------------- Phase 1B: workflow scheme builder ---------------- */
  let wfData = null;
  async function renderWorkflows() {
    const scope = $("#wf-project") ? $("#wf-project").value : "";
    try {
      if (!wfData) wfData = await API.adminWorkflows();
      const list = $("#wf-list");
      if (!list) return;
      const scoped = wfData.transitions.filter((t) => String(t.project_id || "") === scope);
      const scopeLabel = scope ? (wfData.projects.find((p) => String(p.id) === scope) || {}).name || "" : "Default scheme";
      list.replaceChildren(
        el("div", { class: "muted small mb-3" }, scopeLabel, " — ", String(scoped.length), " rule(s)"),
        ...scoped.map((t) => el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
          el("span", {},
            el("b", {}, t.from_status, " → ", t.to_status),
            t.allowed_roles ? " · " + t.allowed_roles.join(", ") : " · any role",
            t.reason_required ? " · reason required" : ""),
          el("button", { class: "btn ghost sm", onclick: async () => {
            if (!await confirmModal("Remove this transition rule?", "Remove", "btn danger sm")) return;
            try {
              await API.deleteWorkflow({ project_id: t.project_id, from_status: t.from_status, to_status: t.to_status });
              wfData = null; renderWorkflows();
            } catch (e) { toast(e.message, "error"); }
          } }, "Remove"))));
      const defaults = $("#wf-defaults");
      if (defaults) {
        defaults.replaceChildren(...Object.entries(wfData.defaults).map(([frm, tos]) =>
          el("div", {}, el("b", {}, frm, ": "), Object.keys(tos).join(", "))));
      }
    } catch (e) { toast(e.message, "error"); }
  }

  function workflowModal() {
    const scope = $("#wf-project") ? $("#wf-project").value : "";
    const statuses = ["new", "assigned", "in_progress", "blocked", "resolved", "closed", "reopened"];
    const body = el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "From status"),
        el("select", { id: "wf-from" }, ...statuses.map((s) => el("option", { value: s }, s)))),
      el("label", { class: "field" }, el("span", { class: "label" }, "To status"),
        el("select", { id: "wf-to" }, ...statuses.map((s) => el("option", { value: s }, s)))),
      el("div", { class: "field" }, el("span", { class: "label" }, "Allowed roles"),
        el("div", { class: "row wrap gap" },
          ...["agent", "manager", "admin"].map((r) =>
            el("label", { class: "row gap", style: "align-items:center" },
              el("input", { type: "checkbox", id: "wf-role-" + r, checked: true }), r))),
        el("span", { class: "muted small" }, "Uncheck all for any role")),
      el("label", { class: "row gap mt-3", style: "align-items:center" },
        el("input", { type: "checkbox", id: "wf-reason" }), "Require a reason"));
    openModal("Add Transition", body, async () => {
      const from = $("#wf-from").value, to = $("#wf-to").value;
      if (!from || !to || from === to) { toast("Pick different from/to statuses", "error"); return false; }
      const roles = ["agent", "manager", "admin"].filter((r) => $("#wf-role-" + r).checked);
      try {
        await API.saveWorkflow({ project_id: scope || null, from_status: from, to_status: to, allowed_roles: roles.length ? roles : null, reason_required: $("#wf-reason").checked });
        wfData = null; renderWorkflows();
        toast("Transition saved");
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  /* ---------------- Phase 1B: custom field definitions ---------------- */
  async function renderCustomFields() {
    try {
      const data = await API.adminCustomFields();
      const list = $("#cf-list");
      if (!list) return;
      list.replaceChildren(...(data.fields || []).map((f) =>
        el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
          el("span", {},
            el("b", {}, esc(f.name)),
            el("span", { class: "muted small" }, " · ", f.field_type,
              f.project_name ? " · " + esc(f.project_name) : "",
              f.required ? " · required" : "",
              f.field_type === "select" && f.options ? " · " + f.options.join(" / ") : ""),
            el("span", { class: "muted small" }, " · ", String(f.value_count), " value(s)")),
          el("button", { class: "btn ghost sm", onclick: async () => {
            if (!await confirmModal("Delete this field and all its values?", "Delete", "btn danger sm")) return;
            try { await API.deleteCustomField(f.id); renderCustomFields(); }
            catch (e) { toast(e.message, "error"); }
          } }, "Delete"))));
    } catch (e) { toast(e.message, "error"); }
  }

  function customFieldModal() {
    const body = el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Name"), el("input", { id: "cf-name", placeholder: "e.g. Severity" })),
      el("div", { class: "row gap" },
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Type"),
          el("select", { id: "cf-type" }, ...["text", "number", "date", "select", "user"].map((t) => el("option", { value: t }, t)))),
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Project"),
          el("select", { id: "cf-project" }, el("option", { value: "" }, "All projects"),
            ...(wfData ? wfData.projects : []).map((p) => el("option", { value: p.id }, esc(p.name)))))),
      el("label", { class: "field" }, el("span", { class: "label" }, "Options (select type, comma separated)"),
        el("input", { id: "cf-options", placeholder: "low, medium, high" })),
      el("label", { class: "row gap mt-3", style: "align-items:center" },
        el("input", { type: "checkbox", id: "cf-required" }), "Required on issues"));
    openModal("New Custom Field", body, async () => {
      const name = $("#cf-name").value.trim();
      if (!name) { toast("Name is required", "error"); return false; }
      const type = $("#cf-type").value;
      try {
        const payload = { name, field_type: type, required: $("#cf-required").checked, project_id: $("#cf-project").value || null };
        if (type === "select") payload.options = $("#cf-options").value.split(",").map((s) => s.trim()).filter(Boolean);
        await API.createCustomField(payload);
        renderCustomFields();
        toast("Field created");
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  async function addTeam() {
    const name = $("#new-team").value.trim();
    if (!name) return;
    await API.adminCreateTeam(name); $("#new-team").value = ""; await refreshAdmin();
  }
  async function addCat() {
    const name = $("#new-cat").value.trim();
    if (!name) return;
    await API.adminCreateCategory(name, ""); $("#new-cat").value = ""; await refreshAdmin();
  }

  function openUserModal(user = null) {
    const m = OD.state.meta;
    const isEdit = !!user;
    openModal(isEdit ? "Edit User" : "New User", el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Name"),
        el("input", { type: "text", id: "u-name", value: user?.name || "" })),
      el("label", { class: "field" }, el("span", { class: "label" }, "Email"),
        el("input", { type: "email", id: "u-email", value: user?.email || "" })),
      el("label", { class: "field" }, el("span", { class: "label" }, "Role"),
        el("select", { id: "u-role" }, ...["requester", "agent", "manager", "admin"].map((r) =>
          el("option", { value: r, ...(user?.role === r ? { selected: "" } : {}) }, r)))),
      el("label", { class: "field" }, el("span", { class: "label" }, "Team"),
        el("select", { id: "u-team" },
          el("option", { value: "" }, "— none —"),
          ...m.teams.map((t) => el("option", { value: t.id, ...(user?.team_id === t.id ? { selected: "" } : {}) }, t.name)))),
      el("label", { class: "field" }, el("span", { class: "label" }, isEdit ? "Reset password (optional)" : "Password (default if blank: password)"),
        el("input", { type: "password", id: "u-pass", autocomplete: "new-password", placeholder: isEdit ? "Leave blank to keep current" : "••••••••" })),
      el("div", { class: "row" }, el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: saveUser }, "Save"))));

    async function saveUser() {
      const payload = {
        name: $("#u-name").value.trim(),
        email: $("#u-email").value.trim(),
        role: $("#u-role").value,
        team_id: $("#u-team").value ? Number($("#u-team").value) : null,
      };
      const pass = $("#u-pass").value.trim();
      if (!isEdit) payload.password = pass || "password";
      else if (pass) payload.password = pass; // only reset when a new one was typed
      try {
        if (isEdit) await API.adminUpdateUser(user.id, payload);
        else await API.adminCreateUser(payload);
        closeModal(); await refreshAdmin(); toast("Saved.");
      } catch (e) { toast(e.message, "error"); }
    }
  }

  /* ----------------------------- Knowledge Base (Phase 2) ----------------------------- */
  async function viewKb() {
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Help Center"),
        el("div", { class: "spacer" })),
      el("div", { class: "filters" },
        el("label", { class: "search field" },
          el("span", { class: "ic", "aria-hidden": "true" }, "S"),
          el("input", { type: "text", id: "kb-q", placeholder: "Search articles...", "aria-label": "Search knowledge base", oninput: debounce(reloadKb, 300) }))),
      el("div", { class: "mt-4", id: "kb-list" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading...")));
    shell(main);
    await reloadKb();
  }

  async function reloadKb() {
    const list = $("#kb-list"); if (!list) return;
    try {
      const q = $("#kb-q")?.value || "";
      const { notes } = await API.listKb(q ? { q, published_only: 1 } : { published_only: 1 });
      if (!notes.length) { list.replaceChildren(el("div", { class: "empty" }, "No articles yet.")); return; }
      list.replaceChildren(el("div", { class: "kb-list" },
        ...notes.map((a) => el("a", { class: "card kb-card", href: `#/kb/${a.id}`,
          onclick: () => navigate(`/kb/${a.id}`) },
          el("div", { class: "kb-title" }, a.title),
          el("div", { class: "muted", style: "font-size:13px" }, categoryName(a.category_id) + (a.views ? " . " + a.views + " views" : ""))))));
    } catch (e) { toast(e.message, "error"); }
  }

  async function viewKbArticle() {
    const id = parseInt(location.hash.split("/")[2], 10);
    const main = el("div", {}, el("div", { class: "mt-4", id: "kb-article" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading...")));
    shell(main);
    try {
      const isStaff = OD.state.user.role !== "requester";
      const [{ note }, linksRes, versionsRes] = await Promise.all([
        API.getKb(id),
        isStaff ? API.listKbLinks(id).catch(() => ({ outbound: [], inbound: [] })) : Promise.resolve({ outbound: [], inbound: [] }),
        isStaff ? API.listKbVersions(id).catch(() => ({ versions: [] })) : Promise.resolve({ versions: [] }),
      ]);
      const related = linksRes.outbound || [];
      const backlinks = linksRes.inbound || [];
      const connections = related.length || backlinks.length ? el("div", { class: "mt-6 card", style: "padding:16px" },
        el("div", { class: "label mb-2" }, "Knowledge connections"),
        related.length ? el("div", {}, el("div", { class: "muted", style: "font-size:12px" }, "Related"), el("div", { class: "mt-2" },
          ...related.map((r) => el("div", { class: "card kb-card mt-2 row between", style: "padding:10px 12px" },
            el("a", { class: "kb-title", href: `#/kb/${r.id}`, onclick: () => navigate(`/kb/${r.id}`) }, r.title),
            isStaff ? el("button", { class: "btn ghost sm", "aria-label": "Remove link", onclick: async () => {
              try { await API.removeKbLink(id, r.id); toast("Link removed."); viewKbArticle(); }
              catch (e) { toast(e.message, "error"); }
            } }, "×") : null)))) : null,
        backlinks.length ? el("div", { class: "mt-3" }, el("div", { class: "muted", style: "font-size:12px" }, "Linked from"), el("div", { class: "mt-2" },
          ...backlinks.map((r) => el("a", { class: "card kb-card mt-2", href: `#/kb/${r.id}`, onclick: () => navigate(`/kb/${r.id}`) }, el("div", { class: "kb-title" }, r.title))))) : null,
      ) : null;
      const addLinkBox = isStaff ? await kbArticleLinkControl(id) : null;
      const versionCard = isStaff && versionsRes.versions.length ? kbVersionsCard(versionsRes.versions) : null;
      const wrap = $("#kb-article");
      wrap.replaceChildren(
        el("a", { href: "#/kb", onclick: () => navigate("/kb") }, "Back to Help Center"),
        el("h1", { class: "h2 mt-3" }, note.title),
        el("div", { class: "muted mb-4" }, categoryName(note.category_id) + (note.author_name ? " . by " + note.author_name : "")),
        el("div", { class: "kb-body" }, esc(note.body)),
        connections,
        addLinkBox,
        versionCard,
        el("div", { class: "mt-6 card", style: "padding:16px" },
          el("div", { class: "label mb-2" }, "Was this helpful?"),
          el("div", { id: "kb-feedback-btns" },
            el("button", { class: "btn secondary sm", onclick: () => sendKbFeedback(note.id, true, this) }, "Yes"),
            " ",
            el("button", { class: "btn secondary sm", onclick: () => sendKbFeedback(note.id, false, this) }, "No"))));
    } catch (e) { toast(e.message, "error"); navigate("/kb"); }
  }

  // Article-to-article link picker (staff only).
  async function kbArticleLinkControl(aid) {
    let notes = [];
    try { notes = (await API.listKbNotes()).notes || []; } catch (_) {}
    const sel = el("select", { id: "kb-link-pick" },
      el("option", { value: "" }, "Choose an article…"),
      ...notes.filter((a) => a.id !== aid).map((a) => el("option", { value: a.id }, a.title)));
    return el("div", { class: "mt-6 card", style: "padding:16px" },
      el("div", { class: "label mb-2" }, "Link another article"),
      el("div", { class: "row" }, sel,
        el("button", { class: "btn secondary sm", onclick: async () => {
          const target = sel.value;
          if (!target) { toast("Pick an article first.", "error"); return; }
          try { await API.addKbLink(aid, { target_id: Number(target) }); toast("Linked."); viewKbArticle(); }
          catch (e) { toast(e.message, "error"); }
        } }, "Add link")));
  }

  // Read-only snapshot list of prior article versions (staff only).
  function kbVersionsCard(versions) {
    return el("div", { class: "mt-6 card", style: "padding:16px" },
      el("div", { class: "label mb-2" }, "Version history (" + versions.length + ")"),
      el("div", {}, ...versions.map((v, i) =>
        el("details", { class: "version-item" },
          el("summary", { style: "cursor:pointer;color:var(--primary)" },
            "#" + (versions.length - i) + " · " + fmtDate(v.created_at) +
            (v.created_by ? " · by " + nameOf(v.created_by) : "") +
            (v.status ? " · " + v.status : "")),
          el("div", { class: "mt-2" },
            el("button", { class: "btn ghost sm", onclick: () => showVersionDiff(versions, i) },
              "Diff vs previous"),
            el("div", { class: "mt-2", style: "white-space:pre-wrap;font-size:13px" },
              el("div", { class: "muted", style: "font-size:12px" }, "Title: " + (v.title || "")),
              v.body))))));
  }

  // Simple line-level diff (LCS) for KB version snapshots.
  function diffLines(oldText, newText) {
    const a = (oldText || "").split("\n");
    const b = (newText || "").split("\n");
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ t: "same", line: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", line: a[i] }); i++; }
      else { out.push({ t: "add", line: b[j] }); j++; }
    }
    while (i < n) { out.push({ t: "del", line: a[i] }); i++; }
    while (j < m) { out.push({ t: "add", line: b[j] }); j++; }
    return out;
  }

  // Modal showing what changed in a snapshot vs the previous one
  // (versions are newest-first; the oldest diff is "everything added").
  function showVersionDiff(versions, idx) {
    const v = versions[idx];
    const prev = idx + 1 < versions.length ? versions[idx + 1] : { title: "", body: "" };
    const lines = [
      { t: "meta", line: "Title: " + (prev.title || "—") + " → " + (v.title || "—") },
      ...diffLines(prev.body, v.body),
    ];
    const legend = el("div", { class: "row muted", style: "font-size:12px;gap:16px;margin-bottom:8px" },
      el("span", { style: "color:var(--danger)" }, "+ added"),
      el("span", { style: "color:var(--ok)" }, "− removed"),
      el("span", { style: "color:var(--muted)" }, "· unchanged"));
    const rows = lines.map((l) => {
      const mark = l.t === "add" ? "+" : (l.t === "del" ? "−" : " ");
      return el("div", { class: "diff-line " + l.t, role: "listitem" },
        el("span", { class: "diff-mark" }, mark), l.line);
    });
    openModal("Changes in #" + (versions.length - idx) + " (" + fmtDate(v.created_at) + ")",
      el("div", {}, legend, el("div", { class: "diff-view", role: "list" }, ...rows)));
  }

  async function sendKbFeedback(id, helpful, btn) {
    try {
      await API.kbFeedback(id, helpful);
      toast(helpful ? "Thanks for the feedback!" : "Thanks - we will improve this.", "info");
      // Disable both buttons so one user cannot spam duplicate votes.
      const wrap = document.getElementById("kb-feedback-btns");
      if (wrap) wrap.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    } catch (e) { toast(e.message, "error"); }
  }

  async function viewKbManage() {
    if (OD.state.user.role === "requester") { navigate("/kb"); return; }
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Manage Knowledge Base"),
        el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: () => navigate("/kb/new") }, "New Article")),
      el("div", { class: "mt-4", id: "kb-admin-list" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading...")));
    shell(main);
    try {
      const { notes } = await API.listKb();
      const list = $("#kb-admin-list");
      if (!notes.length) { list.replaceChildren(el("div", { class: "empty" }, "No articles. Create one.")); return; }
      list.replaceChildren(el("div", { class: "kb-list" },
        ...notes.map((a) => el("div", { class: "card kb-card" },
          el("div", { class: "kb-title" }, a.title, " ", el("span", { class: "pill " + (a.status === "published" ? "ok" : "warn") }, a.status)),
          el("div", { class: "muted", style: "font-size:13px" }, categoryName(a.category_id) + (a.views ? " . " + a.views + " views" : "")),
          el("div", { class: "mt-2" },
            el("button", { class: "btn ghost sm", onclick: () => navigate("/kb/new?id=" + a.id) }, "Edit"),
            a.status !== "published"
              ? el("button", { class: "btn secondary sm", onclick: async () => { await API.publishKb(a.id); toast("Published.", "info"); viewKbManage(); } }, "Publish")
              : null,
            el("button", { class: "btn ghost sm", onclick: () => doDeleteKb(a.id) }, "Delete"))))));
    } catch (e) { toast(e.message, "error"); }
  }

  async function viewKbEdit() {
    if (OD.state.user.role === "requester") { navigate("/kb"); return; }
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const editId = params.get("id");
    let article = null;
    if (editId) { try { article = (await API.getKb(editId)).note; } catch (_) {} }
    const main = el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, editId ? "Edit Article" : "New Article"),
        el("div", { class: "spacer" }),
        editId ? el("button", { class: "btn secondary sm", onclick: () => draftFromTicket(editId) }, "Draft from ticket") : null),
      el("form", { id: "kbForm", class: "card mt-4", style: "padding:20px", onsubmit: onKbSubmit },
        field("Title", el("input", { type: "text", name: "title", required: "", value: article ? article.title : "", maxlength: "100" })),
        field("Category", catSelect(article ? article.category_id : "")),
        field("Body", el("textarea", { name: "body", required: "", rows: "10", maxlength: "20000" }, article ? article.body : "")),
        el("div", { class: "mt-3" },
          el("button", { type: "submit", class: "btn primary" }, editId ? "Save changes" : "Create draft"))));
    shell(main);

    // AI-assisted drafting: pull a ticket's content into this article's body
    // (uses the user's own OpenRouter key when configured; plain fallback otherwise).
    async function draftFromTicket(aid) {
      let tickets = [];
      try { tickets = ((await API.listIssues({ per_page: "100" })).issues) || []; } catch (_) {}
      if (!tickets.length) { toast("No tickets available.", "error"); return; }
      const sel = el("select", { id: "draft-ticket-pick" },
        el("option", { value: "" }, "Choose…"),
        ...tickets.map((t) => el("option", { value: t.id }, t.ticket_ref + " — " + t.subject)));
      openModal("Draft from ticket", el("div", {},
        el("p", { class: "muted mb-2" }, "The ticket's subject and description become the draft body. With your OpenRouter key set, the AI writes the draft; otherwise a plain skeleton is inserted. Nothing is saved until you press Save."),
        el("label", { class: "field" }, el("span", { class: "label" }, "Ticket"), sel)),
        async () => {
          const tid = sel.value;
          if (!tid) { toast("Pick a ticket.", "error"); return false; }
          try {
            const d = await API.draftKbFromTicket(aid, { ticket_id: Number(tid) });
            const form = document.getElementById("kbForm");
            form.title.value = d.title || "";
            form.body.value = d.body || "";
            const catSel = form.querySelector("#category_id");
            if (catSel && d.category_id) catSel.value = String(d.category_id);
            toast("Draft loaded — review before publishing.", "info");
            return true;
          } catch (e) { toast(e.message, "error"); return false; }
        });
    }

    async function onKbSubmit(e) {
      e.preventDefault();
      const f = e.target;
      const payload = { title: f.title.value.trim(), body: f.body.value.trim(), category_id: f.category_id.value || null };
      try {
        if (editId) await API.updateKb(editId, payload);
        else await API.createKb(payload);
        toast("Saved.", "info");
        navigate("/kb/manage");
      } catch (err) { toast(err.message, "error"); }
    }
  }

  async function viewKbCollections() {
    if (OD.state.user.role === "requester") { navigate("/kb"); return; }
    const main = el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Collections"), el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: () => navigate("/kb/collections/new") }, "New Collection")),
      el("div", { class: "mt-4", id: "coll-list" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading...")));
    shell(main);
    try {
      const { collections } = await API.listCollections();
      const list = $("#coll-list");
      if (!collections.length) { list.replaceChildren(el("div", { class: "empty" }, "No collections yet.")); return; }
      list.replaceChildren(el("div", { class: "kb-list" },
        ...collections.map((c) => el("a", { class: "card kb-card", href: `#/kb/collections/${c.id}`,
          onclick: () => navigate(`/kb/collections/${c.id}`) },
          el("div", { class: "kb-title" }, c.name),
          el("div", { class: "muted", style: "font-size:13px" }, c.description || "No description")))));
    } catch (e) { toast(e.message, "error"); }
  }

  async function viewKbCollection() {
    const id = parseInt(location.hash.split("/")[3], 10);
    const main = el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Collection"), el("div", { class: "spacer" })),
      el("div", { class: "mt-4", id: "coll-detail" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading...")));
    shell(main);
    try {
      const [col, { notes }] = await Promise.all([
        API.listCollections().then(x => x.collections.find(c => c.id === id)).catch(() => null),
        API.listCollectionArticles(id).catch(() => ({ notes: [] })),
      ]);
      if (!col) { toast("Collection not found", "error"); navigate("/kb/collections"); return; }
      const wrap = $("#coll-detail");
      wrap.replaceChildren(
        el("div", { class: "card" },
          el("div", { class: "kb-title" }, col.name),
          el("div", { class: "muted mt-2" }, col.description || "No description")),
        el("div", { class: "mt-4" },
          el("div", { class: "label mb-2" }, "Articles"),
          notes.length ? el("div", { class: "kb-list" },
            ...notes.map((a) => el("a", { class: "card kb-card", href: `#/kb/${a.id}`, onclick: () => navigate(`/kb/${a.id}`) },
              el("div", { class: "kb-title" }, a.title),
              el("div", { class: "muted", style: "font-size:13px" }, categoryName(a.category_id)))))
            : el("div", { class: "empty muted" }, "No articles yet.")));
    } catch (e) { toast(e.message, "error"); }
  }

  /* ----------------------------- reports ----------------------------- */
  async function viewReports() {
    if (OD.state.user.role !== "manager" && OD.state.user.role !== "admin") { navigate("/dashboard"); return; }
    const filters = () => ({
      team_id: document.getElementById("rep-team")?.value || "",
      assignee_id: document.getElementById("rep-assignee")?.value || "",
      date_from: document.getElementById("rep-from")?.value || "",
      date_to: document.getElementById("rep-to")?.value || "",
    });
    const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== ""));
    const main = el("div", {}, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading reports…"));
    shell(main);
    const bar = el("div", { class: "filters mt-2" },
      el("label", { class: "field" }, el("span", { class: "label" }, "Team"),
        el("select", { id: "rep-team" },
          el("option", { value: "" }, "All teams"),
          ...(OD.state.meta.teams || []).map((t) => el("option", { value: t.id }, t.name)))),
      el("label", { class: "field" }, el("span", { class: "label" }, "Agent"),
        el("select", { id: "rep-assignee" },
          el("option", { value: "" }, "All agents"),
          ...(OD.state.meta.users || []).map((u) => el("option", { value: u.id }, u.name)))),
      el("label", { class: "field" }, el("span", { class: "label" }, "From"),
        el("input", { type: "date", id: "rep-from" })),
      el("label", { class: "field" }, el("span", { class: "label" }, "To"),
        el("input", { type: "date", id: "rep-to" })),
      el("button", { class: "btn primary sm", onclick: async () => {
        try { await renderReports(); } catch (e) { toast(e.message, "error"); }
      }}, "Apply"));
    function reportCard(label, value, sub) {
      return el("div", { class: "card report-card" },
        el("div", { class: "report-value" }, String(value)),
        el("div", { class: "report-label" }, label),
        sub ? el("div", { class: "muted", style: "font-size:12px" }, sub) : null);
    }
    async function renderReports() {
      const p = clean(filters());
      const [sum, work, sla, trend] = await Promise.all([
        API.reportsSummary(p), API.reportsWorkload(p), API.reportsSla(p), API.reportsTrend({days: p.days || 30, ...p})]);
      const s = sum, w = work, sl = sla, tr = trend;
      const cards = el("div", { class: "report-cards" },
        reportCard("Total tickets", s.total),
        reportCard("Open", s.open),
        reportCard("Backlog ending", s.backlog?.ending),
        reportCard("SLA attainment", (s.sla_attainment_pct != null ? s.sla_attainment_pct + "%" : "n/a")),
        reportCard("Avg resolution", (s.avg_resolution_hours != null ? s.avg_resolution_hours + "h" : "n/a")),
        reportCard("Median resolution", (s.median_resolution_hours != null ? s.median_resolution_hours + "h" : "n/a")),
        reportCard("P90 resolution", (s.p90_resolution_hours != null ? s.p90_resolution_hours + "h" : "n/a")),
        reportCard("Avg CSAT", (s.avg_csat != null ? s.avg_csat + " / 5" : "n/a"), s.csat_responses ? "(" + s.csat_responses + " ratings)" : ""));
      const workloadTable = el("div", { class: "card mt-4" },
        el("h3", { class: "h3 mt-2" }, "Workload by staff"),
        el("table", { class: "table" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Staff"), el("th", {}, "Open"), el("th", {}, "Resolved"), el("th", {}, "Avg res. (h)"))),
          el("tbody", {}, ...w.agents.map((a) => el("tr", {},
            el("td", {}, a.name), el("td", {}, String(a.open)), el("td", {}, String(a.resolved)),
            el("td", {}, a.avg_resolution_hours != null ? String(a.avg_resolution_hours) : "—"))))));
      const slaBox = el("div", { class: "card mt-4" },
        el("h3", { class: "h3 mt-2" }, "SLA attainment"),
        el("div", {}, "Met: " + sl.met + " · Missed: " + sl.missed + " · Pending: " + sl.pending +
          (sl.attainment_pct != null ? " (" + sl.attainment_pct + "%)" : "")));
      const trendList = el("div", { class: "card mt-4" },
        el("h3", { class: "h3 mt-2" }, "Last " + tr.days + " days (created / resolved)"),
        el("div", { class: "trend chart" }, ...tr.series.map((d) => {
          const max = Math.max(1, ...tr.series.map((x) => Math.max(x.created, x.resolved)));
          const createdW = Math.round((d.created / max) * 100);
          const resolvedW = Math.round((d.resolved / max) * 100);
          return el("div", { class: "trend-row chart-row" },
            el("span", { class: "muted axis-label", style: "font-size:12px" }, d.date.slice(5)),
            el("div", { class: "bars" },
              el("div", { class: "bar created", style: "width:" + createdW + "%", title: "Created " + d.created }, ""),
              el("div", { class: "bar resolved", style: "width:" + resolvedW + "%", title: "Resolved " + d.resolved }, "")));
        })));
      const csat = el("div", { class: "card mt-4" },
        el("h3", { class: "h3 mt-2" }, "CSAT distribution"),
        el("div", { class: "csat-bars" }, [1,2,3,4,5].map((score) => {
          const count = s.csat_distribution?.[score] || 0;
          const max = Math.max(1, ...Object.values(s.csat_distribution || {}));
          const width = Math.round((count / max) * 100);
          return el("div", { class: "csat-row" },
            el("span", {}, "★".repeat(score) + "☆".repeat(5-score)),
            el("div", { class: "bar resolved", style: "width:" + width + "%", title: score + ": " + count }, String(count)));
        })));
      const exportBtn = el("button", { class: "btn primary mt-4", onclick: async () => {
          try { await API.exportCsv(p); } catch (e) { toast(e.message, "error"); }
        } }, "Export CSV");
      const kbBtn = el("button", { class: "btn secondary sm", onclick: async () => { try { await renderKnowledgeAnalytics(); } catch (e) { toast(e.message, "error"); } } }, "Knowledge Analytics");
      main.replaceChildren(
        el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Reports"), el("div", { class: "spacer" }), kbBtn, exportBtn),
        bar, cards, workloadTable, slaBox, trendList, csat);
    }
    async function renderKnowledgeAnalytics() {
      const p = clean(filters());
      const data = await API.reportsKnowledge(p);
      const mainWrap = $("#kb-analytics") || main;
      const box = el("div", { class: "card mt-4", id: "kb-analytics" },
        el("h3", { class: "h3 mt-2" }, "Knowledge health"),
        el("div", { class: "report-cards mt-3" },
          reportCard("Articles", data.articles),
          reportCard("Views", data.article_views),
          reportCard("Helpful", data.helpful_count),
          reportCard("Feedbacks", data.feedback_count),
          reportCard("Ticket usage", data.ticket_usage_count),
          reportCard("Orphans", data.orphan_count)));
      main.replaceChildren(
        el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Reports"), el("div", { class: "spacer" }),
          el("button", { class: "btn secondary sm", onclick: async () => { try { await renderReports(); } catch (e) { toast(e.message, "error"); } } }, "Ticket reports")),
        bar, box);
    }
    try { await renderReports(); }
    catch (e) {
      main.replaceChildren(
        el("div", { class: "empty" },
          el("span", { class: "label" }, "Couldn't load reports"),
          el("div", { class: "muted mt-2" }, e.message || "Unknown error"),
          el("button", { class: "btn ghost mt-4", onclick: () => viewReports() }, "Retry")));
    }
  }

  /* ----------------------------- registration ----------------------------- */
  Object.assign(views, {
    viewLogin, viewForgotPassword, viewResetPassword,
    openNotifications,
    viewDashboard, viewQueue, viewMyRequests, viewCreate, viewTicket,
    viewAdmin, viewSettings,
    viewKb, viewKbArticle, viewKbManage, viewKbEdit, viewKbCollections, viewKbCollection,
    viewReports,
  });
})();