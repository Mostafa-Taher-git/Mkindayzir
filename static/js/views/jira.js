/* ==========================================================================
   OpsDesk Jira suite views (Phase 1A: projects, sprints, backlog, board,
   issue detail). Loads BEFORE app.js, so shared helpers (OD.h) and API are
   only referenced at call time. Registers on window.OpsDesk.views.

   Routes (see app.js router):
     #/jira/projects      jiraProjects()
     #/jira/backlog/<id>  jiraBacklog()
     #/jira/board/<id>    jiraBoard()
     #/jira/issue/<key>   jiraIssue()
     #/jira/sprints/<id>  jiraSprints()
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
  const priorityPill = (p) => H().priorityPill(p);
  const priorityLabel = (p) => H().priorityLabel(p);
  const slaBadge = (t) => H().slaBadge(t);
  const isAgent = () => H().isAgent();
  const isAdmin = () => H().isAdmin();
  const isStaffRole = (r) => H().isStaffRole(r);
  const nameOf = (id, fb) => H().nameOf(id, fb);
  const teamName = (id) => H().teamName(id);
  const categoryName = (id) => H().categoryName(id);
  const shell = (inner) => H().shell(inner);
  const navigate = (h) => H().navigate(h);
  const openModal = (t, b, s) => H().openModal(t, b, s);
  const closeModal = () => H().closeModal();
  const confirmModal = (m, l, c) => H().confirmModal(m, l, c);

  /* #/jira/<view>/<id> — the router only passes the first segment. */
  const seg = (i) => (location.hash.replace(/^#/, "").split("/").filter(Boolean)[i] || "").trim();

  const ISSUE_TYPES = ["Epic", "Story", "Task", "Bug", "Subtask"];
  const SPRINT_LABEL = { future: "Future", active: "Active", closed: "Closed" };
  const BOARD_COLS = ["new", "assigned", "in_progress", "blocked", "resolved", "closed"];

  async function loadProjects() {
    const data = await API.listProjects();
    return data.projects || [];
  }

  function sprintChip(s) {
    if (!s) return null;
    return el("span", { class: "sprint-chip " + s.status, onclick: () => navigate(`/jira/sprints/${s.project_id || ""}`) },
      esc(s.name), s.velocity != null ? ` · velocity ${s.velocity}` : "");
  }

  function issueTypeChip(t) {
    return el("span", { class: "itype " + (t || "task").toLowerCase() }, t || "Task");
  }

  /* ----------------------------- projects ----------------------------- */
  async function jiraProjects() {
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Projects"),
        el("div", { class: "spacer" }),
        isAdmin() ? el("button", { class: "btn primary sm", onclick: projectModal }, "+ New Project") : null),
      el("div", { id: "proj-list", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    shell(main);
    try {
      const projects = await loadProjects();
      const list = $("#proj-list");
      if (!projects.length) {
        list.replaceChildren(el("div", { class: "empty" }, "No projects yet."));
        return;
      }
      list.replaceChildren(el("div", { class: "proj-grid" },
        ...projects.map(projectCard)));
    } catch (e) { toast(e.message, "error"); }
  }

  function projectCard(p) {
    return el("div", { class: "card proj-card" },
      el("div", { class: "row between" },
        el("span", { class: "proj-key" }, esc(p.key)),
        el("span", { class: "muted" }, esc(p.category || ""))),
      el("h3", { style: "margin:8px 0 2px" }, esc(p.name)),
      el("div", { class: "muted small" }, esc(p.description || "No description")),
      el("div", { class: "row wrap gap mt-3" },
        el("span", { class: "mini-stat" }, String(p.stats.total_issues), " issues"),
        el("span", { class: "mini-stat" }, String(p.stats.open_issues), " open"),
        el("span", { class: "mini-stat" }, String(p.stats.backlog_issues), " backlog")),
      el("div", { class: "row between mt-3" },
        el("span", { class: "muted small" }, "Lead: " + esc(p.lead_name || "—")),
        p.active_sprint ? sprintChip(p.active_sprint) : null),
      el("div", { class: "row mt-4 gap" },
        el("button", { class: "btn ghost sm", onclick: () => navigate(`/jira/backlog/${p.id}`) }, "Backlog"),
        el("button", { class: "btn ghost sm", onclick: () => navigate(`/jira/board/${p.id}`) }, "Board"),
        el("button", { class: "btn ghost sm", onclick: () => navigate(`/jira/sprints/${p.id}`) }, "Sprints")));
  }

  function projectModal() {
    const users = (OD.state.meta ? OD.state.meta.users : []).filter((u) => isStaffRole(u.role));
    const body = el("div", {},
      el("label", { class: "field" },
        el("span", { class: "label" }, "Key"),
        el("input", { id: "p-key", placeholder: "ENG", maxlength: "10", style: "text-transform:uppercase" }),
        el("span", { class: "muted", style: "font-size:12px" }, "2-10 uppercase letters/digits, used in issue keys (ENG-0001).")),
      el("label", { class: "field" },
        el("span", { class: "label" }, "Name"),
        el("input", { id: "p-name", placeholder: "Engineering" })),
      el("label", { class: "field" },
        el("span", { class: "label" }, "Description"),
        el("textarea", { id: "p-desc", rows: 3, placeholder: "What does this project track?" })),
      el("div", { class: "row gap" },
        el("label", { class: "field grow" },
          el("span", { class: "label" }, "Category"),
          el("input", { id: "p-cat", value: "Software" })),
        el("label", { class: "field grow" },
          el("span", { class: "label" }, "Lead"),
          el("select", { id: "p-lead" },
            el("option", { value: "" }, "—"),
            ...users.map((u) => el("option", { value: u.id }, esc(u.name)))))));
    openModal("New Project", body, async () => {
      const key = $("#p-key").value.trim().toUpperCase();
      const name = $("#p-name").value.trim();
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) { toast("Key must be 2-10 uppercase letters/digits starting with a letter", "error"); return false; }
      if (!name) { toast("Name is required", "error"); return false; }
      try {
        await API.createProject({ key, name, description: $("#p-desc").value, category: $("#p-cat").value || "Software", lead_id: $("#p-lead").value || null });
        toast("Project created");
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  /* ----------------------------- shared bits ----------------------------- */
  function issueCard(t) {
    const card = el("div", { class: "jira-card", draggable: "true",
      onclick: () => navigate(`/jira/issue/${t.issue_key}`) },
      el("div", { class: "row between" },
        el("span", { class: "issue-key" }, esc(t.issue_key)),
        t.story_points != null ? el("span", { class: "pts" }, String(t.story_points), " pts") : null),
      el("div", { class: "issue-summary" }, esc(t.summary)),
      el("div", { class: "row between mt-2" },
        priorityPill(t.priority),
        el("span", { class: "muted small" }, t.assignee_name ? "👤 " + esc(t.assignee_name) : "Unassigned")));
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(t.id));
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    return card;
  }

  function dropZone(node, onDrop) {
    node.addEventListener("dragover", (e) => { e.preventDefault(); node.classList.add("drop-hover"); });
    node.addEventListener("dragleave", () => node.classList.remove("drop-hover"));
    node.addEventListener("drop", (e) => {
      e.preventDefault();
      node.classList.remove("drop-hover");
      const iid = e.dataTransfer.getData("text/plain");
      if (iid) onDrop(iid);
    });
  }

  async function moveToSprint(iid, sprintId) {
    try {
      await API.updateIssue(iid, { sprint_id: sprintId });
      toast("Moved to " + (sprintId ? "sprint" : "backlog"));
    } catch (e) { toast(e.message, "error"); }
  }

  async function firstProjectId() {
    const projects = await loadProjects();
    return projects.length ? projects[0].id : null;
  }

  /* ----------------------------- backlog ----------------------------- */
  async function jiraBacklog() {
    let pid = seg(2);
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Backlog"),
        el("div", { class: "spacer" }),
        isAgent() ? el("button", { class: "btn primary sm", onclick: () => createIssueModal(pid) }, "+ New Issue") : null),
      el("div", { id: "backlog-body", class: "mt-2" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    shell(main);
    try {
      if (!pid) pid = await firstProjectId();
      if (!pid) {
        $("#backlog-body").replaceChildren(el("div", { class: "empty" }, "No projects yet — an admin must create one first."));
        return;
      }
      await renderBacklog(pid);
    } catch (e) { toast(e.message, "error"); }
  }

  async function renderBacklog(pid) {
    const body = $("#backlog-body");
    const [projects, sprints, issues] = await Promise.all([
      loadProjects(), API.listSprints(pid),
      API.listIssues({ project_id: pid, per_page: "100" })]);
    const project = projects.find((p) => String(p.id) === String(pid));
    const open = (issues.issues || []).filter((i) => i.status !== "closed");
    const backlogItems = open.filter((i) => !i.sprint_id);
    const bySprint = {};
    open.forEach((i) => { if (i.sprint_id) (bySprint[i.sprint_id] = bySprint[i.sprint_id] || []).push(i); });

    const backlogZone = el("div", { class: "sprint-bucket backlog" },
      el("div", { class: "bucket-head" },
        el("b", {}, "Backlog"),
        el("span", { class: "muted" }, String(backlogItems.length), " issues"),
        el("div", { class: "spacer" }),
        el("span", { class: "muted small" }, "drag cards into a sprint below")),
      el("div", { class: "bucket-body" },
        backlogItems.length ? backlogItems.map(issueCard)
          : el("div", { class: "empty small" }, "Backlog is empty — everything is planned.")));
    dropZone(backlogZone, (iid) => moveToSprint(iid, null).then(() => renderBacklog(pid)));

    const buckets = (sprints.sprints || []).filter((s) => s.status !== "closed")
      .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1))
      .map((s) => {
        const items = bySprint[s.id] || [];
        const zone = el("div", { class: "sprint-bucket " + s.status },
          el("div", { class: "bucket-head" },
            el("b", {}, esc(s.name)),
            s.status === "active" ? el("span", { class: "sprint-chip active" }, "Active") : null,
            el("span", { class: "muted" }, String(items.length), " · ", String(s.stats.points), " pts"),
            el("div", { class: "spacer" }),
            el("span", { class: "muted small" }, s.goal ? esc(s.goal) : "")),
          el("div", { class: "bucket-body" },
            items.length ? items.map(issueCard)
              : el("div", { class: "empty small" }, "No issues in this sprint yet.")));
        dropZone(zone, (iid) => moveToSprint(iid, s.id).then(() => renderBacklog(pid)));
        return zone;
      });

    const closed = (sprints.sprints || []).filter((s) => s.status === "closed");
    const closedRow = el("div", { class: "row wrap gap mt-4" },
      el("span", { class: "muted" }, "Closed:"),
      ...closed.map((s) => el("span", { class: "sprint-chip closed", title: "Closed sprint" }, esc(s.name), s.velocity != null ? ` · v${s.velocity}` : "")));

    body.replaceChildren(
      el("div", { class: "row between" },
        el("div", { class: "row gap" },
          el("select", { class: "proj-switch", onchange: (e) => navigate(`/jira/backlog/${e.target.value}`) },
            ...projects.map((p) => el("option", { value: p.id, selected: String(p.id) === String(pid) ? "" : undefined }, esc(p.name)))),
          projectTabs(pid, "backlog")),
        el("div", { class: "muted small" }, "Total ", String(open.length), " open issues")),
      backlogZone,
      el("h3", { class: "h3 mt-5" }, "Sprints"),
      ...buckets,
      closedRow);
  }

  function projectTabs(pid, active) {
    return el("div", { class: "row gap" },
      ...["backlog", "board", "sprints"].map((k) => el("button", {
        class: "btn ghost sm" + (active === k ? " outline" : ""),
        onclick: () => navigate(`/jira/${k}/${pid}`),
      }, { backlog: "Backlog", board: "Board", sprints: "Sprints" }[k])));
  }

  function createIssueModal(pid) {
    const sprintsSel = el("select", { id: "i-sprint" },
      el("option", { value: "" }, "Backlog (no sprint)"));
    API.listSprints(pid).then((d) => {
      (d.sprints || []).forEach((s) => {
        const o = el("option", { value: s.id }, esc(s.name) + " (" + s.status + ")");
        sprintsSel.appendChild(o);
      });
    }).catch(() => {});
    const body = el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Summary"), el("input", { id: "i-summary", placeholder: "What needs doing?" })),
      el("label", { class: "field" }, el("span", { class: "label" }, "Description"), el("textarea", { id: "i-desc", rows: 3 })),
      el("div", { class: "row gap" },
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Type"),
          el("select", { id: "i-type" }, ...ISSUE_TYPES.map((t) => el("option", { value: t }, t)))),
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Story points"),
          el("input", { id: "i-pts", type: "number", min: "0", max: "999", placeholder: "—" }))),
      el("label", { class: "field" }, el("span", { class: "label" }, "Sprint"), sprintsSel));
    openModal("New Issue", body, async () => {
      const summary = $("#i-summary").value.trim();
      if (!summary) { toast("Summary is required", "error"); return false; }
      try {
        const pts = $("#i-pts").value;
        const payload = { subject: summary, description: $("#i-desc").value, issue_type: $("#i-type").value, project_id: pid };
        if (pts !== "") payload.story_points = Number(pts);
        if ($("#i-sprint").value) payload.sprint_id = Number($("#i-sprint").value);
        const { issue } = await API.createIssue(payload);
        toast("Created " + issue.issue_key);
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  /* ----------------------------- board ----------------------------- */
  async function jiraBoard() {
    let pid = seg(2);
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Board"),
        el("div", { class: "spacer" }),
        el("span", { class: "muted small" }, "drag cards between columns to change status")),
      el("div", { id: "board-body", class: "mt-2" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    shell(main);
    try {
      if (!pid) pid = await firstProjectId();
      if (!pid) { $("#board-body").replaceChildren(el("div", { class: "empty" }, "No projects yet.")); return; }
      await renderBoard(pid);
    } catch (e) { toast(e.message, "error"); }
  }

  async function renderBoard(pid) {
    const body = $("#board-body");
    const [projects, issues] = await Promise.all([
      loadProjects(), API.listIssues({ project_id: pid, per_page: "100" })]);
    const cols = {};
    BOARD_COLS.forEach((s) => { cols[s] = []; });
    (issues.issues || []).forEach((i) => { (cols[i.status] = cols[i.status] || []).push(i); });

    const setStatusFromDrop = async (iid, status) => {
      const issue = (issues.issues || []).find((i) => i.id === Number(iid));
      if (!issue) return;
      if (status === "blocked") {
        openModal("Block issue", el("div", {},
          el("p", { class: "muted", style: "margin-bottom:8px" }, "Blocking " + esc(issue.issue_key)),
          el("label", { class: "field" }, el("span", { class: "label" }, "Reason"),
            el("textarea", { id: "block-reason", rows: 3, placeholder: "Why is this blocked?" }))),
          async () => {
            const note = $("#block-reason").value.trim();
            if (!note) { toast("A reason is required to block an issue", "error"); return false; }
            try { await API.setStatus(issue.id, { status, note }); toast("Blocked " + issue.issue_key); renderBoard(pid); return true; }
            catch (e) { toast(e.message, "error"); return false; }
          });
        return;
      }
      try {
        await API.setStatus(issue.id, { status });
        toast("Moved " + issue.issue_key + " → " + (H().STATUS_LABELS[status] || status));
      } catch (e) { toast(e.message, "error"); }
    };

    body.replaceChildren(
      el("div", { class: "row between" },
        el("select", { class: "proj-switch", onchange: (e) => navigate(`/jira/board/${e.target.value}`) },
          ...projects.map((p) => el("option", { value: p.id, selected: String(p.id) === String(pid) ? "" : undefined }, esc(p.name)))),
        projectTabs(pid, "board")),
      el("div", { class: "kanban" },
        ...BOARD_COLS.map((s) => {
          const items = cols[s] || [];
          const pts = items.reduce((a, i) => a + (i.story_points || 0), 0);
          const col = el("div", { class: "kanban-col " + s },
            el("div", { class: "col-head" },
              statusBadge(s), el("span", { class: "muted" }, String(items.length), " · ", String(pts), " pts")),
            el("div", { class: "col-body" },
              items.length ? items.map(issueCard)
                : el("div", { class: "empty small" }, "—")));
          dropZone(col, (iid) => setStatusFromDrop(iid, s).then(() => renderBoard(pid)));
          return col;
        })));
  }

  /* ----------------------------- goals / OKRs ----------------------------- */
  const GOAL_STATUS_LABEL = { on_track: "On track", at_risk: "At risk", behind: "Behind", achieved: "Achieved" };
  const GOAL_STATUS_COLOR = { on_track: "var(--ok)", at_risk: "var(--warn)", behind: "var(--danger)", achieved: "var(--primary)" };

  async function jiraGoals() {
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Goals & OKRs"),
        el("div", { class: "spacer" }),
        (isAdmin() || H().isManager()) ? el("button", { class: "btn primary sm", onclick: goalModal }, "+ New Goal") : null),
      el("div", { id: "goals-body", class: "mt-4" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    shell(main);
    try {
      const data = await API.listGoals();
      const body = $("#goals-body");
      const goals = data.goals || [];
      if (!goals.length) {
        body.replaceChildren(el("div", { class: "empty" }, "No goals yet — create the first OKR."));
        return;
      }
      const canManage = () => isAdmin();
      body.replaceChildren(el("div", { class: "goals-grid" },
        ...goals.map((g) => goalCard(g, canManage()))));
    } catch (e) { toast(e.message, "error"); }
  }

  function goalCard(g, canManage) {
    const issuesWrap = el("div", { class: "goal-issues", style: "display:none" },
      el("span", { class: "spinner" }));
    const card = el("div", { class: "card goal-card" },
      el("div", { class: "row between" },
        el("span", { class: "goal-status", style: "color:" + (GOAL_STATUS_COLOR[g.status] || "var(--text)") },
          GOAL_STATUS_LABEL[g.status] || g.status),
        el("span", { class: "muted small" }, g.quarter ? "Q " + g.quarter : "", g.quarter ? " · " : "", String(g.progress), "%")),
      el("h3", { class: "h3", style: "margin:6px 0 2px" }, esc(g.title)),
      g.description ? el("div", { class: "muted small" }, esc(g.description)) : null,
      el("div", { class: "progress-track mt-3" },
        el("div", { class: "progress-fill", style: "width:" + g.progress + "%;" + (g.progress >= 100 ? "background:var(--ok)" : "") })),
      el("div", { class: "row wrap gap mt-3 muted small" },
        el("span", {}, String(g.issue_count), " issues · ", String(g.done_points), "/", String(g.total_points), " pts"),
        g.owner_name ? el("span", {}, "Owner: ", esc(g.owner_name)) : null,
        g.target_date ? el("span", {}, "Due ", esc(g.target_date)) : null),
      el("div", { class: "row mt-4" },
        el("button", { class: "btn ghost sm", onclick: async () => {
          const wrap = issuesWrap;
          if (wrap.style.display === "none") {
            wrap.style.display = "";
            try {
              const d = await API.goalProgress(g.id);
              wrap.replaceChildren(
                (d.issues || []).length ? (d.issues || []).map((i) => el("div", { class: "row between goal-issue" },
                  el("a", { class: "link", href: "#/jira/issue/" + i.issue_key }, esc(i.issue_key), " — ", esc(i.summary)),
                  el("span", { class: "muted small" }, statusBadge(i.status), i.story_points != null ? " " + String(i.story_points) + " pts" : "")))
                  : el("div", { class: "muted small" }, "No linked issues yet."));
            } catch (e) { wrap.replaceChildren(el("div", { class: "muted small" }, e.message)); }
          } else { wrap.style.display = "none"; }
        } }, "Linked issues"),
        el("div", { class: "spacer" }),
        canManage ? el("button", { class: "btn ghost sm", onclick: () => goalModal(g) }, "Edit") : null));
      card.appendChild(issuesWrap);
    return card;
  }

  function goalModal(g) {
    const edit = !!g;
    const body = el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Title"),
        el("input", { id: "g-title", value: edit ? g.title : "" })),
      el("label", { class: "field" }, el("span", { class: "label" }, "Description"),
        el("textarea", { id: "g-desc", rows: 3 }, edit ? (g.description || "") : "")),
      el("div", { class: "row gap" },
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Quarter"),
          el("input", { id: "g-quarter", placeholder: "2026-Q3", value: edit ? (g.quarter || "") : "" })),
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Target date"),
          el("input", { id: "g-target", type: "date", value: edit ? (g.target_date || "") : "" }))),
      el("div", { class: "row gap" },
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Status"),
          el("select", { id: "g-status" },
            ...Object.keys(GOAL_STATUS_LABEL).map((s) => el("option", { value: s, selected: edit && g.status === s ? "" : undefined }, GOAL_STATUS_LABEL[s])))),
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Owner"),
          el("select", { id: "g-owner" },
            el("option", { value: "" }, "Unassigned"),
            ...(OD.state.meta ? OD.state.meta.users : []).filter((u) => isStaffRole(u.role))
              .map((u) => el("option", { value: u.id, selected: edit && String(g.owner_id) === String(u.id) ? "" : undefined }, esc(u.name)))))));
    openModal(edit ? "Edit Goal" : "New Goal", body, async () => {
      const title = $("#g-title").value.trim();
      if (!title) { toast("Title is required", "error"); return false; }
      try {
        const payload = { title, description: $("#g-desc").value, quarter: $("#g-quarter").value || null, target_date: $("#g-target").value || null, status: $("#g-status").value, owner_id: $("#g-owner").value ? Number($("#g-owner").value) : null };
        if (edit) await API.updateGoal(g.id, payload);
        else await API.createGoal(payload);
        toast(edit ? "Goal updated" : "Goal created");
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  /* ----------------------------- issue detail ----------------------------- */
  async function jiraIssue() {
    const key = seg(2);  // #/jira/issue/<id-or-key> — the router param is the view name
    const main = el("div", {},
      el("div", { id: "issue-body", class: "mt-2" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    shell(main);
    try {
      const { issue } = await API.getIssue(key);
      const i = issue;
      const allowed = i.allowed_transitions || [];
      const staff = isAgent();

      const editModal = () => {
        const sprintsSel = el("select", { id: "e-sprint" }, el("option", { value: "" }, "Backlog (no sprint)"));
        API.listSprints(i.project_id).then((d) => {
          (d.sprints || []).forEach((s) => {
            const o = el("option", { value: s.id, selected: String(s.id) === String(i.sprint_id) ? "" : undefined }, esc(s.name));
            sprintsSel.appendChild(o);
          });
        }).catch(() => {});
        const goalsSel = el("select", { id: "e-goal" }, el("option", { value: "" }, "No goal"));
        API.listGoals().then((d) => {
          (d.goals || []).forEach((g) => {
            const o = el("option", { value: g.id, selected: String(g.id) === String(i.goal_id) ? "" : undefined }, esc(g.title), " (", String(g.progress), "%)");
            goalsSel.appendChild(o);
          });
        }).catch(() => {});
        const body = el("div", {},
          el("label", { class: "field" }, el("span", { class: "label" }, "Summary"), el("input", { id: "e-summary", value: i.summary })),
          el("label", { class: "field" }, el("span", { class: "label" }, "Description"), el("textarea", { id: "e-desc", rows: 4 }, i.description || "")),
          el("div", { class: "row gap" },
            el("label", { class: "field grow" }, el("span", { class: "label" }, "Type"),
              el("select", { id: "e-type" }, ...ISSUE_TYPES.map((t) => el("option", { value: t, selected: t === i.issue_type ? "" : undefined }, t)))),
            el("label", { class: "field grow" }, el("span", { class: "label" }, "Story points"),
              el("input", { id: "e-pts", type: "number", min: "0", max: "999", value: i.story_points != null ? String(i.story_points) : "" })),
            el("label", { class: "field grow" }, el("span", { class: "label" }, "Due date"),
              el("input", { id: "e-due", type: "date", value: i.due_date || "" }))),
          el("div", { class: "row gap" },
            el("label", { class: "field grow" }, el("span", { class: "label" }, "Sprint"), sprintsSel),
            el("label", { class: "field grow" }, el("span", { class: "label" }, "Goal"), goalsSel)));
        openModal("Edit " + i.issue_key, body, async () => {
          const summary = $("#e-summary").value.trim();
          if (!summary) { toast("Summary is required", "error"); return false; }
          try {
            const pts = $("#e-pts").value;
            const payload = { summary, description: $("#e-desc").value, issue_type: $("#e-type").value, due_date: $("#e-due").value || null };
            if (pts !== "") payload.story_points = Number(pts); else payload.story_points = null;
            payload.sprint_id = $("#e-sprint").value ? Number($("#e-sprint").value) : null;
            payload.goal_id = $("#e-goal").value ? Number($("#e-goal").value) : null;
            await API.updateIssue(i.id, payload);
            toast("Updated " + i.issue_key);
            return true;
          } catch (e) { toast(e.message, "error"); return false; }
        });
      };

      const statusBtns = el("div", { class: "row wrap gap" },
        ...allowed.map((s) => el("button", {
          class: "btn ghost sm",
          onclick: async () => {
            if (s === "blocked") { setStatusFromIssue(i, s); return; }
            try { await API.setStatus(i.id, { status: s }); toast("Moved to " + (H().STATUS_LABELS[s] || s)); jiraIssue(i.issue_key); }
            catch (e) { toast(e.message, "error"); }
          },
        }, "→ " + (H().STATUS_LABELS[s] || s))));

      const setStatusFromIssue = (issue, status) => {
        openModal("Block issue", el("div", {},
          el("label", { class: "field" }, el("span", { class: "label" }, "Reason"),
            el("textarea", { id: "block-reason", rows: 3, placeholder: "Why is this blocked?" }))),
          async () => {
            const note = $("#block-reason").value.trim();
            if (!note) { toast("A reason is required", "error"); return false; }
            try { await API.setStatus(issue.id, { status, note }); toast("Issue blocked"); jiraIssue(issue.issue_key); return true; }
            catch (e) { toast(e.message, "error"); return false; }
          });
      };

      const customFieldsSec = (issue) => {
        const fields = issue.custom_fields || [];
        if (!fields.length) return null;
        const list = el("div", {},
          ...fields.map((f) => el("div", { class: "row between cf-row" },
            el("span", { class: "muted small" }, esc(f.name), f.required ? " *" : ""),
            el("span", {}, f.value != null && f.value !== "" ? String(f.value) : "—"))));
        return el("div", { class: "side-sec" },
          el("div", { class: "row between" },
            el("div", { class: "side-label" }, "Custom fields"),
            staff ? el("button", { class: "btn ghost sm", onclick: () => customFieldsModal(issue, fields) }, "Edit") : null),
          list);
      };

      const customFieldsModal = (issue, fields) => {
        const body = el("div", {},
          ...fields.map((f) => {
            const input = f.field_type === "select"
              ? el("select", { id: "cf-" + f.id }, el("option", { value: "" }, "—"), ...(f.options || []).map((o) => el("option", { value: o, selected: String(f.value) === o ? "" : undefined }, o)))
              : f.field_type === "date"
                ? el("input", { id: "cf-" + f.id, type: "date", value: f.value || "" })
                : f.field_type === "user"
                  ? el("select", { id: "cf-" + f.id }, el("option", { value: "" }, "—"),
                      ...(OD.state.meta ? OD.state.meta.users : []).filter((u) => isStaffRole(u.role))
                        .map((u) => el("option", { value: u.id, selected: String(f.value) === String(u.id) ? "" : undefined }, esc(u.name))))
                  : el("input", { id: "cf-" + f.id, type: f.field_type === "number" ? "number" : "text", value: f.value != null ? String(f.value) : "" });
            return el("label", { class: "field" }, el("span", { class: "label" }, esc(f.name), f.required ? " *" : ""), input);
          }));
        openModal("Custom fields", body, async () => {
          try {
            const cf = {};
            fields.forEach((f) => {
              const v = $("#cf-" + f.id).value;
              cf[f.id] = v === "" ? null : (f.field_type === "number" ? Number(v) : f.field_type === "user" ? Number(v) : v);
            });
            await API.updateIssue(issue.id, { custom_fields: cf });
            toast("Custom fields saved");
            return true;
          } catch (e) { toast(e.message, "error"); return false; }
        });
      };

      const assigneeSel = el("select", {
        onchange: async (e) => {
          const v = e.target.value;
          try {
            if (v === "") await API.assignIssue(i.id, { unassign: true });
            else await API.assignIssue(i.id, { assignee_id: Number(v) });
            toast("Assignee updated");
            jiraIssue(i.issue_key);
          } catch (err) { toast(err.message, "error"); }
        },
      }, el("option", { value: "" }, "Unassigned"),
        ...(OD.state.meta ? OD.state.meta.users : []).filter((u) => isStaffRole(u.role))
          .map((u) => el("option", { value: u.id, selected: String(u.id) === String(i.assignee_id) ? "" : undefined }, esc(u.name))));

      const prioSel = el("select", {
        onchange: async (e) => {
          try { await API.setPriority(i.id, e.target.value); toast("Priority updated"); jiraIssue(i.issue_key); }
          catch (err) { toast(err.message, "error"); }
        },
      }, ...["low", "normal", "high", "urgent"].map((p) => el("option", { value: p, selected: p === i.priority ? "" : undefined }, priorityLabel(p))));

      const followBtn = el("button", { class: "btn ghost sm", id: "follow-btn" }, "…");
      API.listFollowers(i.id).then((d) => {
        const me = OD.state.user ? OD.state.user.id : null;
        const following = (d.followers || []).some((f) => f.user_id === me);
        $("#follow-btn").textContent = following ? "Unfollow" : "Follow";
        $("#follow-btn").onclick = async () => {
          try {
            if (following) await API.unfollowIssue(i.id); else await API.followIssue(i.id);
            toast(following ? "Unfollowed" : "Following");
            jiraIssue(i.issue_key);
          } catch (e) { toast(e.message, "error"); }
        };
      }).catch(() => {});

      const sidebar = el("div", { class: "issue-side" },
        el("div", { class: "side-sec" },
          el("div", { class: "side-label" }, "Status"), statusBadge(i.status),
          staff && allowed.length ? statusBtns : null),
        staff ? el("div", { class: "side-sec" },
          el("div", { class: "side-label" }, "Assignee"), assigneeSel,
          el("div", { class: "side-label mt-3" }, "Priority"), prioSel) : null,
        el("div", { class: "side-sec" },
          el("div", { class: "side-label" }, "Details"),
          metaRow("Reporter", nameOf(i.requester_id)),
          metaRow("Team", teamName(i.team_id)),
          metaRow("Category", categoryName(i.category_id)),
          metaRow("Type", issueTypeChip(i.issue_type)),
          metaRow("Points", i.story_points != null ? String(i.story_points) : "—"),
          metaRow("Due", i.due_date || "—"),
          metaRow("Created", fmtDate(i.created_at)),
          metaRow("Updated", fmtDate(i.updated_at)),
          i.resolved_at ? metaRow("Resolved", fmtDate(i.resolved_at)) : null,
          i.closed_at ? metaRow("Closed", fmtDate(i.closed_at)) : null,
          metaRow("Sprint", i.sprint_name ? sprintChip({ name: i.sprint_name, status: i.sprint_status }) : "Backlog"),
          metaRow("Goal", i.goal_title ? el("a", { class: "link", href: "#/jira/goals" }, esc(i.goal_title)) : "—")),
        slaBadge(i) ? el("div", { class: "side-sec" }, el("div", { class: "side-label" }, "SLA"), slaBadge(i)) : null,
        customFieldsSec(i),
        el("div", { class: "side-sec" }, followBtn),
        el("div", { class: "side-sec" }, OD.renderEntityLinks ? OD.renderEntityLinks("jira_issue", i.id) : null));

      const comments = el("div", { class: "issue-comments" },
        el("h3", { class: "h3" }, "Conversation"),
        (i.comments || []).length ? (i.comments || []).map((c) => el("div", { class: "comment" },
          el("div", { class: "row between" },
            el("b", {}, esc(c.author_name || "Unknown")),
            c.visibility === "internal" ? el("span", { class: "badge internal" }, "internal") : null),
          el("div", { class: "muted small" }, fmtDate(c.created_at)),
          el("p", { class: "mt-2", style: "white-space:pre-wrap" }, esc(c.body))))
          : el("div", { class: "empty small" }, "No comments yet."),
        el("label", { class: "field mt-4" },
          el("span", { class: "label" }, "Add a comment"),
          el("textarea", { id: "new-comment", rows: 3, placeholder: "Reply… (internal notes are only visible to staff)" })),
        el("div", { class: "row mt-2" },
          el("div", { class: "spacer" }),
          el("button", { class: "btn primary sm", onclick: async () => {
            const text = $("#new-comment").value.trim();
            if (!text) return;
            try {
              await API.comment(i.id, { body: text, visibility: isStaffRole(OD.state.user.role) ? "internal" : "public" });
              toast("Comment added");
              jiraIssue(i.issue_key);
            } catch (e) { toast(e.message, "error"); }
          } }, "Comment")));

      const activity = el("div", { class: "issue-activity" },
        el("h3", { class: "h3" }, "Activity"),
        (i.activity || []).length ? el("ul", { class: "timeline" },
          ...(i.activity || []).slice().reverse().map((a) => el("li", {},
            el("span", { class: "ic" }, "•"),
            el("div", {},
              el("b", {}, esc(a.action)),
              a.detail && a.detail.note ? el("div", { class: "muted" }, esc(a.detail.note)) : null,
              el("div", { class: "muted small" }, fmtDate(a.created_at))))))
          : el("div", { class: "empty small" }, "No activity yet."));

      const body = $("#issue-body");
      body.replaceChildren(
        el("div", { class: "row between" },
          el("a", { href: "#/jira/backlog/" + (i.project_id || ""), class: "muted small", onclick: (e) => { e.preventDefault(); navigate("/jira/backlog/" + i.project_id); } }, "← Backlog"),
          el("div", { class: "row gap" },
            staff ? el("button", { class: "btn ghost sm", onclick: editModal }, "Edit") : null)),
        el("div", { class: "issue-head" },
          el("div", { class: "row wrap gap" },
            el("h2", { class: "h2", style: "margin:0" }, esc(i.issue_key)),
            issueTypeChip(i.issue_type),
            statusBadge(i.status),
            priorityPill(i.priority),
            i.sprint_name ? sprintChip({ name: i.sprint_name, status: i.sprint_status, project_id: i.project_id }) : null),
          el("h3", { class: "mt-2" }, esc(i.summary))),
        el("div", { class: "issue-layout" },
          el("div", { class: "issue-main" },
            el("div", { class: "card" },
              el("h3", { class: "h3" }, "Description"),
              el("p", { class: "mt-2", style: "white-space:pre-wrap" }, esc(i.description || "No description."))),
            comments, activity),
          sidebar));
    } catch (e) { toast(e.message, "error"); }
  }

  function metaRow(label, value) {
    return el("div", { class: "row between meta-row" },
      el("span", { class: "muted small" }, label),
      el("span", { class: "small", style: "text-align:right" }, value));
  }

  /* ----------------------------- sprints ----------------------------- */
  async function jiraSprints() {
    let pid = seg(2);
    const main = el("div", {},
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Sprints"),
        el("div", { class: "spacer" }),
        (OD.state.user && ["manager", "admin"].includes(OD.state.user.role))
          ? el("button", { class: "btn primary sm", onclick: () => sprintModal(pid) }, "+ New Sprint") : null),
      el("div", { id: "sprint-body", class: "mt-2" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    shell(main);
    try {
      if (!pid) pid = await firstProjectId();
      if (!pid) { $("#sprint-body").replaceChildren(el("div", { class: "empty" }, "No projects yet.")); return; }
      await renderSprints(pid);
    } catch (e) { toast(e.message, "error"); }
  }

  async function renderSprints(pid) {
    const body = $("#sprint-body");
    const [projects, data] = await Promise.all([loadProjects(), API.listSprints(pid)]);
    const sprints = data.sprints || [];
    const canManage = OD.state.user && ["manager", "admin"].includes(OD.state.user.role);

    body.replaceChildren(
      el("div", { class: "row between" },
        el("select", { class: "proj-switch", onchange: (e) => navigate(`/jira/sprints/${e.target.value}`) },
          ...projects.map((p) => el("option", { value: p.id, selected: String(p.id) === String(pid) ? "" : undefined }, esc(p.name)))),
        projectTabs(pid, "sprints")),
      el("div", { class: "sprint-list" },
        ...sprints.map((s) => el("div", { class: "card sprint-row" },
          el("div", { class: "row between" },
            el("div", {},
              el("div", { class: "row gap" },
                el("b", {}, esc(s.name)),
                el("span", { class: "sprint-chip " + s.status }, SPRINT_LABEL[s.status] || s.status),
                s.velocity != null ? el("span", { class: "pts" }, "velocity ", String(s.velocity)) : null),
              s.goal ? el("div", { class: "muted small mt-1" }, esc(s.goal)) : null,
              el("div", { class: "muted small mt-1" },
                s.start_date ? "Started " + fmtDate(s.start_date) : "Not started yet",
                s.end_date ? " · ended " + fmtDate(s.end_date) : "")),
            el("div", { class: "row gap" },
              el("span", { class: "mini-stat" }, String(s.stats.issue_count), " issues"),
              el("span", { class: "mini-stat" }, String(s.stats.completed_issues), " done"),
              el("span", { class: "mini-stat" }, String(s.stats.points), " pts")),
            el("div", { class: "row gap" },
              el("button", { class: "btn ghost sm", onclick: () => navigate(`/jira/backlog/${pid}`) }, "Open"),
              canManage && s.status === "future" ? el("button", { class: "btn ghost sm", onclick: async () => {
                try { await API.startSprint(s.id); toast("Sprint started"); renderSprints(pid); }
                catch (e) { toast(e.message, "error"); }
              } }, "Start") : null,
              canManage && s.status !== "closed" ? el("button", { class: "btn ghost sm", onclick: async () => {
                if (!(await confirmModal("Complete “" + s.name + "”? Incomplete issues move back to the backlog.", "Complete"))) return;
                try { await API.completeSprint(s.id); toast("Sprint completed"); renderSprints(pid); }
                catch (e) { toast(e.message, "error"); }
              } }, "Complete") : null))))),
      sprints.length ? null : el("div", { class: "empty" }, "No sprints yet — create the first one."));
  }

  function sprintModal(pid) {
    const body = el("div", {},
      el("label", { class: "field" }, el("span", { class: "label" }, "Name"), el("input", { id: "s-name", placeholder: "Sprint 12" })),
      el("label", { class: "field" }, el("span", { class: "label" }, "Goal"), el("input", { id: "s-goal", placeholder: "e.g. Stabilize checkout flow" })),
      el("div", { class: "row gap" },
        el("label", { class: "field grow" }, el("span", { class: "label" }, "Start date"), el("input", { id: "s-start", type: "date" })),
        el("label", { class: "field grow" }, el("span", { class: "label" }, "End date"), el("input", { id: "s-end", type: "date" }))));
    openModal("New Sprint", body, async () => {
      const name = $("#s-name").value.trim();
      if (!name) { toast("Name is required", "error"); return false; }
      try {
        await API.createSprint({ project_id: pid, name, goal: $("#s-goal").value, start_date: $("#s-start").value || null, end_date: $("#s-end").value || null });
        toast("Sprint created");
        return true;
      } catch (e) { toast(e.message, "error"); return false; }
    });
  }

  views.jiraProjects = jiraProjects;
  views.jiraBacklog = jiraBacklog;
  views.jiraBoard = jiraBoard;
  views.jiraIssue = jiraIssue;
  views.jiraSprints = jiraSprints;
  views.jiraGoals = jiraGoals;
})();