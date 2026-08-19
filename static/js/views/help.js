/* ==========================================================================
   OpsDesk Help Center — Phase 5 (Help Center).

   Routes (see app.js router):
     #/help            helpCenter()      — tabbed guides + onboarding tracker

   Public exports:
     OD.views.helpCenter   — the screen renderer
     OD.views.startTour   — tour engine (also used by app.js "?" shortcut)

   Backend contract (handled here):
     GET  /api/help/guides            -> {guides:[{key,label,note_count}]}
     GET  /api/help/guides/<tab>      -> {tab,label,notes:[{id,title,content}]}
     GET  /api/help/progress          -> {milestones:[{key,completed_at}],
                                            completed:[key], total:N}
     POST /api/help/progress          -> {ok,milestone_key,completed_at}
     GET  /api/help/shortcuts         -> {shortcuts:[{keys,description}]}
     GET  /api/help/tours/<tour_key>  -> {tour:{key,title,steps:[...]}}
   ========================================================================== */
(function (OD) {
  "use strict";
  OD.views = OD.views || {};
  const views = OD.views;

  // Reuse the global helpers registered on OD.h (never redefine them).
  const H = () => OD.h;
  const $ = (s, r) => H().$(s, r);
  const el = (t, a, ...c) => H().el(t, a, ...c);
  const esc = (s) => H().esc(s);
  const toast = (m, k) => H().toast(m, k);
  const shell = (inner) => H().shell(inner);
  const navigate = (h) => H().navigate(h);

  /* ----------------------------- markdown ----------------------------- */
  // Self-contained markdown renderer (mirrors kb.js / ai.js). Escapes HTML as
  // it emits every text segment so guide content can never inject markup (XSS).
  function escapeHtml(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function safeUrl(u) {
    u = String(u).trim();
    if (/^(https?:|mailto:|#|\/)/i.test(u)) return u;
    return "#";
  }
  function inline(text) {
    if (!text) return "";
    text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      (_, t, u) => `<a href="${escapeHtml(safeUrl(u))}" target="_blank" rel="noopener">${escapeHtml(t)}</a>`);
    text = text.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${escapeHtml(c)}</strong>`);
    text = text.replace(/(^|[^*])\*([^*]+)\*/g, (_, pre, c) => `${pre}<em>${escapeHtml(c)}</em>`);
    text = text.replace(/(^|[^_])_([^_]+)_/g, (_, pre, c) => `${pre}<em>${escapeHtml(c)}</em>`);
    return text;
  }
  function renderMarkdown(src) {
    if (!src) return "";
    const lines = String(src).split(/\r?\n/);
    let html = "", inCode = false, codeBuf = [], listType = null, listBuf = [];
    const flushList = () => {
      if (listType) {
        html += `<${listType}>` + listBuf.map((li) => `<li>${inline(li)}</li>`).join("") + `</${listType}>`;
        listType = null; listBuf = [];
      }
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("```")) {
        if (!inCode) { inCode = true; codeBuf = []; }
        else { flushList(); html += `<pre class="md-code"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`; inCode = false; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      let m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) { flushList(); const lvl = m[1].length; html += `<h${lvl}>${inline(m[2])}</h${lvl}>`; continue; }
      if (/^(\s*[-*_]){3,}\s*$/.test(line)) { flushList(); html += "<hr>"; continue; }
      if (/^>\s?/.test(line)) { flushList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; continue; }
      if (/^\s*[-*+]\s+/.test(line)) { if (listType && listType !== "ul") flushList(); listType = "ul"; listBuf.push(line.replace(/^\s*[-*+]\s+/, "")); continue; }
      if (/^\s*\d+\.\s+/.test(line)) { if (listType && listType !== "ol") flushList(); listType = "ol"; listBuf.push(line.replace(/^\s*\d+\.\s+/, "")); continue; }
      if (/^\s*$/.test(line)) { flushList(); continue; }
      flushList();
      html += `<p>${inline(line)}</p>`;
    }
    if (inCode) html += `<pre class="md-code"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
    flushList();
    return html;
  }

  /* ----------------------------- state ----------------------------- */
  let _guides = [];      // cached tab list
  let _activeTab = null;
  let _progress = null;  // cached {milestones, completed, total}

  /* ----------------------------- view ----------------------------- */
  async function helpCenter() {
    shell(el("div", { class: "page" },
      el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading Help Center…")));

    const tabsEl = el("div", { class: "help-tabs" });
    const notesEl = el("div", { class: "help-notes" });
    const progressEl = el("div", { class: "help-progress" });

    const wrap = el("div", { class: "page" },
      el("div", { class: "page-head" },
        el("h1", { class: "h2" }, "Help Center"),
        el("div", { class: "spacer" }),
        el("button", { class: "btn ghost sm", onclick: () => showShortcuts() }, "⌨ Shortcuts"),
        el("button", { class: "btn primary sm", onclick: startGettingStarted }, "▶ Start tour")),
      el("div", { class: "help-wrap" },
        el("div", {}, tabsEl, notesEl),
        progressEl));

    shell(wrap);

    // Load tabs + progress in parallel.
    try {
      [_guides] = await Promise.all([API.helpGuides()]);
      _guides = (_guides.guides || []).slice();
    } catch (err) {
      notesEl.replaceChildren(el("div", { class: "empty" }, "Could not load guides: " + esc(err.message)));
      return;
    }
    if (!_guides.length) {
      notesEl.replaceChildren(el("div", { class: "empty" }, "No guides available yet."));
    } else {
      renderTabs();
      _activeTab = _guides[0].key;
      await selectTab(_activeTab);
    }
    await refreshProgress();

    async function startGettingStarted() {
      let data;
      try { data = await API.helpTour("getting_started"); }
      catch (err) { return toast("Tour unavailable: " + err.message, "error"); }
      if (!data || !data.tour || !data.tour.steps || !data.tour.steps.length)
        return toast("No tour steps to show.", "error");
      startTour(data.tour);
    }
  }

  function renderTabs() {
    tabsEl.replaceChildren(..._guides.map((g) =>
      el("button", {
        class: "help-tab" + (g.key === _activeTab ? " active" : ""),
        onclick: () => { _activeTab = g.key; renderTabs(); selectTab(g.key); },
      }, g.label)));
  }

  async function selectTab(tab) {
    notesEl.replaceChildren(el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…"));
    let data;
    try { data = await API.helpGuide(tab); }
    catch (err) { notesEl.replaceChildren(el("div", { class: "empty" }, "Could not load this guide: " + esc(err.message))); return; }
    const notes = data.notes || [];
    if (!notes.length) { notesEl.replaceChildren(el("div", { class: "empty" }, "No notes in this guide yet.")); return; }
    notesEl.replaceChildren(...notes.map((n) =>
      el("article", { class: "help-note" },
        el("h3", {}, n.title),
        el("div", { class: "md", html: renderMarkdown(n.content || "") }))));
  }

  /* ----------------------------- onboarding tracker ----------------------------- */
  async function refreshProgress() {
    try { _progress = await API.helpProgress(); }
    catch (err) { progressEl.replaceChildren(el("div", { class: "empty" }, "Progress unavailable: " + esc(err.message))); return; }
    renderProgress();
  }

  function renderProgress() {
    const pr = _progress || { milestones: [], completed: [], total: 0 };
    const completed = pr.completed || [];
    const total = pr.total || (pr.milestones || []).length || 0;
    const pct = total ? Math.round((completed.length / total) * 100) : 0;

    const R = 26, C = 2 * Math.PI * R;
    const offset = C * (1 - pct / 100);

    const ring = el("div", { class: "help-ring" },
      el("svg", { width: "72", height: "72", viewBox: "0 0 72 72" },
        el("circle", { class: "ring-track", cx: "36", cy: "36", r: String(R), fill: "none", "stroke-width": "7" }),
        el("circle", { class: "ring-fill", cx: "36", cy: "36", r: String(R), fill: "none",
          "stroke-width": "7", "stroke-linecap": "round",
          "stroke-dasharray": String(C), "stroke-dashoffset": String(offset),
          transform: "rotate(-90 36 36)" }),
        el("text", { class: "ring-label", x: "36", y: "40", "text-anchor": "middle" }, pct + "%")),
      el("div", { class: "ring-text" },
        el("div", {}, el("b", {}, completed.length + " / " + total), " done"),
        el("div", { class: "muted" }, "Your onboarding progress")));

    const milestones = pr.milestones || [];
    const list = el("ul", { class: "help-checklist" });
    milestones.forEach((m) => {
      const done = completed.includes(m.key);
      list.appendChild(el("li", { class: done ? "done" : "", "data-key": m.key },
        el("span", { class: "help-check" }, done ? "✓" : ""),
        el("span", { class: "help-check-label" }, m.key.replace(/_/g, " ")),
        done ? null : el("button", { class: "btn ghost sm", onclick: () => markDone(m.key) }, "Mark done")));
    });

    progressEl.replaceChildren(
      el("h3", {}, "Your progress"),
      ring,
      list,
      el("div", { class: "help-actions" },
        el("button", { class: "btn primary sm", onclick: startGettingStarted }, "▶ Start tour")));
  }

  async function markDone(key) {
    try {
      await API.recordMilestone(key);
      await refreshProgress();
      toast("Milestone saved.");
    } catch (err) { toast(err.message, "error"); }
  }

  /* ----------------------------- shortcuts modal ----------------------------- */
  async function showShortcuts() {
    let data = { shortcuts: [] };
    try { data = await API.helpShortcuts(); } catch (_) {}
    const rows = (data.shortcuts || []).map((s) =>
      el("li", {}, el("kbd", {}, s.keys), el("span", { class: "help-check-label" }, s.description)));
    const body = el("div", {},
      rows.length ? el("ul", { class: "help-checklist" }, ...rows)
                  : el("div", { class: "empty" }, "No shortcuts defined."));
    H().openModal("Keyboard shortcuts", body, null);
  }

  /* ----------------------------- tour engine ----------------------------- */
  // startTour(tourDef): tourDef = {key, title, steps:[{selector,title,text,position}]}
  let _tour = null; // holds active tour DOM + state

  function startTour(tourDef) {
    if (!tourDef || !Array.isArray(tourDef.steps) || !tourDef.steps.length) return;
    endTour(); // ensure no double tour

    const scrim = el("div", { class: "tour-scrim" });
    const tooltip = el("div", { class: "tour-tooltip", role: "dialog", "aria-modal": "true",
      "aria-label": tourDef.title || "Tour" },
      el("h3", { class: "tour-title" }),
      el("div", { class: "tour-text" }),
      el("div", { class: "tour-foot" },
        el("span", { class: "tour-count" }),
        el("button", { class: "btn ghost sm tour-back", onclick: () => step(-1) }, "Back"),
        el("button", { class: "btn primary sm tour-next", onclick: () => step(1) }, "Next")));

    const milestoneKey = "completed_" + tourDef.key + "_tour";

    _tour = { tourDef, scrim, tooltip, idx: 0, highlight: null, milestoneKey };

    document.body.appendChild(scrim);
    document.body.appendChild(tooltip);
    _tour.onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); endTour(); } };
    document.addEventListener("keydown", _tour.onKey);
    scrim.addEventListener("click", (e) => { if (e.target === scrim) endTour(); });

    showStep(0);
  }

  function clearHighlight() {
    if (_tour && _tour.highlight) {
      const n = _tour.highlight;
      n.style.outline = _tour._outline || "";
      n.style.boxShadow = _tour._shadow || "";
      n.style.position = _tour._pos || "";
      n.style.zIndex = _tour._z || "";
      n.classList.remove("tour-highlight");
      _tour.highlight = null;
    }
  }

  function highlight(node) {
    clearHighlight();
    const s = node.style;
    _tour._outline = s.outline; _tour._shadow = s.boxShadow;
    _tour._pos = s.position; _tour._z = s.zIndex;
    node.classList.add("tour-highlight");
    _tour.highlight = node;
  }

  function showStep(i) {
    if (!_tour) return;
    const steps = _tour.tourDef.steps;
    _tour.idx = Math.max(0, Math.min(i, steps.length - 1));
    const step = steps[_tour.idx];

    // Resolve target + highlight
    clearHighlight();
    let target = step.selector ? document.querySelector(step.selector) : null;
    if (target) {
      target.scrollIntoView({ block: "center", inline: "center" });
      highlight(target);
    }

    // Fill content
    $(".tour-title", _tour.tooltip).textContent = step.title || _tour.tourDef.title || "Tip";
    $(".tour-text", _tour.tooltip).textContent = step.text || "";
    const count = $(".tour-count", _tour.tooltip);
    if (count) count.textContent = (_tour.idx + 1) + " / " + steps.length;
    const back = $(".tour-back", _tour.tooltip);
    const next = $(".tour-next", _tour.tooltip);
    if (back) back.style.visibility = _tour.idx === 0 ? "hidden" : "visible";
    if (next) next.textContent = _tour.idx === steps.length - 1 ? "Done" : "Next";

    // Position after layout
    requestAnimationFrame(() => positionTooltip(target, step.position));
  }

  function positionTooltip(target, position) {
    if (!_tour) return;
    const tip = _tour.tooltip;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 10;
    let top, left;
    if (!target) {
      top = Math.max(gap, (vh - th) / 2);
      left = Math.max(gap, (vw - tw) / 2);
    } else {
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const pos = (position || "top").toLowerCase();
      if (pos === "bottom") { top = r.bottom + gap; left = cx - tw / 2; }
      else if (pos === "left") { top = cy - th / 2; left = r.left - tw - gap; }
      else if (pos === "right") { top = cy - th / 2; left = r.right + gap; }
      else { top = r.top - th - gap; left = cx - tw / 2; } // top (default)
      // Clamp into viewport
      left = Math.max(gap, Math.min(left, vw - tw - gap));
      top = Math.max(gap, Math.min(top, vh - th - gap));
    }
    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  function step(dir) {
    if (!_tour) return;
    const last = _tour.tourDef.steps.length - 1;
    if (dir > 0 && _tour.idx === last) return finishTour();
    showStep(_tour.idx + dir);
  }

  function finishTour() {
    const key = _tour ? _tour.milestoneKey : null;
    endTour();
    if (key) API.recordMilestone(key).then(refreshProgress).catch(() => {});
  }

  function endTour() {
    if (!_tour) return;
    if (_tour.onKey) document.removeEventListener("keydown", _tour.onKey);
    clearHighlight();
    if (_tour.scrim) _tour.scrim.remove();
    if (_tour.tooltip) _tour.tooltip.remove();
    _tour = null;
  }

  /* ----------------------------- registration ----------------------------- */
  views.helpCenter = helpCenter;
  views.startTour = startTour;
})(window.OpsDesk = window.OpsDesk || { views: {} });
