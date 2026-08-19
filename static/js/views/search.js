/* ==========================================================================
   OpsDesk — Phase 6 global search + cross-entity link palette.

   Exposes:
     OD.views.search             — full-page search (#/search)
     OD.views.openSearchPalette  — Ctrl/Cmd+K command palette overlay
     OD.renderEntityLinks(srcType, srcId) — DOM node for the "Linked items"
       panel reused by issue detail, card modal and note reader.
   ========================================================================== */
(function (OD) {
  "use strict";
  OD.views = OD.views || {};
  const views = OD.views;

  const H = () => OD.h;
  const $ = (s, r) => H().$(s, r);
  const el = (t, a, ...c) => H().el(t, a, ...c);
  const esc = (s) => H().esc(s);
  const toast = (m, k) => H().toast(m, k);
  const navigate = (h) => H().navigate(h);

  const SCOPES = [
    ["all", "Everything"],
    ["issues", "Issues"],
    ["cards", "Cards"],
    ["notes", "Notes"],
  ];
  const TYPE_LABELS = {
    jira_issue: "Jira issue",
    trello_card: "Trello card",
    kb_note: "KB note",
    goal: "Goal",
    ai_chat: "AI chat",
  };
  const LINK_TYPES = ["jira_issue", "trello_card", "kb_note", "goal", "ai_chat"];

  function resultHref(r, scope) {
    if (r.issue_key) return "#/jira/issue/" + encodeURIComponent(r.issue_key);
    if (scope === "cards" || r.board_name != null) return "#/trello";
    if (r.title != null) return "#/kb/note/" + r.id;
    return "#";
  }
  function resultLabel(r, scope) {
    if (r.issue_key) return r.issue_key + " — " + (r.summary || "");
    if (scope === "cards" || r.board_name != null) return (r.title || "Card") + (r.board_name ? " · " + r.board_name : "");
    if (r.title != null) return r.title;
    return (TYPE_LABELS[scope] || scope) + " #" + r.id;
  }
  function scopeMeta(r, k) {
    if (k === "issues") return r.status || "";
    if (k === "cards") return r.board_name || "";
    if (k === "notes") return r.status || "";
    return "";
  }

  function renderResults(container, data, scope) {
    const groups = [];
    if (scope === "all" || scope === "issues") (data.issues || []).forEach((r) => groups.push(["issues", r]));
    if (scope === "all" || scope === "cards") (data.cards || []).forEach((r) => groups.push(["cards", r]));
    if (scope === "all" || scope === "notes") (data.notes || []).forEach((r) => groups.push(["notes", r]));
    if (!groups.length) {
      container.replaceChildren(el("div", { class: "empty small" }, "No results."));
      return;
    }
    const byScope = {};
    groups.forEach(([s, r]) => { (byScope[s] = byScope[s] || []).push(r); });
    const keys = scope === "all" ? ["issues", "cards", "notes"] : [scope];
    container.replaceChildren(...keys.filter((k) => byScope[k]).map((k) =>
      el("div", { class: "search-group" },
        el("div", { class: "search-group-title" }, TYPE_LABELS[k] + "s"),
        ...byScope[k].map((r) =>
          el("a", { class: "search-result", href: resultHref(r, k),
            onclick: (e) => { e.preventDefault(); closePalette(); navigate(resultHref(r, k).slice(1)); } },
            el("span", { class: "sr-title" }, esc(resultLabel(r, k))),
            el("span", { class: "sr-meta muted" }, scopeMeta(r, k)))))));
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* ----------------------------- full-page search ----------------------------- */
  async function searchView() {
    const box = el("div", { class: "search-box" },
      el("input", { class: "search-input", id: "sp-q", type: "text",
        placeholder: "Search issues, cards and notes…", "aria-label": "Search",
        oninput: debounce(run, 250) }));
    const scopes = el("div", { class: "search-scopes" },
      ...SCOPES.map(([v, l]) => el("button", { class: "search-scope" + (v === "all" ? " active" : ""), "data-scope": v, onclick: (e) => {
        scopes.querySelectorAll(".search-scope").forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        run();
      } }, l)));
    const results = el("div", { class: "search-results" }, el("div", { class: "empty small" }, "Type to search."));

    async function run() {
      const q = $("#sp-q").value.trim();
      const scope = (scopes.querySelector(".search-scope.active") || {}).dataset && (scopes.querySelector(".search-scope.active") || {}).dataset.scope || "all";
      if (!q) { results.replaceChildren(el("div", { class: "empty small" }, "Type to search.")); return; }
      results.replaceChildren(el("div", { class: "empty small" }, el("span", { class: "spinner" }), " Searching…"));
      let data = { issues: [], cards: [], notes: [] };
      try { data = await API.search(q, scope, 20); } catch (err) { results.replaceChildren(el("div", { class: "empty small" }, err.message)); return; }
      renderResults(results, data, scope);
    }

    const wrap = el("div", { class: "page search-page" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Search"),
        el("div", { class: "spacer" }),
        el("span", { class: "muted small" }, "Press Ctrl/⌘ + K anywhere to search")),
      box, scopes, results);
    H().shell(wrap);
  }

  /* ----------------------------- command palette ----------------------------- */
  let _palette = null;
  function openSearchPalette() {
    if (_palette) return;
    if (document.querySelector("#modal-back")) return; // don't stack over a modal

    const input = el("input", { class: "search-palette-input", type: "text",
      placeholder: "Search issues, cards, notes…", "aria-label": "Search",
      oninput: debounce(run, 200) });
    const scopes = el("div", { class: "search-palette-scopes" },
      ...SCOPES.map(([v, l]) => el("button", { class: "search-scope" + (v === "all" ? " active" : ""), "data-scope": v, onclick: (e) => {
        scopes.querySelectorAll(".search-scope").forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        run();
      } }, l)));
    const results = el("div", { class: "search-palette-results" }, el("div", { class: "muted small" }, "Type to search…"));

    const panel = el("div", { class: "search-palette", role: "dialog", "aria-modal": "true", "aria-label": "Search", tabindex: "-1" }, input, scopes, results);
    const backdrop = el("div", { class: "search-palette-backdrop", onclick: (e) => { if (e.target === backdrop) closePalette(); } }, panel);
    document.body.appendChild(backdrop);
    _palette = { backdrop, panel, input, results };

    async function run() {
      const q = input.value.trim();
      const scope = (scopes.querySelector(".search-scope.active") || {}).dataset && (scopes.querySelector(".search-scope.active") || {}).dataset.scope || "all";
      if (!q) { results.replaceChildren(el("div", { class: "muted small" }, "Type to search…")); return; }
      results.replaceChildren(el("div", { class: "muted small" }, el("span", { class: "spinner" }), " Searching…"));
      let data = { issues: [], cards: [], notes: [] };
      try { data = await API.search(q, scope, 5); } catch (err) { results.replaceChildren(el("div", { class: "muted small" }, err.message)); return; }
      renderResults(results, data, scope);
    }

    setTimeout(() => input.focus(), 0);
    document.addEventListener("keydown", paletteKey);
  }
  function paletteKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    if (e.key === "Enter") {
      const first = _palette && _palette.results.querySelector(".search-result");
      if (first) { e.preventDefault(); first.click(); }
    }
  }
  function closePalette() {
    if (!_palette) return;
    document.removeEventListener("keydown", paletteKey);
    _palette.backdrop.remove();
    _palette = null;
  }

  /* ----------------------------- cross-entity links ----------------------------- */
  // Returns a DOM node rendering the "Linked items" panel. Async content load
  // starts immediately. Add/remove controls carry data-no-print.
  function renderEntityLinks(sourceType, sourceId) {
    const list = el("div", { class: "el-list" }, el("div", { class: "muted small" }, "Loading…"));
    const typeSel = el("select", { class: "sm", "aria-label": "Link type" },
      ...LINK_TYPES.map((t) => el("option", { value: t }, TYPE_LABELS[t] || t)));
    const targetInput = el("input", { class: "sm", type: "text", placeholder: "Target id", "aria-label": "Target id" });
    const addBtn = el("button", { class: "btn ghost sm", "data-no-print": "", onclick: add }, "Link");
    const addRow = el("div", { class: "el-add", "data-no-print": "" }, typeSel, targetInput, addBtn);
    const section = el("div", { class: "entity-links" }, el("h4", {}, "Linked items"), list, addRow);

    async function load() {
      let links = [];
      try {
        const d = await API.listEntityLinks({ source_type: sourceType, source_id: sourceId });
        links = d.links || [];
      } catch (err) {
        list.replaceChildren(el("div", { class: "muted small" }, "Could not load links."));
        return;
      }
      if (!links.length) { list.replaceChildren(el("div", { class: "muted small" }, "No linked items yet.")); return; }
      list.replaceChildren(...links.map((l) => el("div", { class: "el-row" },
        el("span", { class: "el-type" }, esc(TYPE_LABELS[l.target_type] || l.target_type)),
        el("span", { class: "el-id mono" }, "#" + esc(String(l.target_id))),
        el("button", { class: "btn ghost sm el-remove", "data-no-print": "", title: "Remove link", onclick: () => remove(l.id) }, "✕"))));
    }
    async function add() {
      const type = typeSel.value;
      const idv = targetInput.value.trim();
      if (!idv) { toast("Enter a target id.", "error"); return; }
      try {
        await API.createEntityLink({ source_type: sourceType, source_id: sourceId, target_type: type, target_id: Number(idv) });
        targetInput.value = "";
        toast("Linked.");
        load();
      } catch (err) { toast(err.message, "error"); }
    }
    async function remove(id) {
      try { await API.deleteEntityLink(id); toast("Link removed."); load(); }
      catch (err) { toast(err.message, "error"); }
    }
    load();
    return section;
  }

  views.search = searchView;
  views.openSearchPalette = openSearchPalette;
  OD.renderEntityLinks = renderEntityLinks;
})(window.OpsDesk = window.OpsDesk || { views: {} });
