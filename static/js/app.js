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

  const state = { user: null, meta: null, aiEnabled: false };

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
  const slaBadge = (t) => {
    if (!t || !t.sla) return null;
    const s = t.sla;
    let label, cls;
    if (s.breached) { label = "SLA breached"; cls = "breached"; }
    else if (s.resolution_met === 0) { label = "SLA missed"; cls = "atrisk"; }
    else { label = "On track"; cls = "ok"; }
    return el("span", { class: "sla-badge " + cls, title: "Policy: " + (s.policy_name || "default") + (s.breach_at ? " · due " + fmtDate(s.breach_at) : "") }, "SLA: " + label);
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
    const showYear = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleString([], { month: "short", day: "numeric", year: showYear ? "numeric" : undefined, hour: "2-digit", minute: "2-digit" });
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
      const { articles } = await API.listKb(q ? { q } : {});
      if (!articles.length) { list.replaceChildren(el("div", { class: "empty" }, "No articles yet.")); return; }
      list.replaceChildren(el("div", { class: "kb-list" },
        ...articles.map((a) => el("a", { class: "card kb-card", href: `#/kb/${a.id}`,
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
      const { article } = await API.getKb(id);
      const wrap = $("#kb-article");
      wrap.replaceChildren(
        el("a", { href: "#/kb", onclick: () => navigate("/kb") }, "Back to Help Center"),
        el("h1", { class: "h2 mt-3" }, article.title),
        el("div", { class: "muted mb-4" }, categoryName(article.category_id) + (article.author_name ? " . by " + article.author_name : "")),
        el("div", { class: "kb-body" }, esc(article.body)),
        el("div", { class: "mt-6 card", style: "padding:16px" },
          el("div", { class: "label mb-2" }, "Was this helpful?"),
          el("div", { id: "kb-feedback-btns" },
            el("button", { class: "btn secondary sm", onclick: () => sendKbFeedback(article.id, true, this) }, "Yes"),
            " ",
            el("button", { class: "btn secondary sm", onclick: () => sendKbFeedback(article.id, false, this) }, "No"))));
    } catch (e) { toast(e.message, "error"); navigate("/kb"); }
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
    if (state.user.role === "requester") { navigate("/kb"); return; }
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Manage Knowledge Base"),
        el("div", { class: "spacer" }),
        el("button", { class: "btn primary sm", onclick: () => navigate("/kb/new") }, "New Article")),
      el("div", { class: "mt-4", id: "kb-admin-list" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading...")));
    shell(main);
    try {
      const { articles } = await API.listKb();
      const list = $("#kb-admin-list");
      if (!articles.length) { list.replaceChildren(el("div", { class: "empty" }, "No articles. Create one.")); return; }
      list.replaceChildren(el("div", { class: "kb-list" },
        ...articles.map((a) => el("div", { class: "card kb-card" },
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
    if (state.user.role === "requester") { navigate("/kb"); return; }
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const editId = params.get("id");
    let article = null;
    if (editId) { try { article = (await API.getKb(editId)).article; } catch (_) {} }
    const main = el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, editId ? "Edit Article" : "New Article")),
      el("form", { id: "kbForm", class: "card mt-4", style: "padding:20px", onsubmit: onKbSubmit },
        field("Title", el("input", { type: "text", name: "title", required: "", value: article ? article.title : "", maxlength: "100" })),
        field("Category", catSelect(article ? article.category_id : "")),
        field("Body", el("textarea", { name: "body", required: "", rows: "10", maxlength: "20000" }, article ? article.body : "")),
        el("div", { class: "mt-3" },
          el("button", { type: "submit", class: "btn primary" }, editId ? "Save changes" : "Create draft"))));
    shell(main);

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


  async function viewReports() {
    if (state.user.role !== "manager" && state.user.role !== "admin") { navigate("/dashboard"); return; }
    const main = el("div", {}, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading reports…"));
    shell(main);
    try {
      const [sum, work, sla, trend] = await Promise.all([
        API.reportsSummary(), API.reportsWorkload(), API.reportsSla(), API.reportsTrend(30)]);
      const s = sum, w = work, sl = sla, tr = trend;
      const cards = el("div", { class: "report-cards" },
        reportCard("Total tickets", s.total),
        reportCard("Open", s.open),
        reportCard("SLA attainment", (s.sla_attainment_pct != null ? s.sla_attainment_pct + "%" : "n/a")),
        reportCard("Avg resolution", (s.avg_resolution_hours != null ? s.avg_resolution_hours + "h" : "n/a")),
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
      const exportBtn = el("button", { class: "btn primary mt-4", onclick: async () => {
          try { await API.exportCsv(); } catch (e) { toast(e.message, "error"); }
        } }, "Export CSV");
      main.replaceChildren(
        el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Reports"), el("div", { class: "spacer" }), exportBtn),
        cards, workloadTable, slaBox, trendList);
    } catch (e) {
      main.replaceChildren(
        el("div", { class: "empty" },
          el("span", { class: "label" }, "Couldn't load reports"),
          el("div", { class: "muted mt-2" }, e.message || "Unknown error"),
          el("button", { class: "btn ghost mt-4", onclick: () => viewReports() }, "Retry")));
    }
  }

  function reportCard(label, value, sub) {
    return el("div", { class: "card report-card" },
      el("div", { class: "report-value" }, String(value)),
      el("div", { class: "report-label" }, label),
      sub ? el("div", { class: "muted", style: "font-size:12px" }, sub) : null);
  }

  function catSelect(selected) {
    const sel = el("select", { name: "category_id", id: "category_id" },
      el("option", { value: "" }, "Uncategorized"));
    (state.meta ? state.meta.categories : []).forEach((cat) => {
      const o = el("option", { value: cat.id }, cat.name);
      if (String(cat.id) === String(selected)) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
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
        try { await API.rateTicket(t.id, n); toast("Thanks for rating!", "info"); viewTicket(t.id); }
        catch (e) { toast(e.message, "error"); }
      }
    }, "★".repeat(n) + "☆".repeat(5 - n)));
    return el("div", { class: "mt-4" },
      el("span", { class: "label" }, "Rate your experience"),
      el("div", { style: "display:flex;gap:4px;margin-top:4px" }, ...stars));
  }
  // v2 — AI assist panel (draft-only suggestions; agent/manager only, when enabled)
  function aiPanel(t) {
    if (!state.aiEnabled) return null;
    if (!helpers_isStaff(state.user.role)) return null;
    const out = el("div", { class: "card compact mt-4" },
      el("div", { class: "label mb-2" }, "AI assist (draft only)"),
      el("p", { class: "muted", style: "font-size:12px;margin:0 0 8px 0" },
        "Generates draft text from ticket content. Does not send anything to the requester, update tickets, or share your API key."),
      el("details", { class: "mt-2 mb-2", style: "font-size:12px" },
        el("summary", { style: "cursor:pointer;color:var(--primary)" }, "What do these buttons do?"),
        el("ul", { style: "margin:8px 0 0 18px;line-height:1.6" },
          el("li", {}, el("strong", {}, "Summarize"), " — writes a concise summary of the ticket and conversation."),
          el("li", {}, el("strong", {}, "Suggest reply"), " — drafts a public response for the requester based on the thread."),
          el("li", {}, el("strong", {}, "Suggest priority"), " — recommends Normal or Urgent based on ticket content."))),
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

  function helpers_isStaff(role) { return role === "agent" || role === "manager" || role === "admin"; }

  function categoryName(id) {
    if (id == null) return "Uncategorized";
    const c = state.meta && state.meta.categories.find((x) => x.id === id);
    return c ? c.name : "Uncategorized";
  }

  /* ----------------------------- router ----------------------------- */
  const routes = {
    "/login": viewLogin,
    "/forgot": viewForgotPassword,
    "/reset": viewResetPassword,
    "/notifications": openNotifications,
    "/dashboard": viewDashboard,
    "/queue": viewQueue,
    "/my": viewMyRequests,
    "/new": viewCreate,
    "/ticket": viewTicket,
    "/admin": viewAdmin,
    "/kb": viewKb,
    "/kb/manage": viewKbManage,
    "/kb/new": viewKbEdit,
    "/kb/:id": viewKbArticle,
    "/reports": viewReports,
    "/settings": viewSettings,
  };

  function navigate(hash) {
    if (!hash) hash = state.user ? "/dashboard" : "/login";
    location.hash = hash;
  }

  function router() {
    const hash = location.hash.replace(/^#/, "") || (state.user ? "/dashboard" : "/login");
    const parts = hash.split("/").filter(Boolean);
    const path = parts[0] || (state.user ? "dashboard" : "login");
    const param = parts[1];
    const key = "/" + path;
    let render = routes[key] || (state.user ? viewDashboard : viewLogin);
    // Nested KB routes (/kb/manage, /kb/new, /kb/<id>) key to /kb in the flat
    // map, so resolve the full path when a nested route is registered.
    if (path === "kb") {
      const nested = "/" + parts.join("/");
      if (routes[nested]) render = routes[nested];
      else if (parts.length >= 2) render = viewKbArticle;
    }
    try {
      render(param);
    } catch (e) {
      console.error(e);
      toast("Something went wrong rendering this page.", "error");
    }
  }

  /* ----------------------------- shell ----------------------------- */
  // Brand mark: app logo + wordmark (icon from /static/logo.png).
  function brandEl() {
    return el("div", { class: "brand" },
      el("img", { src: "/static/logo.png", alt: "OpsDesk logo", class: "brand-logo", width: 28, height: 28 }),
      el("span", {}, "OpsDesk"));
  }

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
// Knowledge Base: Help Center for everyone; Manage KB for staff.
    navItems.push(["/kb", "Help Center", "📚"]);
    if (state.user.role !== "requester") navItems.push(["/kb/manage", "Manage KB", "✍️"]);
    if (state.user.role === "manager" || state.user.role === "admin") navItems.push(["/reports", "Reports", "📈"]);
    if (isAdmin()) navItems.push(["/admin", "Admin", "⚙️"]);
    navItems.push(["/settings", "Settings", "🔑"]);

    const sidebar = el("nav", { class: "sidebar", "aria-label": "Primary" },
      ...navItems.map(([href, label, icon]) => {
          const active = location.hash.includes(href);
          return el("a", { href: "#" + href, class: "nav-item" + (active ? " active" : ""),
                           "aria-current": active ? "page" : undefined,
                           onclick: (e) => { e.preventDefault(); navigate(href); } },
            el("span", { "aria-hidden": "true" }, icon), el("span", {}, label));
        }));

    const root = $("#app");
    root.innerHTML = "";
    root.appendChild(el("div", { class: "topbar" },
      brandEl(),
      el("div", { class: "spacer" }),
      el("div", { class: "who" }, "Signed in as ", el("b", {}, state.user.name),
        " · ", el("span", { class: "label" }, state.user.role)),
      el("button", { class: "btn ghost sm", id: "theme-toggle", "aria-label": "Toggle dark mode", onclick: toggleTheme },
        document.documentElement.getAttribute("data-theme") === "dark" ? "☀ Light" : "🌙 Dark"),
      el("button", { class: "btn ghost sm", id: "notif-bell", "aria-label": "Notifications", onclick: openNotifications },
        "🔔", el("span", { class: "badge-count", id: "notif-count", style: "display:none" }, "0")),
      el("button", { class: "btn ghost sm", id: "menu-toggle", "aria-label": "Open menu", onclick: openMobileDrawer }, "☰"),
      el("button", { class: "btn ghost sm", onclick: doLogout }, "Log out")));
    root.appendChild(el("div", { class: "layout" }, sidebar, el("main", { class: "main" }, inner)));
  }

  function openMobileDrawer() {
    const drawer = el("nav", { class: "sidebar mobile-drawer", "aria-label": "Mobile" },
      ...navItems.map(([href, label, icon]) => {
        const active = location.hash.includes(href);
        return el("a", { href: "#" + href, class: "nav-item" + (active ? " active" : ""),
                         "aria-current": active ? "page" : undefined,
                         onclick: (e) => { e.preventDefault(); navigate(href); closeMobileDrawer(); } },
          el("span", { "aria-hidden": "true" }, icon), el("span", {}, label));
      }),
      el("button", { class: "btn ghost sm mt-4", onclick: closeMobileDrawer }, "Close"));
    const root = $("#app");
    const backdrop = el("div", { class: "drawer-backdrop", onclick: closeMobileDrawer });
    root.appendChild(backdrop);
    root.appendChild(drawer);
  }

  function closeMobileDrawer() {
    const root = $("#app");
    const drawer = root.querySelector(".mobile-drawer");
    const backdrop = root.querySelector(".drawer-backdrop");
    if (drawer) drawer.remove();
    if (backdrop) backdrop.remove();
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("opsdesk-theme", next); } catch (_) {}
    // update toggle label without a full re-render
    const btn = $("#theme-toggle");
    if (btn) btn.textContent = next === "dark" ? "☀ Light" : "🌙 Dark";
  }

  async function doLogout() {
    await API.logout();
    state.user = null;
    navigate("/login");
  }

  /* ----------------------------- notifications (Phase 1) ----------------------------- */
  let _notifTimer = null;

  async function refreshBell() {
    const bell = $("#notif-bell");
    const count = $("#notif-count");
    if (!bell || !count) return;
    try {
      const { unread_count } = await API.notifications();
      count.textContent = unread_count;
      count.style.display = unread_count > 0 ? "inline-block" : "none";
    } catch (_) { /* non-critical */ }
  }

  function startNotifPolling() {
    refreshBell();
    clearInterval(_notifTimer);
    _notifTimer = setInterval(refreshBell, 30000); // refresh every 30s
  }

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
        state.user = u.user;
        state.aiEnabled = !!u.ai_enabled;
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

  function field(label, input) {
    return el("label", { class: "field" }, el("span", { class: "label" }, label), input);
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
      const inner = el("div", {},
        el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Manager Dashboard"),
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
    shell(el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Ticket Queue")),
      queueFilters(),
      el("div", { id: "ticket-list", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")),
      el("div", { class: "row between mt-3" },
        el("div", { class: "row" }, "Page ", el("input", { type: "number", id: "ticket-page", min: "1", value: "1", style: "width:70px" }), el("button", { class: "btn ghost sm", onclick: reload }, "Go")),
        el("div", { id: "ticket-pager", class: "muted" }, ""))));
    await reload();
  }

  async function viewMyRequests() {
    const head = el("div", { class: "page-head" },
      el("h1", { class: "h2" }, "My Requests"),
      el("div", { class: "spacer" }),
      state.user.role === "requester" ? el("button", { class: "btn primary sm", onclick: () => navigate("/new") }, "New Request") : null);
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
      const data = await API.listTickets(params);
      const tickets = data.tickets || [];
      if (!tickets.length) {
        listEl.replaceChildren(el("div", { class: "empty" }, "No tickets match your filters."));
        document.getElementById("ticket-pager")?.replaceChildren(el("span", { class: "muted" }, ""));
        return;
      }
      listEl.replaceChildren(ticketTable(tickets, { showAged: false }));
      renderPager("ticket-pager", data.pagination, (p) => {
        $("#ticket-page").value = String(p);
        reload();
      });
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
        el("td", {}, slaBadge(t) || el("span", { class: "muted" }, "-")),
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
    return el("div", { class: "table-wrap" },
      el("table", { class: "tbl" },
        el("thead", {}, el("tr", {}, ...["Ref", "Subject", "Category", "Status", "Priority", "Assignee", "Team", "Updated",
          ...(opts.showAged ? ["Flag"] : [])].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, ...rows)));
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
          el("h2", { class: "h2" }, t.subject)),
        el("div", { class: "spacer" }),
        statusBadge(t.status), priorityPill(t.priority), slaBadge(t));

      // Left column: details + comments
      const detailCard = el("div", { class: "card" },
        kvRow("Requester", nameOf(t.requester_id)),
        kvRow("Assignee", nameOf(t.assignee_id, "Unassigned")),
        kvRow("Team", teamName(t.team_id)),
        kvRow("Category", catName(t.category_id)),
        kvRow("Priority", t.priority === "urgent" ? "Urgent" : "Normal"),
        kvRow("Created", fmtDate(t.created_at)),
        kvRow("Updated", fmtDate(t.updated_at)),
        t.sla ? kvRow("SLA", (t.sla.breached ? "Breached" : (t.sla.resolution_met === 0 ? "At risk" : "On track")) + (t.sla.policy_name ? " (" + t.sla.policy_name + ")" : "") + (t.sla.breach_at ? " . due " + fmtDate(t.sla.breach_at) : "")) : null,
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

      const left = el("div", { class: "flex1" }, detailCard, commentThread, attachSection);

      // Right column: actions + activity
      const actions = el("div", { class: "card compact mb-4" },
        el("div", { class: "label mb-2" }, "Actions"),
        el("div", { class: "row wrap" },
          canHandle ? el("button", { class: "btn secondary sm", onclick: () => claim(t) }, t.assignee_id ? "Reassign" : "Claim") : null,
          canHandle ? statusButtons(t) : null,
          canHandle ? el("button", { class: "btn secondary sm", onclick: () => changePriority(t) }, "Change Priority") : null,
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
        el("button", { class: "btn primary sm", onclick: () => changeStatus(t.id, to) }, (STATUS_LABELS[to] || to))));
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
    const users = state.meta.users || [];
    const ticketTeamId = t.team_id;

    // Filter users by team if ticket has a team; otherwise show all agents/managers
    const assignableUsers = users.filter(u =>
      ["agent", "manager", "admin"].includes(u.role) &&
      (ticketTeamId == null || u.team_id == ticketTeamId)
    );

    // For agents: show dropdown with "Claim for me" + team members
    if (state.user.role === "agent") {
      const agentOptions = [
        { value: "me", label: "Claim for me" },
        ...assignableUsers.filter(u => u.id !== state.user.id).map(u => ({ value: u.id, label: `${u.name} (${teamName(u.team_id)})` }))
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
            await API.assign(t.id, payload);
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
          await API.assign(t.id, { assignee_id: uid });
          closeModal(); viewTicket(t.id); toast("Assigned.");
        } }, "Save"))));
  }

  async function changeStatus(id, to) {
    const needsNote = ["blocked", "reopened"].includes(to);
    const body = el("div", {},
      el("p", { class: "muted" }, `Move ticket to "${STATUS_LABELS[to] || to}".`),
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

  async function changePriority(t) {
    const current = t.priority;
    const options = ["normal", "urgent"].filter(p => p !== current);
    if (!options.length) return;
    const body = el("div", {},
      el("p", { class: "muted" }, `Current priority: ${current === "urgent" ? "Urgent" : "Normal"}.`),
      el("label", { class: "field" },
        el("span", { class: "label" }, "New priority"),
        el("select", { id: "priority-pick" },
          ...options.map(p => el("option", { value: p }, p === "urgent" ? "Urgent" : "Normal")))));
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

  async function doDeleteKb(id) {
    const confirmed = await confirmModal(
      "Delete this article? This cannot be undone.",
      "Delete",
      "btn danger sm"
    );
    if (!confirmed) return;
    try { await API.deleteKb(id); toast("Deleted.", "info"); viewKbManage(); }
    catch (e) { toast(e.message, "error"); }
  }

  /* ----------------------------- create ----------------------------- */
  function viewCreate() {
    const m = state.meta;
    shell(el("div", {},
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "New Request")),
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
  async function viewSettings() {
    if (!state.user) { navigate("/login"); return; }
    const main = el("div", {}, el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Settings")));
    shell(main);
    let hasKey = false, model = state.user.ai_model || "", models = [];
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
          const key = $("#ai-key").value.trim();
          const mdl = $("#ai-model").value;
          const r = await API.saveAiSettings({ api_key: key, model: mdl });
          if (r.ok) {
            toast("Settings saved", "info");
            // Refresh local state and reload so AI enablement/dropdown update.
            const s = await API.getAiSettings();
            state.user.ai_model = s.model;
            state.aiEnabled = s.has_key;
            location.reload();
          }
        }}, "Save"),
        hasKey ? el("button", { class: "btn danger sm", onclick: async () => {
          const r = await API.saveAiSettings({ api_key: "", model: model });
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
        el("button", { class: "btn secondary sm mt-4", onclick: () => openUserModal() }, "+ New User"))));
    await refreshAdmin();
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
        el("input", { type: "password", id: "u-pass", autocomplete: "new-password", placeholder: "••••••••" })) : null,
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
  let _modalKeyHandler = null;
  function openModal(title, body, onSave) {
    closeModal();
    const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, tabindex: "-1" },
      el("h3", {}, title), body);
    // Footer with Cancel/Save only when a save handler is supplied.
    if (typeof onSave === "function") {
      modal.appendChild(el("div", { class: "row mt-6" },
        el("div", { class: "spacer" }),
        el("button", { class: "btn ghost sm", onclick: () => closeModal() }, "Cancel"),
        el("button", { class: "btn primary sm", onclick: async (e) => {
          const ok = await onSave();
          if (ok === false) return; // validation failed; keep open
          closeModal();
        } }, "Save")));
    }
    const back = el("div", { class: "modal-backdrop", id: "modal-back" }, modal);
    back.addEventListener("click", (e) => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);

    // Focus management + Esc + simple focus trap.
    const focusables = () => modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusables()[0];
    if (first) first.focus();
    _modalKeyHandler = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const idx = Array.prototype.indexOf.call(f, document.activeElement);
        if (e.shiftKey && (idx <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (idx === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", _modalKeyHandler);
  }
function closeModal() {
    const m = $("#modal-back");
    if (m) { m.remove(); }
    if (_modalKeyHandler) { document.removeEventListener("keydown", _modalKeyHandler); _modalKeyHandler = null; }
  }

  /* Confirmation modal for destructive actions.
   * Shows a message with Cancel/Confirm buttons. Returns a Promise that
   * resolves to true if confirmed, false if cancelled.
   */
  function confirmModal(message, confirmLabel = "Confirm", confirmClass = "btn danger sm") {
    return new Promise((resolve) => {
      closeModal();
      const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Confirm", tabindex: "-1" },
        el("h3", {}, "Confirm action"),
        el("p", { class: "muted", style: "margin-bottom: 16px" }, message));
      modal.appendChild(el("div", { class: "row mt-6" },
        el("div", { class: "spacer" }),
        el("button", { class: "btn ghost sm", onclick: () => { closeModal(); resolve(false); } }, "Cancel"),
        el("button", { class: confirmClass, onclick: () => { closeModal(); resolve(true); } }, confirmLabel)));
      const back = el("div", { class: "modal-backdrop", id: "modal-back" }, modal);
      back.addEventListener("click", (e) => { if (e.target === back) { closeModal(); resolve(false); } });
      document.body.appendChild(back);

      // Focus management + Esc
      const focusables = () => modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const first = focusables()[0];
      if (first) first.focus();
      _modalKeyHandler = (e) => {
        if (e.key === "Escape") { e.preventDefault(); closeModal(); resolve(false); return; }
        if (e.key === "Tab") {
          const f = focusables();
          if (!f.length) return;
          const idx = Array.prototype.indexOf.call(f, document.activeElement);
          if (e.shiftKey && (idx <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (idx === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        }
      };
      document.addEventListener("keydown", _modalKeyHandler);
    });
  }

  /* ----------------------------- boot ----------------------------- */
  function boot() {
    // Apply saved theme before first paint to avoid a flash.
    try {
      const saved = localStorage.getItem("opsdesk-theme");
      if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
    } catch (_) {}
    // Surface any uncaught error on-screen (instead of a silent white page).
    window.addEventListener("error", (e) => {
      const root = document.getElementById("app");
      if (root && root.childElementCount === 0) {
        root.innerHTML = '<div style="max-width:640px;margin:12vh auto;padding:20px;'
          + 'border:1px solid #f5c2c7;border-radius:8px;font-family:monospace;'
          + 'background:#fff5f5;color:#842029"><b>Frontend error</b><pre style='
          + '"white-space:pre-wrap;margin-top:8px">' + esc(e.message) + '\n'
          + (e.filename || '') + ':' + (e.lineno || '') + '</pre>'
          + '<p style="font-family:sans-serif">Open DevTools (F12) → Console for the full trace.</p></div>';
      }
    });
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
    API.me().then(({ user, ai_enabled }) => {
      state.user = user;
      state.aiEnabled = !!ai_enabled;
      return loadMeta();
    }).then(() => router())
      .catch(() => { state.user = null; navigate("/login"); });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
