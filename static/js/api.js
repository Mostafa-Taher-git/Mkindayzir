/* ==========================================================================
   OpsDesk API client.
   Thin wrapper around fetch. Every backend call goes through here so the
   rest of the app never touches URLs directly. Session cookie is sent
   automatically by the browser.

   Phase 0 (unified schema): tickets live under /api/jira/issues; the
   backend keeps legacy field aliases (subject/ticket_ref) in responses,
   so views can keep using them until Phase 5 migrations are complete.

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

    // Issues (tickets) — /api/jira/issues/*
    listIssues: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("GET", "/api/jira/issues" + (q ? "?" + q : ""));
    },
    getIssue:   (id) => req("GET", `/api/jira/issues/${id}`),
    createIssue: (payload) => req("POST", "/api/jira/issues", payload),
    assignIssue: (id, payload) => req("POST", `/api/jira/issues/${id}/assign`, payload),
    setStatus:  (id, payload) => req("POST", `/api/jira/issues/${id}/status`, payload),
    setPriority: (id, priority) => req("POST", `/api/jira/issues/${id}/priority`, { priority }),
    updateIssue: (id, payload) => req("PATCH", `/api/jira/issues/${id}`, payload),
    bulkAction: (payload) => req("POST", "/api/jira/issues/bulk", payload),
    listFollowers: (id) => req("GET", `/api/jira/issues/${id}/followers`),
    followIssue: (id) => req("POST", `/api/jira/issues/${id}/follow`),
    unfollowIssue: (id) => req("DELETE", `/api/jira/issues/${id}/follow`),
    kbSuggest: (q) => req("GET", "/api/kb/suggest?q=" + encodeURIComponent(q)),
    reopen:     (id) => req("POST", `/api/jira/issues/${id}/reopen`),
    comment:    (id, payload) => req("POST", `/api/jira/issues/${id}/comments`, payload),
    upload:     (id, file) => {
      const fd = new FormData();
      fd.append("file", file);
      return req("POST", `/api/jira/issues/${id}/attachments`, fd, true);
    },
    attachmentUrl: (iid, aid) => `${base}/api/jira/issues/${iid}/attachments/${aid}`,

    // Phase 1A — Jira projects & sprints
    listProjects: () => req("GET", "/api/jira/projects"),
    createProject: (payload) => req("POST", "/api/jira/projects", payload),
    getProject: (id) => req("GET", `/api/jira/projects/${id}`),
    updateProject: (id, payload) => req("PATCH", `/api/jira/projects/${id}`, payload),
    listSprints: (projectId) => req("GET", `/api/jira/sprints?project_id=${projectId}`),
    createSprint: (payload) => req("POST", "/api/jira/sprints", payload),
    startSprint: (id) => req("POST", `/api/jira/sprints/${id}/start`),
    completeSprint: (id) => req("POST", `/api/jira/sprints/${id}/complete`),

    // Phase 1B — Goals / OKRs
    listGoals: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("GET", "/api/jira/goals" + (q ? "?" + q : ""));
    },
    createGoal: (payload) => req("POST", "/api/jira/goals", payload),
    updateGoal: (id, payload) => req("PATCH", `/api/jira/goals/${id}`, payload),
    goalProgress: (id) => req("GET", `/api/jira/goals/${id}/progress`),

    // Phase 1B — admin: workflow scheme builder + custom field defs
    adminWorkflows: () => req("GET", "/api/jira/admin/workflows"),
    saveWorkflow: (payload) => req("POST", "/api/jira/admin/workflows", payload),
    deleteWorkflow: (payload) => req("DELETE", "/api/jira/admin/workflows", payload),
    adminCustomFields: () => req("GET", "/api/jira/admin/custom-fields"),
    createCustomField: (payload) => req("POST", "/api/jira/admin/custom-fields", payload),
    deleteCustomField: (id) => req("DELETE", `/api/jira/admin/custom-fields/${id}`),

    dashboard: () => req("GET", "/api/dashboard"),
    meta:      () => req("GET", "/api/meta"),

    // Phase 2A — Trello workspaces & boards
    listWorkspaces: () => req("GET", "/api/trello/workspaces"),
    createWorkspace: (payload) => req("POST", "/api/trello/workspaces", payload),
    updateWorkspace: (id, payload) => req("PATCH", `/api/trello/workspaces/${id}`, payload),
    workspaceMembers: (id) => req("GET", `/api/trello/workspaces/${id}/members`),
    addWorkspaceMember: (id, payload) => req("POST", `/api/trello/workspaces/${id}/members`, payload),
    removeWorkspaceMember: (id, uid) => req("DELETE", `/api/trello/workspaces/${id}/members/${uid}`),
    listBoards: (workspaceId, starred) =>
      req("GET", `/api/trello/boards?workspace_id=${workspaceId}` + (starred ? "&starred=1" : "")),
    createBoard: (payload) => req("POST", "/api/trello/boards", payload),
    getBoard: (id) => req("GET", `/api/trello/boards/${id}`),
    updateBoard: (id, payload) => req("PATCH", `/api/trello/boards/${id}`, payload),
    createList: (boardId, payload) => req("POST", `/api/trello/boards/${boardId}/lists`, payload),
    updateList: (id, payload) => req("PATCH", `/api/trello/lists/${id}`, payload),
    createCard: (payload) => req("POST", "/api/trello/cards", payload),
    updateCard: (id, payload) => req("PATCH", `/api/trello/cards/${id}`, payload),
    moveCard: (id, payload) => req("POST", `/api/trello/cards/${id}/move`, payload),
    deleteCard: (id) => req("DELETE", `/api/trello/cards/${id}`),
    cardComments: (id) => req("GET", `/api/trello/cards/${id}/activity`),
    addCardComment: (id, body) => req("POST", `/api/trello/cards/${id}/comments`, { body }),
    addCardMember: (id, userId) => req("POST", `/api/trello/cards/${id}/members`, { user_id: userId }),
    removeCardMember: (id, userId) => req("DELETE", `/api/trello/cards/${id}/members/${userId}`),
    addChecklist: (id, title) => req("POST", `/api/trello/cards/${id}/checklists`, { title }),
    updateChecklist: (id, title) => req("PATCH", `/api/trello/checklists/${id}`, { title }),
    addChecklistItem: (id, content) => req("POST", `/api/trello/checklists/${id}/items`, { content }),
    updateChecklistItem: (id, content, checked) =>
      req("PATCH", `/api/trello/checklist-items/${id}`, { content, is_checked: checked }),
    createLabel: (boardId, payload) => req("POST", `/api/trello/boards/${boardId}/labels`, payload),
    attachLabel: (cardId, labelId) => req("POST", `/api/trello/cards/${cardId}/labels`, { label_id: labelId }),
    detachLabel: (cardId, labelId) => req("DELETE", `/api/trello/cards/${cardId}/labels/${labelId}`),

    // Phase 2B — calendar, bulk edits, board activity
    boardCalendar: (boardId, month) =>
      req("GET", `/api/trello/boards/${boardId}/calendar` + (month ? `?month=${month}` : "")),
    bulkCards: (payload) => req("POST", "/api/trello/cards/bulk", payload),
    boardActivity: (boardId) => req("GET", `/api/trello/boards/${boardId}/activity`),

    // Phase 1 — notifications
    notifications: (params) => {
      const q = new URLSearchParams(params).toString();
      return req("GET", "/api/notifications" + (q ? "?" + q : ""));
    },
    markNotifRead: (id) => req("POST", `/api/notifications/${id}/read`),
    markAllNotifRead: () => req("POST", "/api/notifications/read-all"),

    // Phase 1 — password reset
    forgotPassword: (email) => req("POST", "/api/auth/forgot-password", { email }),
    resetPassword: (token, password) => req("POST", "/api/auth/reset-password", { token, password }),

    // Phase 2 — Knowledge Base
    // Phase 2 — Knowledge Base (Obsidian-style vault)
    // Folders
    kbTree:        () => req("GET", "/api/kb/tree"),
    createFolder:  (payload) => req("POST", "/api/kb/folders", payload),
    updateFolder:  (id, payload) => req("PATCH", `/api/kb/folders/${id}`, payload),
    deleteFolder:  (id) => req("DELETE", `/api/kb/folders/${id}`),
    // Notes
    listKbNotes:   (params = {}) => req("GET", "/api/kb/notes?" + new URLSearchParams(params).toString()),
    createKbNote:  (payload) => req("POST", "/api/kb/notes", payload),
    createKb:      (payload) => req("POST", "/api/kb/notes", payload),
    getKbNote:     (id) => req("GET", `/api/kb/notes/${id}`),
    updateKbNote:  (id, payload) => req("PATCH", `/api/kb/notes/${id}`, payload),
    updateKb:       (id, payload) => req("PATCH", `/api/kb/notes/${id}`, payload),
    deleteKbNote:  (id) => req("DELETE", `/api/kb/notes/${id}`),
    publishKbNote: (id) => req("POST", `/api/kb/notes/${id}/publish`),
    publishKb:      (id) => req("POST", `/api/kb/notes/${id}/publish`),
    kbNoteFeedback: (id, helpful, comment) => req("POST", `/api/kb/notes/${id}/feedback`, { helpful, comment }),
    kbNoteVersions: (id) => req("GET", `/api/kb/notes/${id}/versions`),
    kbNoteVersionDiff: (id, vid) => req("GET", `/api/kb/notes/${id}/versions/${vid}/diff`),
    // Graph / tags / analytics
    kbGraph:   () => req("GET", "/api/kb/graph"),
    kbLocalGraph: (id, hops) => req("GET", `/api/kb/graph/local/${id}` + (hops ? `?hops=${hops}` : "")),
    kbTags:    () => req("GET", "/api/kb/tags"),
    kbAnalytics: () => req("GET", "/api/kb/analytics"),
    // Collections
    listKbCollections:     () => req("GET", "/api/kb/collections"),
    createKbCollection:    (payload) => req("POST", "/api/kb/collections", payload),
    listKbCollectionNotes: (cid) => req("GET", `/api/kb/collections/${cid}/notes`),
    addKbCollectionNote:   (cid, payload) => req("POST", `/api/kb/collections/${cid}/notes`, payload),
    removeKbCollectionNote: (cid, nid) => req("DELETE", `/api/kb/collections/${cid}/notes/${nid}`),

    listIssueKnowledge: (iid) => req("GET", `/api/jira/issues/${iid}/knowledge`),
    linkIssueKnowledge: (iid, payload) => req("POST", `/api/jira/issues/${iid}/knowledge`, payload),
    unlinkIssueKnowledge: (iid, aid) => req("DELETE", `/api/jira/issues/${iid}/knowledge/${aid}`),
    suggestIssueKnowledge: (iid) => req("GET", `/api/jira/issues/${iid}/knowledge/suggested`),
    promoteIssueToKb: (iid) => req("POST", `/api/jira/issues/${iid}/promote-kb`),

    // Phase 6 — Global search + cross-entity links
    search: (q, scope = "all", limit = 5) =>
      req("GET", `/api/search?q=${encodeURIComponent(q)}&scope=${scope}&limit=${limit}`),
    listEntityLinks: (params = {}) =>
      req("GET", `/api/entity-links?` + new URLSearchParams(params).toString()),
    createEntityLink: (payload) => req("POST", "/api/entity-links", payload),
    deleteEntityLink: (id) => req("DELETE", `/api/entity-links/${id}`),

    // Phase 4 — Reports & CSAT
    reportsSummary: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/reports/summary" + (q ? "?" + q : "")); },
    reportsWorkload: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/reports/workload" + (q ? "?" + q : "")); },
    reportsSla: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/reports/sla" + (q ? "?" + q : "")); },
    reportsTrend: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/reports/trend" + (q ? "?" + q : "")); },
    reportsKnowledge: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/reports/knowledge" + (q ? "?" + q : "")); },
    actionCenter: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("GET", "/api/dashboard/action-center" + (q ? "?" + q : "")); },
    exportCsv: async (params = {}) => {
      const q = new URLSearchParams(params).toString();
      const token = await API.initCsrf();
      const res = await fetch("/api/reports/export.csv" + (q ? "?" + q : ""), {
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
    rateIssue: (id, score) => req("POST", `/api/jira/issues/${id}/rate`, { score }),

    // Settings — user AI key + model (per-user OpenRouter key)
    getAiSettings: () => req("GET", "/api/settings/ai"),
      saveAiSettings: (data) => req("POST", "/api/settings/ai", data),
      changePassword: (data) => req("POST", "/api/settings/password", data),

    // v2 — AI assistance (draft-only; server returns 503 when disabled)
    aiSuggestReply: (id) => req("GET", `/api/ai/suggest-reply/${id}`),
    aiSummarize: (id) => req("GET", `/api/ai/summarize/${id}`),
    aiSuggestPriority: (id) => req("GET", `/api/ai/suggest-priority/${id}`),

    // Phase 4A — AI Chat Core (conversational assistant)
    // Conversations
    listAiConversations: (params = {}) =>
      req("GET", "/api/ai/conversations?" + new URLSearchParams(params).toString()),
    createAiConversation: (payload = {}) => req("POST", "/api/ai/conversations", payload),
    deleteAiConversation: (id) => req("DELETE", `/api/ai/conversations/${id}`),
    getAiMessages: (id) => req("GET", `/api/ai/conversations/${id}/messages`),
    // Model picker + usage
    aiModels: () => req("GET", "/api/ai/models"),
    aiUsage: () => req("GET", "/api/ai/usage"),
    // Streaming chat. Accepts a payload object: either { message } for a new
    // turn or { resume: true } to continue after tool approvals. Returns the RAW
    // fetch Response so the view can read the SSE stream with a reader. A non-200
    // response (503 no-key, 429 rate-limit) is a normal JSON body — the view
    // checks response.status.
    aiChatStream: async (convId, payload) => {
      const token = await API.initCsrf();
      return fetch("/api/ai/chat/" + convId, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(payload || {}),
      });
    },
    // Tool confirmation (Phase 4B). Record the user's decision for a
    // tool_call message id; the view then resumes the stream.
    aiToolConfirm: (msgId, decision) =>
      req("POST", `/api/ai/tool-confirm/${msgId}`, { decision }),
    // List available AI tools + their parameters (Phase 4B).
    aiTools: () => req("GET", "/api/ai/tools"),

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

    // Phase 5 — Help Center
    helpGuides:     () => req("GET", "/api/help/guides"),
    helpGuide:      (tab) => req("GET", `/api/help/guides/${tab}`),
    helpProgress:   () => req("GET", "/api/help/progress"),
    recordMilestone: (key) => req("POST", "/api/help/progress", { milestone_key: key }),
    helpShortcuts:  () => req("GET", "/api/help/shortcuts"),
    helpTour:       (key) => req("GET", `/api/help/tours/${key}`),
  };
})();
