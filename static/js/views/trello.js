/* ==========================================================================
   OpsDesk Trello suite views (Phase 2A: workspaces, boards, lists, cards,
   drag-and-drop board, card modal with members/labels/checklists/comments).
   Loads BEFORE app.js; shared helpers (OD.h) referenced at call time.

   Routes (see app.js router):
     #/trello             trelloHome()   — workspace switcher + board grid
     #/trello/starred     trelloHome(true)
     #/trello/board/<id>  trelloBoard()  — DnD board view
   ========================================================================== */
(() => {
  "use strict";

  window.OpsDesk = window.OpsDesk || {};
  const OD = window.OpsDesk;
  OD.views = OD.views || {};
  const views = OD.views;

  const H = () => OD.h;
  const $ = (s, r) => H().$(s, r);
  const el = (t, a, ...c) => H().el(t, a, ...c);
  const esc = (s) => H().esc(s);
  const toast = (m, k) => H().toast(m, k);
  const fmtDate = (i) => H().fmtDate(i);
  const ago = (i) => H().ago(i);
  const shell = (inner) => H().shell(inner);
  const navigate = (h) => H().navigate(h);
  const openModal = (t, b, s) => H().openModal(t, b, s);
  const closeModal = () => H().closeModal();
  const confirmModal = (m, l, c) => H().confirmModal(m, l, c);

  const seg = (i) => (location.hash.replace(/^#/, "").split("/").filter(Boolean)[i] || "").trim();

  const ROLE_LABEL = { admin: "Admin", member: "Member", viewer: "Viewer" };
  const LABEL_COLORS = ["#EB5A46", "#FF9F1A", "#F2D600", "#61BD4F", "#00C2E0", "#0079BF", "#C377E0", "#838C91"];

  let boardState = null; // cached board detail for the current board view
  let boardTab = "board"; // board | calendar | table
  let selectedCardId = null; // last selected card on the board
  let _boardMoveHandler = null;

  /* ----------------------------- helpers ----------------------------- */
  function labelColor(color) {
    return LABEL_COLORS.includes(color) ? color : "#838C91";
  }

  function checklistProgress(cl) {
    if (!cl.total) return null;
    return el("span", { class: "cl-progress" },
      el("span", { class: "cl-bar", style: `width:${Math.round((cl.done / cl.total) * 100)}%` }),
      `${cl.done}/${cl.total}`);
  }

  function cardTile(card, onOpen) {
    const chip = (t, k, cl) => el("span", { class: "chip " + (cl || "") }, t, k ? " " + k : "");
    const badges = [];
    if (card.due_date) badges.push(chip("📅", card.due_date.slice(5, 10), "due"));
    if (card.is_complete) badges.push(chip("✅", null, "done"));
    if (card.card_members && card.card_members.length) badges.push(chip("👤", card.card_members.length));
    if (card.checklists && card.checklists.length)
      badges.push(chip("☑️", `${card.checklists.reduce((s, c) => s + c.done, 0)}/${card.checklists.reduce((s, c) => s + c.total, 0)}`));
    return el("article", {
      class: "trello-card" + (card.cover_color ? " has-cover" : ""),
      draggable: "true",
      "data-card": card.id,
      onclick: () => onOpen(card),
    },
      card.cover_color ? el("div", { class: "cover", style: `background:${card.cover_color}` }) : null,
      el("div", { class: "card-labels" },
        ...(card.labels || []).map((l) => el("span", { class: "tlabel", style: `background:${labelColor(l.color)}`, title: l.name }))),
      el("h4", {}, esc(card.title)),
      card.description ? el("p", { class: "desc" }, esc(card.description.slice(0, 120))) : null,
      badges.length ? el("div", { class: "card-badges" }, ...badges) : null);
  }

  function setDrag() {
    document.querySelectorAll(".trello-card").forEach((node) => {
      node.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", node.dataset.card);
        e.dataTransfer.effectAllowed = "move";
        node.classList.add("dragging");
      });
      node.addEventListener("dragend", () => node.classList.remove("dragging"));
      node.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = node.getBoundingClientRect();
        node.classList.toggle("drop-before", e.clientY < rect.top + rect.height / 2);
        node.classList.toggle("drop-after", e.clientY >= rect.top + rect.height / 2);
      });
      node.addEventListener("dragleave", () => node.classList.remove("drop-before", "drop-after"));
      node.addEventListener("drop", async (e) => {
        e.preventDefault();
        node.classList.remove("drop-before", "drop-after");
        const cardId = Number(e.dataTransfer.getData("text/plain"));
        const listEl = node.closest(".tlist");
        const below = node.classList.contains("drop-after") ? node : node.previousElementSibling;
        const above = node.classList.contains("drop-after") ? node.nextElementSibling : node;
        await doMove(cardId, listEl.dataset.list,
          above && above.classList.contains("trello-card") ? Number(above.dataset.card) : null,
          below && below.classList.contains("trello-card") ? Number(below.dataset.card) : null);
      });
    });
  }

  function listDropTarget(listEl) {
    listEl.addEventListener("dragover", (e) => {
      if (e.target === listEl || e.target.classList.contains("list-cards")) {
        e.preventDefault();
        listEl.classList.add("drop-list");
      }
    });
    listEl.addEventListener("dragleave", (e) => {
      if (!listEl.contains(e.relatedTarget)) listEl.classList.remove("drop-list");
    });
    listEl.addEventListener("drop", async (e) => {
      if (e.target !== listEl && !e.target.classList.contains("list-cards")) return;
      e.preventDefault();
      listEl.classList.remove("drop-list");
      const cardId = Number(e.dataTransfer.getData("text/plain"));
      if (!cardId) return;
      const cards = [...listEl.querySelectorAll(".trello-card")];
      if (!cards.length) {
        await doMove(cardId, listEl.dataset.list, null, null);
        return;
      }
      const rect = listEl.querySelector(".list-cards").getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        await doMove(cardId, listEl.dataset.list, Number(cards[0].dataset.card), null);
      } else {
        await doMove(cardId, listEl.dataset.list, null, Number(cards[cards.length - 1].dataset.card));
      }
    });
  }

  async function doMove(cardId, targetList, beforeId, afterId) {
    const cur = boardState;
    if (!cur) return;
    const card = cur.lists.flatMap((l) => l.cards).find((c) => c.id === cardId);
    if (!card) return;
    try {
      const updated = await API.moveCard(cardId, { list_id: Number(targetList), before_id: beforeId, after_id: afterId });
      if (card.list_id !== Number(targetList)) {
        toast(`Moved to ${updated.list_title || "list"}`);
      }
      await loadBoard(cur.board.id, true);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  /* ----------------------------- home ----------------------------- */
  async function trelloHome(starred) {
    let workspaces;
    try {
      workspaces = (await API.listWorkspaces()).workspaces || [];
    } catch (err) {
      return shell(el("div", { class: "page" }, el("p", {}, err.message)));
    }
    if (!workspaces.length) {
      return shell(el("div", { class: "page empty" },
        el("h2", {}, "Trello Boards"),
        el("p", {}, "Create a workspace to start making boards."),
        el("button", { class: "btn primary", onclick: newWorkspaceModal }, "Create Workspace")));
    }
    const activeId = Number(localStorage.getItem("opsdesk-ws") || workspaces[0].id) ||
      workspaces[0].id;
    const ws = workspaces.find((w) => w.id === activeId) || workspaces[0];
    let boards;
    try {
      boards = (await API.listBoards(ws.id, starred)).boards || [];
    } catch (err) {
      boards = [];
    }
    const isAdminRole = ws.role === "admin";
    const grid = el("div", { class: "board-grid" },
      ...boards.map((b) => el("a", { class: "board-tile", href: "#/trello/board/" + b.id, onclick: (e) => { e.preventDefault(); navigate(`/trello/board/${b.id}`); } },
        el("div", { class: "tile-head" }, b.is_starred ? "★" : "·",
          el("span", {}, esc(b.title))),
        el("div", { class: "tile-meta" }, `${b.list_count} list${b.list_count === 1 ? "" : "s"}`))),
      el("button", { class: "board-tile new", onclick: newBoardModal }, "+ New Board"));

    const switcher = el("div", { class: "ws-switcher" },
      el("select", { id: "ws-select", onchange: (e) => {
        localStorage.setItem("opsdesk-ws", e.target.value);
        navigate("/trello");
      } },
        ...workspaces.map((w) => el("option", { value: w.id, selected: w.id === ws.id },
          esc(w.name), ` (${w.role})`))),
      isAdminRole ? el("button", { class: "btn ghost sm", onclick: () => membersModal(ws) }, "Members") : null,
      isAdminRole ? el("button", { class: "btn ghost sm", onclick: () => workspaceSettingsModal(ws) }, "Settings") : null,
      el("button", { class: "btn ghost sm", onclick: newWorkspaceModal }, "New Workspace"));

    return shell(el("div", { class: "page" },
      el("div", { class: "row" },
        el("h2", {}, "Trello Boards"),
        el("div", { class: "spacer" }),
        el("a", { class: "btn ghost sm" + (starred ? "" : " primary"), href: "#/trello", onclick: (e) => { e.preventDefault(); navigate("/trello"); } }, "My Boards"),
        el("a", { class: "btn ghost sm" + (starred ? " primary" : ""), href: "#/trello/starred", onclick: (e) => { e.preventDefault(); navigate("/trello/starred"); } }, "Starred ★")),
      switcher,
      grid));
  }

  /* --------------------------- board view --------------------------- */
  async function trelloBoard() {
    const id = Number(seg(2));
    if (!id) return navigate("/trello");
    return loadBoard(id, false);
  }

  async function loadBoard(id, silent) {
    if (_boardMoveHandler) { document.removeEventListener("keydown", _boardMoveHandler); _boardMoveHandler = null; }
    let data;
    try {
      data = await API.getBoard(id);
    } catch (err) {
      return shell(el("div", { class: "page" }, el("p", {}, err.message)));
    }
    boardState = data;
    const b = data.board;
    const isWriter = data.members.some((m) => m.id === OD.h.currentUser().id &&
      (m.role === "admin" || m.role === "member"));
    const listEls = data.lists.map((l) => {
      const cardsWrap = el("div", { class: "list-cards" },
        ...l.cards.map((c) => cardTile(c, openCardModal)));
      const listEl = el("section", { class: "tlist" + (l.is_archived ? " archived" : ""), "data-list": l.id, draggable: "true" },
        el("header", { class: "tlist-head", draggable: "true" },
          el("input", { class: "tlist-title", value: l.title, "aria-label": "List title",
            onchange: async (e) => {
              try { await API.updateList(l.id, { title: e.target.value }); toast("List updated"); }
              catch (err) { toast(err.message, "error"); }
            } }),
          el("span", { class: "tlist-count" }, String(l.cards.length)),
          el("button", { class: "icon-btn", title: "Archive list", onclick: async () => {
            try { await API.updateList(l.id, { is_archived: true }); await loadBoard(id, true); }
            catch (err) { toast(err.message, "error"); }
          } }, "🗑")),
        cardsWrap,
        isWriter ? el("input", { class: "add-card", placeholder: "+ Add a card", "aria-label": "Add card",
          onkeydown: async (e) => {
            if (e.key !== "Enter") return;
            const v = e.target.value.trim();
            if (!v) return;
            try {
              await API.createCard({ list_id: l.id, title: v });
              e.target.value = "";
              await loadBoard(id, true);
            } catch (err) { toast(err.message, "error"); }
          } }) : null);
      listDropTarget(listEl);
      return listEl;
    });

    listEls.forEach((le) => {
      le.addEventListener("dragstart", (e) => {
        if (e.target.closest(".trello-card")) return; // card drags take over
        e.dataTransfer.setData("text/list", le.dataset.list);
        le.classList.add("dragging");
      });
      le.addEventListener("dragend", () => le.classList.remove("dragging"));
      le.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes("text/list")) { e.preventDefault(); le.classList.add("drop-list"); }
      });
      le.addEventListener("drop", async (e) => {
        const listId = e.dataTransfer.getData("text/list");
        le.classList.remove("drop-list");
        if (!listId || Number(listId) === Number(le.dataset.list)) return;
        try {
          await API.updateList(Number(listId), { before_id: Number(le.dataset.list) });
          await loadBoard(id, true);
        } catch (err) { toast(err.message, "error"); }
      });
    });

    const boardEl = el("div", { class: "board-wrap" },
      el("div", { class: "board-head", style: `background:${b.background}` },
        el("div", { class: "board-title" },
          el("h2", {}, esc(b.title)),
          b.is_starred ? " ★" : null,
          el("span", { class: "board-sub" }, esc(data.workspace.name))),
        el("div", { class: "spacer" }),
        el("div", { class: "view-tabs", role: "tablist" },
          ["board", "calendar", "table"].map((t) =>
            el("button", { class: "view-tab" + (boardTab === t ? " active" : ""),
                           role: "tab", "aria-selected": boardTab === t ? "true" : "false",
                           onclick: () => { boardTab = t; loadBoard(id, true); } },
              { board: "Board", calendar: "Calendar", table: "Table" }[t]))),
        el("button", { class: "btn ghost sm", onclick: () => activityModal(id) }, "Activity"),
        isWriter ? el("button", { class: "btn ghost sm", onclick: () => boardSettingsModal(data) }, "Settings") : null),
      boardTab === "calendar" ? el("div", { id: "tab-content" }) :
        boardTab === "table" ? el("div", { id: "tab-content" }) :
        el("div", { class: "board-cols" },
          ...listEls,
          isWriter ? el("div", { class: "tlist add-list" },
            el("input", { id: "new-list", placeholder: "+ Add another list", "aria-label": "Add list",
              onkeydown: async (e) => {
                if (e.key !== "Enter") return;
                const v = e.target.value.trim();
                if (!v) return;
                try {
                  await API.createList(id, { title: v });
                  e.target.value = "";
                  await loadBoard(id, true);
                } catch (err) { toast(err.message, "error"); }
              } })) : null));
    setDrag();
    if (boardTab === "calendar") {
      renderCalendarView(id, b, isWriter);
    } else if (boardTab === "table") {
      renderTableView(id, b, isWriter, data);
    }
    document.addEventListener("keydown", _boardMoveHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        if (!selectedCardId || !boardState) return;
        const lists = boardState.lists;
        if (!lists.length) return;
        const sel = el("select", { "aria-label": "Move to list" },
          el("option", { value: "" }, "Move to list…"),
          ...lists.map((l) => el("option", { value: l.id }, esc(l.title))));
        const body = el("div", {}, el("label", { class: "field" }, el("span", { class: "label" }, "List"), sel));
        openModal("Move card", body, async () => {
          const targetList = sel.value;
          if (!targetList) { toast("Pick a list.", "error"); return false; }
          try { await doMove(selectedCardId, Number(targetList), null, null); return true; }
          catch (err) { toast(err.message, "error"); return false; }
        });
      }
    });
    return shell(boardEl);
  }

  /* ---------------------- calendar view (Phase 2B) ---------------------- */
  async function renderCalendarView(bid, b, isWriter) {
    const now = new Date();
    let year = now.getFullYear(), month = now.getMonth() + 1;
    const calEl = el("div", { class: "cal-wrap" },
      el("div", { class: "cal-head" },
        el("button", { class: "btn ghost sm", onclick: () => shiftMonth(-1) }, "◀"),
        el("strong", { id: "cal-title" }),
        el("button", { class: "btn ghost sm", onclick: () => shiftMonth(1) }, "▶"),
        el("button", { class: "btn ghost sm", onclick: () => { const t = new Date(); year = t.getFullYear(); month = t.getMonth() + 1; paint(); } }, "Today")),
      el("div", { class: "cal-grid", id: "cal-grid" }),
      el("div", { class: "cal-side" },
        el("h4", {}, "No due date"),
        el("div", { id: "cal-undated" })));
    const paint = async () => {
      const first = new Date(year, month - 1, 1);
      const startDow = (first.getDay() + 6) % 7; // Monday-first
      const daysInMonth = new Date(year, month, 0).getDate();
      const grid = $("#cal-grid");
      grid.innerHTML = "";
      const head = el("div", { class: "cal-grid" });
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) =>
        head.appendChild(el("div", { class: "cal-dow" }, d)));
      grid.appendChild(head);
      const days = el("div", { class: "cal-grid" });
      for (let i = 0; i < startDow; i++) days.appendChild(el("div", { class: "cal-day empty" }));
      const cells = new Map();
      for (let d = 1; d <= daysInMonth; d++) {
        const dayEl = el("div", { class: "cal-day" },
          el("span", { class: "cal-date" }, String(d)),
          el("div", { class: "cal-cards" }));
        cells.set(d, dayEl);
        days.appendChild(dayEl);
      }
      grid.appendChild(days);
      $("#cal-title").textContent = `${year}-${String(month).padStart(2, "0")}`;
      const data = await API.boardCalendar(bid, `${year}-${String(month).padStart(2, "0")}`);
      const today = new Date();
      const isToday = (d) => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
      for (const c of data.cards) {
        const day = Number((c.due_date || "0").slice(8, 10));
        const cell = cells.get(day);
        if (!cell) continue;
        cell.classList.add("has-cards");
        cell.querySelector(".cal-cards").appendChild(el("div",
          { class: "cal-card" + (c.is_complete ? " done" : ""), onclick: () => openCardModal(c),
            title: c.title + " · " + (c.list_title || "") },
          esc(c.title)));
      }
      for (const [d, cell] of cells) {
        if (isToday(d)) cell.classList.add("today");
        if (isWriter) cell.appendChild(el("button", { class: "cal-add", "aria-label": "Add card on day " + d, onclick: () => quickCard(d) }, "+"));
      }
      const undated = $("#cal-undated");
      undated.innerHTML = "";
      undated.append(...data.undated.map((c) => el("div",
        { class: "cal-card undated", onclick: () => openCardModal(c) }, esc(c.title))));
    };
    const shiftMonth = (d) => {
      month += d;
      if (month === 0) { month = 12; year--; }
      if (month === 13) { month = 1; year++; }
      paint();
    };
    const quickCard = async (d) => {
      const title = window.prompt ? window.prompt(`New card on ${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`) : null;
      if (!title || !title.trim()) return;
      try {
        const due = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        await API.createCard({ list_id: boardState.lists[0] ? boardState.lists[0].id : null, title: title.trim(), due_date: due });
        toast("Card created");
        paint();
        await loadBoard(bid, true);
      } catch (err) { toast(err.message, "error"); }
    };
    const tabContent = $("#tab-content");
    tabContent.innerHTML = "";
    tabContent.appendChild(calEl);
    paint();
  }

  /* ---------------------- table view (Phase 2B) ---------------------- */
  async function renderTableView(bid, b, isWriter, data) {
    const allCards = data.lists.flatMap((l) => l.cards.map((c) => ({ ...c, list_title: l.title })));
    const sortKey = { key: "position", dir: 1 };
    const selected = new Set();
    const tblEl = el("div", { class: "tbl-wrap" },
      el("div", { class: "tbl-bar", id: "bulk-bar", style: "display:none" },
        el("span", { id: "bulk-count" }),
        isWriter ? el("select", { id: "bulk-list", class: "sm", "aria-label": "Move selected to list",
          onchange: async (e) => {
            const v = e.target.value;
            e.target.value = "";
            if (!v) return;
            await runBulk({ list_id: Number(v) });
          } },
          el("option", { value: "" }, "Move to list…"),
          ...data.lists.map((l) => el("option", { value: l.id }, esc(l.title)))) : null,
        isWriter ? el("input", { type: "date", id: "bulk-due", "aria-label": "Set due date",
          onchange: async (e) => { await runBulk({ due_date: e.target.value || null }); e.target.value = ""; } }) : null,
        isWriter ? el("button", { class: "btn ghost sm", onclick: () => runBulk({ is_complete: true }) }, "✓ Complete") : null,
        isWriter ? el("button", { class: "btn danger sm", onclick: () => {
          confirmModal("Delete " + selected.size + " card(s) permanently?", "Delete", async () => {
            for (const cid of [...selected]) {
              try { await API.deleteCard(cid); } catch (err) { toast(err.message, "error"); }
            }
            await loadBoard(bid, true);
          });
        } }, "Delete") : null),
      el("table", { class: "tbl" },
        el("thead", {},
          el("tr", {},
            isWriter ? el("th", {}, el("input", { type: "checkbox", "aria-label": "Select all",
              onchange: (e) => {
                allCards.forEach((c) => selected[e.target.checked ? "add" : "delete"](c.id));
                syncChecks();
              } })) : null,
            ...["title", "list_title", "due_date", "is_complete"].map((k) =>
              el("th", { class: "sortable", onclick: () => { sortKey.key = k; sortKey.dir *= -1; paintRows(); } },
                { title: "Title", list_title: "List", due_date: "Due", is_complete: "Done" }[k],
                sortKey.key === k ? (sortKey.dir === 1 ? " ▲" : " ▼") : "")),
            el("th", {}, "Members"), el("th", {}, "Labels"))),
        el("tbody", { id: "tbl-body" })));
    const paintRows = () => {
      const body = $("#tbl-body");
      if (!body) return;
      body.innerHTML = "";
      const sorted = [...allCards].sort((a, z) => {
        const av = a[sortKey.key], zv = z[sortKey.key];
        if (av === null || av === undefined) return 1;
        if (zv === null || zv === undefined) return -1;
        return (av < zv ? -1 : av > zv ? 1 : 0) * sortKey.dir;
      });
      body.append(...sorted.map((c) => el("tr", { class: "tbl-row" + (selected.has(c.id) ? " sel" : "") },
        isWriter ? el("td", {}, el("input", { type: "checkbox", checked: selected.has(c.id),
          onchange: (e) => { selected[e.target.checked ? "add" : "delete"](c.id); syncChecks(); } })) : null,
        el("td", { class: "t-title", onclick: () => openCardModal(c) }, esc(c.title)),
        el("td", { onclick: () => openCardModal(c) }, esc(c.list_title || "")),
        el("td", { onclick: () => openCardModal(c) }, c.due_date || "—"),
        el("td", { onclick: () => openCardModal(c) }, c.is_complete ? "✅" : "—"),
        el("td", {}, (c.card_members || []).map((m) => el("span", { class: "chip member sm", title: m.email }, esc(m.name)))),
        el("td", {}, (c.labels || []).map((l) => el("span", { class: "tlabel", style: `background:${labelColor(l.color)}`, title: l.name }))))));
    };
    const syncChecks = () => {
      const bar = $("#bulk-bar");
      if (!bar) return;
      bar.style.display = selected.size ? "" : "none";
      $("#bulk-count").textContent = `${selected.size} selected`;
      paintRows();
    };
    const runBulk = async (payload) => {
      try {
        await API.bulkCards({ board_id: bid, card_ids: [...selected], ...payload });
        toast("Updated " + selected.size + " card(s)");
        selected.clear();
        await loadBoard(bid, true);
      } catch (err) { toast(err.message, "error"); }
    };
    const tabContent = $("#tab-content");
    tabContent.innerHTML = "";
    tabContent.appendChild(tblEl);
    paintRows();
  }

  /* ---------------------- activity modal (Phase 2B) ---------------------- */
  async function activityModal(bid) {
    let act;
    try { act = (await API.boardActivity(bid)).activity || []; }
    catch (err) { return toast(err.message, "error"); }
    openModal("Board Activity", el("div", { class: "board-activity" },
      act.length ? act.map((e) => el("div", { class: "activity-row" },
        el("b", {}, esc(e.actor_name || "Someone")), " ", esc(e.action),
        e.detail && e.detail.note ? el("span", { class: "note" }, "— ", esc(e.detail.note)) : null,
        el("span", { class: "muted" }, " · ", ago(e.created_at)))) :
        el("p", { class: "muted" }, "No activity yet.")), null);
  }

  /* --------------------------- card modal --------------------------- */
  function openCardModal(card) {
    selectedCardId = card.id;
    const data = boardState;
    const b = data.board;
    const canEdit = data.members.some((m) => m.id === OD.h.currentUser().id &&
      (m.role === "admin" || m.role === "member"));
    const refresh = async () => { await loadBoard(b.id, true); openCardModal(boardState.lists.flatMap((l) => l.cards).find((c) => c.id === card.id)); };

    const memberChips = el("div", { class: "member-chips" },
      ...(card.card_members || []).map((m) => el("span", { class: "chip member", title: m.email },
        esc(m.name), canEdit ? el("button", { class: "chip-x", "aria-label": "Remove " + m.name,
          onclick: async () => { try { await API.removeCardMember(card.id, m.id); await refresh(); } catch (err) { toast(err.message, "error"); } } }, "×") : null)));
    const memberAdd = canEdit ? el("select", { class: "sm", "aria-label": "Add member",
      onchange: async (e) => {
        const uid = Number(e.target.value);
        e.target.value = "";
        if (!uid) return;
        try { await API.addCardMember(card.id, uid); await refresh(); }
        catch (err) { toast(err.message, "error"); }
      } },
      el("option", { value: "" }, "Add member…"),
      ...data.members.filter((m) => !(card.card_members || []).some((cm) => cm.id === m.id))
        .map((m) => el("option", { value: m.id }, esc(m.name)))) : null;

    const labelChips = el("div", { class: "label-chips" },
      ...(card.labels || []).map((l) => el("span", { class: "chip", style: `background:${labelColor(l.color)}` },
        esc(l.name), canEdit ? el("button", { class: "chip-x", "aria-label": "Remove label",
          onclick: async () => { try { await API.detachLabel(card.id, l.id); await refresh(); } catch (err) { toast(err.message, "error"); } } }, "×") : null)));
    const labelAdd = canEdit ? el("select", { class: "sm", "aria-label": "Add label",
      onchange: async (e) => {
        const lid = Number(e.target.value);
        e.target.value = "";
        if (!lid) return;
        try { await API.attachLabel(card.id, lid); await refresh(); }
        catch (err) { toast(err.message, "error"); }
      } },
      el("option", { value: "" }, "Add label…"),
      ...data.labels.filter((l) => !(card.labels || []).some((cl) => cl.id === l.id))
        .map((l) => el("option", { value: l.id }, esc(l.name)))) : null;

    const clSections = (card.checklists || []).map((cl) => el("div", { class: "cl" },
      el("div", { class: "cl-head" },
        el("strong", {}, esc(cl.title)),
        checklistProgress(cl),
        canEdit ? el("input", { class: "sm", style: "width:70px", value: cl.title, "aria-label": "Checklist title",
          onchange: async (e) => { try { await API.updateChecklist(cl.id, e.target.value); await refresh(); } catch (err) { toast(err.message, "error"); } } }) : null),
      el("ul", { class: "cl-items" }, ...(cl.items || []).map((it) => el("li", { class: "cl-item" },
        canEdit ? el("input", { type: "checkbox", checked: !!it.is_checked,
          onchange: async () => { try { await API.updateChecklistItem(it.id, it.content, !it.is_checked); await refresh(); } catch (err) { toast(err.message, "error"); } } }) : null,
        esc(it.content)))),
      canEdit ? el("input", { class: "sm", placeholder: "+ Add item", "aria-label": "Add checklist item",
        onkeydown: async (e) => {
          if (e.key !== "Enter") return;
          const v = e.target.value.trim();
          if (!v) return;
          try { await API.addChecklistItem(cl.id, v); e.target.value = ""; await refresh(); }
          catch (err) { toast(err.message, "error"); }
        } }) : null));
    const clAdd = canEdit ? el("input", { class: "sm", placeholder: "New checklist…", "aria-label": "Add checklist",
      onkeydown: async (e) => {
        if (e.key !== "Enter") return;
        const v = e.target.value.trim() || "Checklist";
        try { await API.addChecklist(card.id, v); e.target.value = ""; await refresh(); }
        catch (err) { toast(err.message, "error"); }
      } }) : null;

    const comments = el("div", { class: "card-comments" });
    const loadComments = async () => {
      const act = (await API.cardComments(card.id)).activity || [];
      comments.innerHTML = "";
      comments.append(...act.map((a) => el("div", { class: "activity-row" },
        el("b", {}, esc(a.actor_name || "Someone")), " ", esc(a.action),
        a.detail && a.detail.note ? el("span", { class: "note" }, "— ", esc(a.detail.note)) : null,
        el("span", { class: "muted" }, " · ", ago(a.created_at)))));
    };
    loadComments();

    const body = el("div", { class: "card-modal" },
      canEdit ? el("input", { class: "card-title-input", value: card.title, "aria-label": "Card title",
        onchange: async (e) => {
          const v = e.target.value.trim();
          if (!v) return;
          try { await API.updateCard(card.id, { title: v }); await refresh(); } catch (err) { toast(err.message, "error"); }
        } }) : el("h3", {}, esc(card.title)),
      el("div", { class: "row" },
        el("label", {}, "Due ", el("input", { type: "date", value: card.due_date || "", "aria-label": "Due date",
          onchange: async (e) => {
            try { await API.updateCard(card.id, { due_date: e.target.value || null }); await refresh(); }
            catch (err) { toast(err.message, "error"); }
          } })),
        canEdit ? el("label", { class: "row" }, el("input", { type: "checkbox", checked: !!card.is_complete,
          onchange: async (e) => { try { await API.updateCard(card.id, { is_complete: e.target.checked }); await refresh(); } catch (err) { toast(err.message, "error"); } } }), " Complete") : null,
        canEdit ? el("select", { class: "sm", "aria-label": "Cover color",
          onchange: async (e) => {
            try { await API.updateCard(card.id, { cover_color: e.target.value || null }); await refresh(); }
            catch (err) { toast(err.message, "error"); }
          } },
          el("option", { value: "" }, "No cover"),
          ...LABEL_COLORS.map((c) => el("option", { value: c, selected: card.cover_color === c }, c))) : null,
        canEdit ? el("button", { class: "btn ghost sm", onclick: async () => {
          confirmModal("Delete this card permanently?", "Delete", async () => {
            try { await API.deleteCard(card.id); closeModal(); await loadBoard(boardState.board.id, true); }
            catch (err) { toast(err.message, "error"); }
          });
        } }, "Delete") : null),
      canEdit ? el("textarea", { class: "card-desc", rows: 3, placeholder: "Add a description…", "aria-label": "Description",
        value: card.description || "", onchange: async (e) => {
          try { await API.updateCard(card.id, { description: e.target.value }); await refresh(); }
          catch (err) { toast(err.message, "error"); }
        } }) : (card.description ? el("p", { class: "card-desc", style: "white-space:pre-wrap" }, esc(card.description)) : null),
      el("h4", {}, "Members"), memberChips, memberAdd,
      el("h4", {}, "Labels"), labelChips, labelAdd,
      el("h4", {}, "Checklists"), ...clSections, clAdd,
      el("h4", {}, "Activity"), comments,
      el("h4", {}, "Linked items"), OD.renderEntityLinks ? OD.renderEntityLinks("trello_card", card.id) : null,
      canEdit ? el("div", { class: "row" },
        el("input", { id: "card-comment-input", class: "sm grow", placeholder: "Write a comment…", "aria-label": "Comment",
          onkeydown: async (e) => {
            if (e.key !== "Enter") return;
            const v = e.target.value.trim();
            if (!v) return;
            try { await API.addCardComment(card.id, v); e.target.value = ""; loadComments(); await loadBoard(boardState.board.id, true); }
            catch (err) { toast(err.message, "error"); }
          } })) : null);
    openModal(`Card · ${boardState.lists.find((l) => l.id === card.list_id)?.title || ""}`, body, null);
  }

  /* --------------------------- modals --------------------------- */
  function newWorkspaceModal() {
    openModal("New Workspace", el("div", {},
      el("label", {}, "Name", el("input", { id: "ws-name", placeholder: "e.g. Marketing" })),
      el("label", {}, "Description", el("textarea", { id: "ws-desc", rows: 2 })),
      el("label", {}, "Visibility", el("select", { id: "ws-vis" },
        el("option", { value: "workspace" }, "Workspace"),
        el("option", { value: "private" }, "Private"),
        el("option", { value: "public" }, "Public")))), async () => {
      const name = $("#ws-name").value.trim();
      if (!name) { toast("Name is required", "error"); return false; }
      try {
        const ws = (await API.createWorkspace({ name, description: $("#ws-desc").value, visibility: $("#ws-vis").value })).workspace;
        localStorage.setItem("opsdesk-ws", ws.id);
        toast("Workspace created");
        return true;
      } catch (err) { toast(err.message, "error"); return false; }
    });
  }

  function newBoardModal() {
    const ws = boardState ? { id: boardState.board.workspace_id } : null;
    openModal("New Board", el("div", {},
      el("label", {}, "Workspace", el("input", { id: "nb-ws", value: ws ? ws.id : (localStorage.getItem("opsdesk-ws") || ""), type: "number", "aria-label": "Workspace id" })),
      el("label", {}, "Title", el("input", { id: "nb-title", placeholder: "e.g. Q4 Launch" })),
      el("label", {}, "Background", el("select", { id: "nb-bg" },
        ...LABEL_COLORS.map((c) => el("option", { value: c }, c))))), async () => {
      const title = $("#nb-title").value.trim();
      if (!title) { toast("Title is required", "error"); return false; }
      try {
        const b = (await API.createBoard({ workspace_id: Number($("#nb-ws").value), title, background: $("#nb-bg").value })).board;
        navigate(`/trello/board/${b.id}`);
        return true;
      } catch (err) { toast(err.message, "error"); return false; }
    });
  }

  async function membersModal(ws) {
    let members;
    try { members = (await API.workspaceMembers(ws.id)).members || []; }
    catch (err) { return toast(err.message, "error"); }
    const listEl = el("div", { class: "member-list" },
      ...members.map((m) => el("div", { class: "row member-row" },
        el("div", {}, el("b", {}, esc(m.name)), " · ", el("span", { class: "muted" }, esc(m.email)),
          el("span", { class: "chip role-" + m.ws_role }, ROLE_LABEL[m.ws_role] || m.ws_role)),
        el("div", { class: "spacer" }),
        el("select", { class: "sm", value: m.ws_role, "aria-label": "Role for " + m.name, onchange: async (e) => {
          try { await API.addWorkspaceMember(ws.id, { user_id: m.id, role: e.target.value }); toast("Role updated"); membersModal(ws); }
          catch (err) { toast(err.message, "error"); }
        } },
          ...Object.keys(ROLE_LABEL).map((r) => el("option", { value: r, selected: m.ws_role === r }, ROLE_LABEL[r]))),
        m.ws_role !== "admin" || ws.owner_id !== m.id ? el("button", { class: "btn ghost sm", onclick: async () => {
          try { await API.removeWorkspaceMember(ws.id, m.id); toast("Member removed"); membersModal(ws); }
          catch (err) { toast(err.message, "error"); }
        } }, "Remove") : null)));
    const addRow = el("div", { class: "row" },
      el("input", { id: "mm-uid", class: "sm grow", type: "number", placeholder: "User id", "aria-label": "User id" }),
      el("button", { class: "btn primary sm", onclick: async () => {
        const uid = Number($("#mm-uid").value);
        if (!uid) return toast("User id required", "error");
        try { await API.addWorkspaceMember(ws.id, { user_id: uid, role: "member" }); toast("Member added"); membersModal(ws); }
        catch (err) { toast(err.message, "error"); }
      } }, "Add"));
    openModal(`Members · ${ws.name}`, el("div", {}, listEl, addRow), null);
  }

  function workspaceSettingsModal(ws) {
    openModal("Workspace Settings", el("div", {},
      el("label", {}, "Name", el("input", { id: "wss-name", value: ws.name })),
      el("label", {}, "Description", el("textarea", { id: "wss-desc", rows: 2 }, ws.description || "")),
      el("label", {}, "Visibility", el("select", { id: "wss-vis" },
        ["private", "workspace", "public"].map((v) =>
          el("option", { value: v, selected: ws.visibility === v }, v.charAt(0).toUpperCase() + v.slice(1)))))), async () => {
      const name = $("#wss-name").value.trim();
      if (!name) { toast("Name is required", "error"); return false; }
      try {
        await API.updateWorkspace(ws.id, { name, description: $("#wss-desc").value, visibility: $("#wss-vis").value });
        toast("Workspace updated");
        return true;
      } catch (err) { toast(err.message, "error"); return false; }
    });
  }

  function boardSettingsModal(data) {
    openModal("Board Settings", el("div", {},
      el("label", {}, "Title", el("input", { id: "bs-title", value: b.title })),
      el("label", {}, "Description", el("textarea", { id: "bs-desc", rows: 2 }, b.description || "")),
      el("label", {}, "Background", el("select", { id: "bs-bg" },
        ...LABEL_COLORS.map((c) => el("option", { value: c, selected: b.background === c }, c)))),
      el("label", { class: "row" }, el("input", { id: "bs-star", type: "checkbox", checked: !!b.is_starred }), " Starred"),
      el("label", { class: "row" }, el("input", { id: "bs-arch", type: "checkbox", checked: !!b.is_archived }), " Archived"),
      el("h4", {}, "Labels"),
      el("div", { class: "label-list" }, ...data.labels.map((l) =>
        el("span", { class: "chip", style: `background:${labelColor(l.color)}` }, esc(l.name)))),
      el("div", { class: "row" },
        el("input", { id: "bs-label-name", class: "sm grow", placeholder: "Label name", "aria-label": "Label name" }),
        el("select", { id: "bs-label-color", class: "sm", "aria-label": "Label color" },
          ...LABEL_COLORS.map((c) => el("option", { value: c }, c))),
        el("button", { class: "btn primary sm", onclick: async () => {
          const name = $("#bs-label-name").value.trim();
          if (!name) return toast("Label name required", "error");
          try { await API.createLabel(b.id, { name, color: $("#bs-label-color").value }); toast("Label added"); await loadBoard(b.id, true); }
          catch (err) { toast(err.message, "error"); }
        } }, "Add"))), async () => {
      const title = $("#bs-title").value.trim();
      if (!title) { toast("Title is required", "error"); return false; }
      try {
        await API.updateBoard(b.id, {
          title,
          description: $("#bs-desc").value,
          background: $("#bs-bg").value,
          is_starred: $("#bs-star").checked,
          is_archived: $("#bs-arch").checked,
        });
        toast("Board updated");
        await loadBoard(b.id, true);
        return true;
      } catch (err) { toast(err.message, "error"); return false; }
    });
  }

  views.trelloHome = trelloHome;
  views.trelloBoard = trelloBoard;
})();