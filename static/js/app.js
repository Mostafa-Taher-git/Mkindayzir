/* ==========================================================================
   OpsDesk SPA application logic (shell + shared helpers).

   Structure:
     - OD.state     : current user + cached meta (teams/categories/users)
     - OD.h         : shared helpers (DOM building, toast, formatting, shell,
                      modals, navigation, notification bell polling)
     - OD.views     : screen renderers — defined in views/core.js, which loads
                      BEFORE this file so the router can resolve them
   Edit static/js/views/core.js to change what each screen shows.
   ========================================================================== */
(() => {
  "use strict";

  const OD = (window.OpsDesk = window.OpsDesk || {});
  OD.views = OD.views || {};
  const views = OD.views;
  const h = (OD.h = OD.h || {});
  const state = { user: null, meta: null, aiEnabled: false };
  OD.state = state;

  /* ----------------------------- helpers ----------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, k);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
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
  const PRIORITY_LABELS = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
  const priorityLabel = (p) => PRIORITY_LABELS[p] || "Normal";
  const priorityPill = (p) => el("span", { class: `pill ${p}` }, priorityLabel(p));

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
  const isManager = () => state.user.role === "manager" || state.user.role === "admin";
  const isStaffRole = (role) => role === "agent" || role === "manager" || role === "admin";

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
  function categoryName(id) {
    if (id == null) return "Uncategorized";
    const c = state.meta && state.meta.categories.find((x) => x.id === id);
    return c ? c.name : "Uncategorized";
  }

  // Brand mark: app logo + wordmark (icon from /static/logo.png).
  function brandEl() {
    return el("div", { class: "brand" },
      el("img", { src: "/static/logo.png", alt: "OpsDesk logo", class: "brand-logo", width: 28, height: 28 }),
      el("span", {}, "OpsDesk"));
  }

  /* ----------------------------- notifications bell (Phase 1) ----------------------------- */
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

  /* ----------------------------- router ----------------------------- */
  const routes = {
    "/login": views.viewLogin,
    "/forgot": views.viewForgotPassword,
    "/reset": views.viewResetPassword,
    "/notifications": views.openNotifications,
    "/dashboard": views.viewDashboard,
    "/queue": views.viewQueue,
    "/my": views.viewMyRequests,
    "/new": views.viewCreate,
    "/ticket": views.viewTicket,
    "/admin": views.viewAdmin,
    "/kb": views.viewKb,
    "/kb/manage": views.viewKbManage,
    "/kb/new": views.viewKbEdit,
    "/kb/:id": views.viewKbArticle,
    "/kb/collections": views.viewKbCollections,
    "/kb/collections/:id": views.viewKbCollection,
    "/reports": views.viewReports,
    "/settings": views.viewSettings,
    // Phase 1A — Jira suite (views/jira.js loads before this file)
    "/jira/projects": views.jiraProjects,
    "/jira/backlog": views.jiraBacklog,
    "/jira/board": views.jiraBoard,
    "/jira/issue": views.jiraIssue,
    "/jira/sprints": views.jiraSprints,
    "/jira/goals": views.jiraGoals,
    // Phase 2A — Trello suite (views/trello.js loads before this file)
    "/trello": views.trelloHome,
    "/trello/starred": views.trelloHome,
    "/trello/board": views.trelloBoard,
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
    let render = routes[key] || (state.user ? views.viewDashboard : views.viewLogin);
    // Nested KB routes (/kb/manage, /kb/new, /kb/<id>) key to /kb in the flat
    // map, so resolve the full path when a nested route is registered.
    if (path === "kb") {
      const nested = "/" + parts.join("/");
      if (routes[nested]) render = routes[nested];
      else if (parts.length >= 2) render = views.viewKbArticle;
    }
    // Jira suite: #/jira/<view>/<id> resolves to the registered sub-view
    // (the trailing id is read by the view from location.hash).
    if (path === "jira") {
      const nested = "/" + parts.slice(0, 2).join("/");
      if (routes[nested]) render = routes[nested];
      else render = views.jiraProjects;
    }
    // Trello suite: #/trello/board/<id>, #/trello/starred
    if (path === "trello") {
      const nested = "/" + parts.slice(0, 2).join("/");
      if (routes[nested]) render = routes[nested];
      else render = views.trelloHome;
    }
    try {
      render(param);
    } catch (e) {
      console.error(e);
      toast("Something went wrong rendering this page.", "error");
    }
  }

  /* ----------------------------- shell ----------------------------- */
  function navItems() {
    const items = [];
    if (state.user.role === "requester") {
      items.push(["/my", "My Requests", "📥"]);
      items.push(["/new", "New Request", "➕"]);
    } else {
      items.push(["/dashboard", "Dashboard", "📊"]);
      items.push(["/queue", "Queue", "🗂️"]);
    }
    // Knowledge Base: Help Center for everyone; Manage KB and Collections for staff.
    items.push(["/kb", "Help Center", "📚"]);
    if (state.user.role !== "requester") {
      items.push(["/kb/manage", "Manage KB", "✍️"]);
      items.push(["/kb/collections", "Collections", "🗂️"]);
    }
    if (state.user.role === "manager" || state.user.role === "admin") items.push(["/reports", "Reports", "📈"]);
    // Phase 1A — Jira Workflows (staff only)
    if (state.user.role !== "requester") {
      items.push(["", "Jira Workflows", ""]);
      items.push(["/jira/projects", "Projects", "📁"]);
      items.push(["/jira/backlog", "Backlog", "📋"]);
      items.push(["/jira/board", "Board", "🗂️"]);
      items.push(["/jira/sprints", "Sprints", "🏃"]);
      items.push(["/jira/goals", "Goals & OKRs", "🎯"]);
    }
    // Phase 2A — Trello Boards (all logged-in users)
    items.push(["", "Trello Boards", ""]);
    items.push(["/trello", "My Boards", "🗂️"]);
    items.push(["/trello/starred", "Starred Boards", "★"]);
    if (isAdmin()) items.push(["/admin", "Admin", "⚙️"]);
    items.push(["/settings", "Settings", "🔑"]);
    return items;
  }

  async function doLogout() {
    await API.logout();
    state.user = null;
    navigate("/login");
  }

  function shell(inner) {
    const sidebar = el("nav", { class: "sidebar", "aria-label": "Primary" },
      ...navItems().map(([href, label, icon]) => {
          if (!href) return el("div", { class: "nav-sep" }, label);
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
      el("button", { class: "btn ghost sm", id: "notif-bell", "aria-label": "Notifications", onclick: () => views.openNotifications() },
        "🔔", el("span", { class: "badge-count", id: "notif-count", style: "display:none" }, "0")),
      el("button", { class: "btn ghost sm", id: "menu-toggle", "aria-label": "Open menu", onclick: openMobileDrawer }, "☰"),
      el("button", { class: "btn ghost sm", onclick: doLogout }, "Log out")));
    root.appendChild(el("div", { class: "layout" }, sidebar, el("main", { class: "main" }, inner)));
  }

  function openMobileDrawer() {
    const drawer = el("nav", { class: "sidebar mobile-drawer", "aria-label": "Mobile" },
      ...navItems().map(([href, label, icon]) => {
        if (!href) return el("div", { class: "nav-sep" }, label);
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

  /* ----------------------------- shared helper registry ----------------------------- */
  Object.assign(h, {
    $, el, esc,
    STATUS_LABELS, slaBadge, statusBadge, priorityLabel, priorityPill,
    toast, fmtDate, ago,
    isAgent, isAdmin, isManager, isStaffRole,
    currentUser: () => state.user,
    loadMeta, nameOf, teamName, catName, categoryName,
    brandEl, shell, navigate, openModal, closeModal, confirmModal,
    refreshBell, startNotifPolling,
  });
})();