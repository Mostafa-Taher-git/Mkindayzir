/* ==========================================================================
   OpsDesk API client.
   Thin wrapper around fetch. Every backend call goes through here so the
   rest of the app never touches URLs directly. Session cookie is sent
   automatically by the browser.

   CSRF: the backend requires a per-session token on every mutating request,
   sent in the X-CSRF-Token header. We fetch it once after login (and on
   demand) and cache it here. Our own same-site fetch calls include it;
   cross-site forgeries cannot, so they are rejected.
   ========================================================================== */
const API = (() => {
  const base = "";
  let csrfToken = null;

  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const data = await req("GET", "/api/auth/csrf");
    csrfToken = data.csrf_token;
    return csrfToken;
  }

  async function req(method, path, body, isForm) {
    const opts = { method, credentials: "same-origin" };
    if (body !== undefined) {
      if (isForm) {
        opts.body = body; // FormData
      } else {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(body);
      }
    }
    // Mutating requests need the CSRF token in a custom header. This makes the
    // request "non-simple" so the browser blocks cross-site forgeries.
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const token = await ensureCsrf();
      opts.headers = opts.headers || {};
      opts.headers["X-CSRF-Token"] = token;
    }
    const res = await fetch(base + path, opts);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    // Call once after a successful login so later mutations have a token.
    initCsrf: () => ensureCsrf(),

    login:    async (email, password) => {
      const data = await req("POST", "/api/auth/login", { email, password });
      try { csrfToken = (await req("GET", "/api/auth/csrf")).csrf_token; } catch (_) {}
      return data;
    },
    logout:   () => { csrfToken = null; return req("POST", "/api/auth/logout"); },
    me:       () => req("GET", "/api/auth/me"),
    csrf:     () => req("GET", "/api/auth/csrf"),

    listTickets: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("GET", "/api/tickets" + (q ? "?" + q : ""));
    },
    getTicket:  (id) => req("GET", `/api/tickets/${id}`),
    createTicket: (payload) => req("POST", "/api/tickets", payload),
    assign:     (id, payload) => req("POST", `/api/tickets/${id}/assign`, payload),
    setStatus:  (id, payload) => req("POST", `/api/tickets/${id}/status`, payload),
    reopen:     (id) => req("POST", `/api/tickets/${id}/reopen`),
    comment:    (id, payload) => req("POST", `/api/tickets/${id}/comments`, payload),
    upload:     (id, file) => {
      const fd = new FormData();
      fd.append("file", file);
      return req("POST", `/api/tickets/${id}/attachments`, fd, true);
    },
    attachmentUrl: (tid, aid) => `${base}/api/tickets/${tid}/attachments/${aid}`,

    dashboard: () => req("GET", "/api/dashboard"),
    meta:      () => req("GET", "/api/meta"),

    // Phase 1 — notifications
    notifications: () => req("GET", "/api/notifications"),
    markNotifRead: (id) => req("POST", `/api/notifications/${id}/read`),
    markAllNotifRead: () => req("POST", "/api/notifications/read-all"),

    // Phase 1 — password reset
    forgotPassword: (email) => req("POST", "/api/auth/forgot-password", { email }),
    resetPassword: (token, password) => req("POST", "/api/auth/reset-password", { token, password }),

    // Phase 2 — Knowledge Base
    listKb:   (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/kb" + (q ? "?" + q : "")); },
    getKb:    (id) => req("GET", `/api/kb/${id}`),
    createKb: (payload) => req("POST", "/api/kb", payload),
    updateKb: (id, payload) => req("PATCH", `/api/kb/${id}`, payload),
    publishKb:(id) => req("POST", `/api/kb/${id}/publish`),
    deleteKb: (id) => req("DELETE", `/api/kb/${id}`),
    kbFeedback:(id, helpful, comment) => req("POST", `/api/kb/${id}/feedback`, { helpful, comment }),

    // Phase 4 — Reports & CSAT
    reportsSummary: () => req("GET", "/api/reports/summary"),
    reportsWorkload: () => req("GET", "/api/reports/workload"),
    reportsSla: () => req("GET", "/api/reports/sla"),
    reportsTrend: (days) => req("GET", "/api/reports/trend?days=" + (days || 30)),
    exportCsv: async () => {
      const token = await API.initCsrf();
      const res = await fetch("/api/reports/export.csv", {
        method: "GET", credentials: "same-origin",
        headers: { "X-CSRF-Token": token },
      });
      if (!res.ok) {
        let msg = "Export failed (" + res.status + ")";
        try { msg = (await res.json()).error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // preserve the server-sent filename when available
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename=([^;]+)/);
      a.download = m ? m[1].replace(/"/g, "") : "opsdesk-tickets.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    rateTicket: (id, score) => req("POST", `/api/tickets/${id}/rate`, { score }),

    // v2 — AI assistance (draft-only; server returns 503 when disabled)
    aiSuggestReply: (id) => req("GET", `/api/ai/suggest-reply/${id}`),
    aiSummarize: (id) => req("GET", `/api/ai/summarize/${id}`),
    aiSuggestPriority: (id) => req("GET", `/api/ai/suggest-priority/${id}`),

    // Admin
    adminTeams:    () => req("GET", "/api/admin/teams"),
    adminCreateTeam: (name) => req("POST", "/api/admin/teams", { name }),
    adminDeleteTeam: (id) => req("DELETE", `/api/admin/teams/${id}`),
    adminCategories: () => req("GET", "/api/admin/categories"),
    adminCreateCategory: (name, description) => req("POST", "/api/admin/categories", { name, description }),
    adminDeleteCategory: (id) => req("DELETE", `/api/admin/categories/${id}`),
    adminUsers:    () => req("GET", "/api/admin/users"),
    adminCreateUser: (u) => req("POST", "/api/admin/users", u),
    adminUpdateUser: (id, u) => req("PATCH", `/api/admin/users/${id}`, u),
    adminDeleteUser: (id) => req("DELETE", `/api/admin/users/${id}`),
  };
})();
