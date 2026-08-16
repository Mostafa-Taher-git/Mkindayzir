/* ==========================================================================
   OpsDesk SPA application logic.

   Structure:
     - state        : current user + cached meta (teams/categories/users)
     - helpers      : DOM building, toast, formatting, status badge markup
     - router       : maps hash (#/dashboard) to a render function
     - views        : dashboard, queue, ticket detail, create, admin, my-requests
   Edit the VIEWS section to change what each screen shows.
   ========================================================================== */
(() => {
  "use strict";

  const state = { user: null, meta: null };

  /* ----------------------------- helpers ----------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

  const STATUS_LABELS = {
    new: "New", assigned: "Assigned", in_progress: "In Progress",
    blocked: "Blocked", resolved: "Resolved", closed: "Closed", reopened: "Reopened",
  };
  const statusBadge = (s) => el("span", { class: `badge ${s}` }, el("span", { class: "dot" }), STATUS_LABELS[s] || s);
  const priorityPill = (p) => el("span", { class: `pill ${p}` }, p === "urgent" ? "Urgent" : "Normal");

  function toast(msg, kind = "info") {
    const t = el("div", { class: "toast" }, msg);
    if (kind === "error") t.style.background = "var(--error)";
    $("#toast-root").appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function ago(iso) {
    if (!iso) return "";
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  const isAgent = () => ["agent", "manager", "admin"].includes(state.user.role);
  const isAdmin = () => state.user.role === "admin";

  /* ----------------------------- router ----------------------------- */
  const routes = {
    "/login": viewLogin,
    "/dashboard": viewDashboard,
    "/queue": viewQueue,
    "/my": viewMyRequests,
    "/new": viewCreate,
    "/ticket": viewTicket,
    "/admin": viewAdmin,
  };

  function navigate(hash) {
    if (!hash) hash = state.user ? "/dashboard" : "/login";
    location.hash = hash;
  }

  function router() {
    const hash = location.hash.replace(/^#/, "") || (state.user ? "/dashboard" : "/login");
    const [path, param] = hash.split("/").filter(Boolean);
    const key = "/" + (path || (state.user ? "dashboard" : "login"));
    const render = routes[key] || (state.user ? viewDashboard : viewLogin);
    try {
      render(param);
    } catch (e) {
      console.error(e);
      toast("Something went wrong rendering this page.", "error");
    }
  }

  /* ----------------------------- shell ----------------------------- */
  function shell(inner) {
    const navItems = [];
    if (state.user.role === "requester") {
      navItems.push(["/my", "My Requests", "📥"]);
      navItems.push(["/new", "New Request", "➕"]);
    } else {
      navItems.push(["/dashboard", "Dashboard", "📊"]);
      navItems.push(["/queue", "Queue", "🗂️"]);
      if (state.user.role === "requester") navItems.push(["/my", "My Requests", "📥"]);
    }
    navItems.push(["/new", "New Request", "➕"]);
    if (isAdmin()) navItems.push(["/admin", "Admin", "⚙️"]);

    const sidebar = el("nav", { class: "sidebar" },
      ...navItems.map(([href, label, icon]) =>
        el("div", { class: "nav-item" + (location.hash.includes(href) ? " active" : ""),
                    onclick: () => navigate(href) },
          el("span", {}, icon), el("span", {}, label))));

    const root = $("#app");
    root.innerHTML = "";
    root.appendChild(el("div", { class: "topbar" },
      el("div", { class: "brand" }, el("span", { class: "dot" }), "OpsDesk"),
      el("div", { class: "spacer" }),
      el("div", { class: "who" }, "Signed in as ", el("b", {}, state.user.name),
        " · ", el("span", { class: "label" }, state.user.role)),
      el("button", { class: "btn ghost sm", onclick: doLogout }, "Log out")));
    root.appendChild(el("div", { class: "layout" }, sidebar, el("main", { class: "main" }, inner)));
  }

  async function doLogout() {
    await API.logout();
    state.user = null;
    navigate("/login");
  }

  /* ----------------------------- login ----------------------------- */
  function viewLogin() {
    const root = $("#app");
    root.innerHTML = "";
    const card = el("div", { class: "login-wrap" },
      el("div", { class: "card login-card" },
        el("div", { class: "brand" }, el("span", { class: "dot" }), "OpsDesk"),
        el("p", { class: "muted", style: "text-align:center" }, "Internal Service Request Platform"),
        el("form", { id: "loginForm", onsubmit: onLogin },
          field("Email", el("input", { type: "email", name: "email", required: "", value: "agent@opsdesk.local" })),
          field("Password", el("input", { type: "password", name: "password", required: "", value: "password" })),
          el("button", { type: "submit", class: "btn primary block" }, "Sign in")),
        el("p", { class: "hint" }, "Demo accounts (password: password): admin@, manager@, agent@, hragent@, sam@opsdesk.local")));

    function field(label, input) {
      return el("label", { class: "field" }, el("span", { class: "label" }, label), input);
    }
    root.appendChild(card);

    async function onLogin(e) {
      e.preventDefault();
      const f = e.target;
      try {
        const u = await API.login(f.email.value, f.password.value);
        state.user = u.user;
        await loadMeta();
        navigate("/dashboard");
      } catch (err) {
        toast(err.message, "error");
      }
    }
  }

  async function loadMeta() {
    state.meta = await API.meta();
  }

  function nameOf(id, fallback = "—") {
    if (id == null) return fallback;
    const u = state.meta && state.meta.users.find((x) => x.id === id);
    return u ? u.name : fallback;
  }
  function teamName(id) {
    if (id == null) return "—";
    const t = state.meta && state.meta.teams.find((x) => x.id === id);
    return t ? t.name : "—";
  }
  function catName(id) {
    if (id == null) return "—";
    const c = state.meta && state.meta.categories.find((x) => x.id === id);
    return c ? c.name : "—";
  }

  /* ----------------------------- dashboard ----------------------------- */
  async function viewDashboard() {
    if (!isAgent()) { navigate("/my"); return; }
    shell(el("div", { id: "dash" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading dashboard…")));
    try {
      const d = await API.dashboard();
      const c = d.counts;
      const tiles = el("div", { class: "grid cols-4" },
        statTile(c.new, "New", ""),
        statTile(d.unassigned, "Unassigned", "urgent"),
        statTile(d.blocked, "Blocked", "blocked"),
        statTile(d.urgent, "Urgent", "urgent"),
        statTile(c.in_progress, "In Progress", "info"),
        statTile(c.resolved, "Resolved", "ok"),
        statTile(c.closed, "Closed", ""),
        statTile(d.avg_resolution_hours != null ? d.avg_resolution_hours + "h" : "—", "Avg Res (7d)", "info"));
      const agedSection = el("div", { class: "card mt-6" },
        el("div", { class: "h3 mb-4" }, "Aged / Needs Attention"),
        d.aged.length ? ticketTable(d.aged, { showAged: true })
                      : el("div", { class: "empty" }, "No aged tickets. 🎉"));
      const inner = el("div", {},
        el("div", { class: "page-head" }, el("div", { class: "h2" }, "Manager Dashboard"),
          el("div", { class: "spacer" }),
          el("button", { class: "btn secondary sm", onclick: () => navigate("/queue") }, "Open Queue")),
        tiles, agedSection);
      shell(inner);
    } catch (e) { toast(e.message, "error"); }
  }

  function statTile(num, label, kind) {
    return el("div", { class: "stat " + kind },
      el("div", { class: "num" }, String(num)),
      el("div", { class: "lbl label" }, label));
  }

  /* ----------------------------- queue / my requests ----------------------------- */
  function queueFilters() {
    const m = state.meta;
    const role = state.user.role;
    const fStatus = el("select", { id: "f-status" }, el("option", { value: "" }, "All statuses"),
      ...Object.keys(STATUS_LABELS).map((s) => el("option", { value: s }, STATUS_LABELS[s])));
    const fPriority = el("select", { id: "f-priority" },
      el("option", { value: "" }, "All priorities"),
      el("option", { value: "urgent" }, "Urgent"), el("option", { value: "normal" }, "Normal"));
    const fCat = el("select", { id: "f-cat" }, el("option", { value: "" }, "All categories"),
      ...m.categories.map((c) => el("option", { value: c.id }, c.name)));
    const fTeam = el("select", { id: "f-team" }, el("option", { value: "" }, "All teams"),
      ...m.teams.map((t) => el("option", { value: t.id }, t.name)));
    return el("div", { class: "filters" },
      el("div", { class: "search field" },
        el("span", { class: "ic" }, "🔍"),
        el("input", { type: "text", id: "f-q", placeholder: "Search subject, ID, description…" })),
      el("div", { class: "field" }, el("span", { class: "label" }, "Status"), fStatus),
      el("div", { class: "field" }, el("span", { class: "label" }, "Priority"), fPriority),
      el("div", { class: "field" }, el("span", { class: "label" }, "Category"), fCat),
      ...(role !== "requester" ? [el("div", { class: "field" }, el("span", { class: "label" }, "Team"), fTeam)] : []),
      el("button", { class: "btn primary sm", onclick: reload }, "Apply"));
  }

  async function viewQueue() {
    if (!isAgent()) { navigate("/my"); return; }
    shell(el("div", {}, el("div", { class: "page-head" }, el("div", { class: "h2" }, "Ticket Queue")),
      queueFilters(),
      el("div", { id: "ticket-list", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…"))));
    await reload();
  }

  async function viewMyRequests() {
    if (state.user.role === "requester") shell(el("div", {}));
    else shell(el("div", {}));
    const head = el("div", { class: "page-head" },
      el("div", { class: "h2" }, state.user.role === "requester" ? "My Requests" : "My Requests"),
      el("div", { class: "spacer" }),
      state.user.role === "requester" ? el("button", { class: "btn primary sm", onclick: () => navigate("/new") }, "New Request") : null);
    const wrap = el("div", {}, head, queueFilters(),
      el("div", { id: "ticket-list", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    $("#app .main").replaceChildren(wrap);
    await reload();
  }

  async function reload() {
    const listEl = $("#ticket-list");
    if (!listEl) return;
    const params = {
      status: $("#f-status")?.value || "",
      priority: $("#f-priority")?.value || "",
      category_id: $("#f-cat")?.value || "",
      team_id: $("#f-team")?.value || "",
      q: $("#f-q")?.value || "",
    };
    // requester view: backend already scopes to own; just load
    try {
      const { tickets } = await API.listTickets(params);
      if (!tickets.length) {
        listEl.replaceChildren(el("div", { class: "empty" }, "No tickets match your filters."));
        return;
      }
      listEl.replaceChildren(ticketTable(tickets, { showAged: false }));
    } catch (e) { toast(e.message, "error"); }
  }

  function ticketTable(tickets, opts = {}) {
    const rows = tickets.map((t) => {
      const urgentCls = t.priority === "urgent" ? "row-urgent" : "";
      const cells = [
        el("td", {}, el("span", { class: "ref" }, t.ticket_ref)),
        el("td", {}, el("a", { href: `#/ticket/${t.id}`, style: "color:var(--on-surface);text-decoration:none;font-weight:600" }, t.subject)),
        el("td", {}, catName(t.category_id)),
        el("td", {}, statusBadge(t.status)),
        el("td", {}, priorityPill(t.priority)),
        el("td", {}, nameOf(t.assignee_id, "Unassigned")),
        el("td", {}, teamName(t.team_id)),
        el("td", { class: "muted" }, ago(t.updated_at)),
      ];
      if (opts.showAged) {
        cells.push(el("td", {}, t.status === "new"
          ? el("span", { class: "pill aged" }, "Unassigned >4h")
          : el("span", { class: "pill aged" }, "No update >48h")));
      }
      return el("tr", { class: urgentCls, onclick: () => navigate(`/ticket/${t.id}`) }, ...cells);
    });
    return el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ...["Ref", "Subject", "Category", "Status", "Priority", "Assignee", "Team", "Updated",
        ...(opts.showAged ? ["Flag"] : [])].map((h) => el("th", {}, h)))),
      el("tbody", {}, ...rows));
  }

  /* ----------------------------- ticket detail ----------------------------- */
  async function viewTicket(id) {
    shell(el("div", {}, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading ticket…")));
    try {
      const { ticket } = await API.getTicket(id);
      const t = ticket;
      const canHandle = isAgent();
      const isRequesterOwner = state.user.role === "requester" && t.requester_id === state.user.id;

      // Header
      const header = el("div", { class: "page-head" },
        el("div", {},
          el("div", { class: "ref mono" }, t.ticket_ref),
          el("div", { class: "h2" }, t.subject)),
        el("div", { class: "spacer" }),
        statusBadge(t.status), priorityPill(t.priority));

      // Left column: details + comments
      const detailCard = el("div", { class: "card" },
        kvRow("Requester", nameOf(t.requester_id)),
        kvRow("Assignee", nameOf(t.assignee_id, "Unassigned")),
        kvRow("Team", teamName(t.team_id)),
        kvRow("Category", catName(t.category_id)),
        kvRow("Priority", t.priority === "urgent" ? "Urgent" : "Normal"),
        kvRow("Created", fmtDate(t.created_at)),
        kvRow("Updated", fmtDate(t.updated_at)),
        t.blocked_reason ? el("div", { class: "mt-4" },
          el("span", { class: "label" }, "Blocked reason"),
          el("div", { class: "comment internal", style: "margin-top:4px" }, t.blocked_reason)) : null);

      const commentThread = el("div", { class: "mt-6" },
        el("div", { class: "h3 mb-4" }, "Conversation"),
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
        el("div", { class: "h3 mb-4" }, "Attachments"),
        el("div", { class: "row" },
          el("input", { type: "file", id: "att-file", accept: ".pdf,.png,.jpg,.jpeg" }),
          el("button", { class: "btn secondary sm", onclick: () => uploadAtt(t.id) }, "Upload")),
        el("div", { class: "mt-2", id: "att-list" },
          ...(t.attachments.length
            ? t.attachments.map((a) => el("div", { class: "row mt-2" },
                el("a", { href: API.attachmentUrl(t.id, a.id), target: "_blank", class: "btn ghost sm" }, "📎 " + a.filename),
                el("span", { class: "muted" }, (a.file_size / 1024).toFixed(0) + " KB")))
            : [el("span", { class: "muted" }, "None")])));

      const left = el("div", { class: "flex1" }, detailCard, commentThread, attachSection);

      // Right column: actions + activity
      const actions = el("div", { class: "card compact mb-4" },
        el("div", { class: "label mb-2" }, "Actions"),
        el("div", { class: "row wrap" },
          canHandle ? el("button", { class: "btn secondary sm", onclick: () => claim(t) }, t.assignee_id ? "Reassign" : "Claim") : null,
          canHandle ? statusButtons(t) : null,
          isRequesterOwner && ["resolved", "closed"].includes(t.status)
            ? el("button", { class: "btn danger sm", onclick: () => doReopen(t.id) }, "Reopen") : null));
      const activity = el("div", { class: "card compact" },
        el("div", { class: "label mb-2" }, "Activity"),
        el("ul", { class: "timeline" }, ...t.activity.map(renderActivity)));

      const inner = el("div", {},
        el("div", { class: "row between mb-4" },
          el("button", { class: "btn ghost sm", onclick: () => navigate(state.user.role === "requester" ? "/my" : "/queue") }, "← Back")),
        header,
        el("div", { class: "grid cols-2", style: "align-items:start" }, left,
          el("div", {}, actions, activity)));
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
        el("button", { class: "btn primary sm", onclick: () => changeStatus(t.id, to) }, "→ " + (STATUS_LABELS[to] || to))));
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
      el("span", { class: "ic" }, icon),
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
    // Simple: open a prompt-like modal to pick a user, or self-claim for agents.
    if (state.user.role === "agent") {
      try { await API.assign(t.id, { self: true }); viewTicket(t.id); toast("Claimed."); }
      catch (e) { toast(e.message, "error"); }
      return;
    }
    // manager/admin: pick anyone
    const users = state.meta.users;
    openModal("Assign ticket", el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Assign to"),
        el("select", { id: "assign-pick" },
          el("option", { value: "" }, "— Unassigned —"),
          ...users.map((u) => el("option", { value: u.id }, `${u.name} (${u.role})`)))),
      el("div", { class: "row" }, el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: async () => {
          const uid = $("#assign-pick").value || null;
          await API.assign(t.id, { assignee_id: uid });
          closeModal(); viewTicket(t.id); toast("Assigned.");
        } }, "Save"))));
  }

  async function changeStatus(id, to) {
    let note = "";
    if (["blocked", "reopened"].includes(to) || (to === "reopened")) {
      note = prompt("Reason / note (required for this transition):");
      if (note === null) return;
    }
    try {
      await API.setStatus(id, { status: to, note });
      viewTicket(id);
      toast("Status updated.");
    } catch (e) { toast(e.message, "error"); }
  }

  async function doReopen(id) {
    try { await API.reopen(id); viewTicket(id); toast("Reopened."); }
    catch (e) { toast(e.message, "error"); }
  }

  /* ----------------------------- create ----------------------------- */
  function viewCreate() {
    const m = state.meta;
    shell(el("div", {},
      el("div", { class: "page-head" }, el("div", { class: "h2" }, "New Request")),
      el("div", { class: "card", style: "max-width:640px" },
        el("form", { id: "new-form", onsubmit: onSubmit },
          field("Subject", el("input", { type: "text", name: "subject", maxlength: "100", required: "" }), "Up to 100 characters"),
          field("Category", el("select", { name: "category_id", required: "" },
            el("option", { value: "" }, "Select…"),
            ...m.categories.map((c) => el("option", { value: c.id }, c.name)))),
          field("Priority",
            el("select", { name: "priority" }, el("option", { value: "normal" }, "Normal"),
              el("option", { value: "urgent" }, "Urgent — blocks work / outage"))),
          field("Team", el("select", { name: "team_id" },
            el("option", { value: "" }, "Select…"),
            ...m.teams.map((t) => el("option", { value: t.id }, t.name)))),
          field("Description", el("textarea", { name: "description", required: "" }), "What do you need? Include steps, impact, and any error text."),
          el("button", { type: "submit", class: "btn primary" }, "Submit Request")))));

    function field(label, input, hint) {
      return el("label", { class: "field" },
        el("span", { class: "label" }, label),
        input,
        hint ? el("span", { class: "muted", style: "font-size:12px" }, hint) : null);
    }
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
      try {
        const { ticket } = await API.createTicket(payload);
        toast("Request created: " + ticket.ticket_ref);
        navigate(`/ticket/${ticket.id}`);
      } catch (err) { toast(err.message, "error"); }
    }
  }

  /* ----------------------------- admin ----------------------------- */
  async function viewAdmin() {
    if (!isAdmin()) { navigate("/dashboard"); return; }
    shell(el("div", {},
      el("div", { class: "page-head" }, el("div", { class: "h2" }, "Admin")),
      el("div", { class: "grid cols-2", style: "align-items:start" },
        el("div", { class: "card" },
          el("div", { class: "h3 mb-4" }, "Teams"),
          el("div", { id: "teams-list" }, el("span", { class: "spinner" })),
          el("div", { class: "row mt-4" },
            el("input", { type: "text", id: "new-team", placeholder: "New team name" }),
            el("button", { class: "btn primary sm", onclick: addTeam }, "+ Add"))),
        el("div", { class: "card" },
          el("div", { class: "h3 mb-4" }, "Categories"),
          el("div", { id: "cats-list" }, el("span", { class: "spinner" })),
          el("div", { class: "row mt-4" },
            el("input", { type: "text", id: "new-cat", placeholder: "New category" }),
            el("button", { class: "btn primary sm", onclick: addCat }, "+ Add")))),
      el("div", { class: "card mt-6" },
        el("div", { class: "h3 mb-4" }, "Users"),
        el("div", { id: "users-list" }, el("span", { class: "spinner" })),
        el("button", { class: "btn secondary sm mt-4", onclick: () => openUserModal() }, "+ New User"))));
    await refreshAdmin();
  }

  async function refreshAdmin() {
    const [teams, cats, users] = await Promise.all([API.adminTeams(), API.adminCategories(), API.adminUsers()]);
    $("#teams-list").replaceChildren(...teams.teams.map((t) =>
      el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
        el("span", {}, t.name),
        el("button", { class: "btn ghost sm", onclick: () => API.adminDeleteTeam(t.id).then(refreshAdmin) }, "Delete"))));
    $("#cats-list").replaceChildren(...cats.categories.map((c) =>
      el("div", { class: "row between", style: "padding:6px 0;border-bottom:1px solid var(--surface-low)" },
        el("span", {}, c.name),
        el("button", { class: "btn ghost sm", onclick: () => API.adminDeleteCategory(c.id).then(refreshAdmin) }, "Deactivate"))));
    $("#users-list").replaceChildren(el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ...["Name", "Email", "Role", "Team", ""].map((h) => el("th", {}, h)))),
      el("tbody", {}, ...users.users.map((u) =>
        el("tr", {},
          el("td", {}, u.name), el("td", {}, u.email),
          el("td", {}, u.role), el("td", {}, teamName(u.team_id)),
          el("td", {}, el("button", { class: "btn ghost sm", onclick: () => openUserModal(u) }, "Edit")))))));
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
    const m = state.meta;
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
      !isEdit ? el("label", { class: "field" }, el("span", { class: "label" }, "Password (default if blank: password)"),
        el("input", { type: "text", id: "u-pass" })) : null,
      el("div", { class: "row" }, el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: saveUser }, "Save"))));

    async function saveUser() {
      const payload = {
        name: $("#u-name").value.trim(),
        email: $("#u-email").value.trim(),
        role: $("#u-role").value,
        team_id: $("#u-team").value ? Number($("#u-team").value) : null,
      };
      if (!isEdit) payload.password = $("#u-pass").value.trim() || "password";
      try {
        if (isEdit) await API.adminUpdateUser(user.id, payload);
        else await API.adminCreateUser(payload);
        closeModal(); await refreshAdmin(); toast("Saved.");
      } catch (e) { toast(e.message, "error"); }
    }
  }

  /* ----------------------------- modal ----------------------------- */
  function openModal(title, body) {
    closeModal();
    const back = el("div", { class: "modal-backdrop", id: "modal-back" },
      el("div", { class: "modal" }, el("h3", {}, title), body));
    back.addEventListener("click", (e) => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
  }
  function closeModal() { const m = $("#modal-back"); if (m) m.remove(); }

  /* ----------------------------- boot ----------------------------- */
  function boot() {
    // This app must be served by the Flask backend (it calls /api/*).
    // Opening index.html directly via file:// will silently fail.
    if (location.protocol === "file:") {
      document.getElementById("app").innerHTML =
        '<div style="max-width:560px;margin:15vh auto;padding:24px;' +
        'border:1px solid var(--outline-variant);border-radius:8px;' +
        'font-family:Inter,sans-serif;color:var(--on-surface)">' +
        '<h2 style="margin:0 0 8px">OpsDesk needs the server</h2>' +
        '<p>This page was opened as a file. OpsDesk is a server-backed app and ' +
        'will not load this way.</p>' +
        '<p style="color:var(--on-surface-variant)">Start the server and open it ' +
        'through the browser instead:</p>' +
        '<pre style="background:#0d1117;color:#e6edf3;padding:12px;border-radius:6px">'
        + 'cd /path/to/OpsDesk\npython run.py\n# then open http://127.0.0.1:5000'
        + '</pre></div>';
      return;
    }
    window.addEventListener("hashchange", router);
    API.me().then(({ user }) => {
      state.user = user;
      return loadMeta();
    }).then(() => router())
      .catch(() => { state.user = null; navigate("/login"); });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
