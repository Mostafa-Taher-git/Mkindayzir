/* ==========================================================================
   OpsDesk Knowledge Base — Obsidian-style vault views.

   Routes (see app.js router):
     #/kb                 kbHome()      — landing + search
     #/kb/vault           kbVault()     — 3-pane folder/notes/backlinks
     #/kb/note/<id>       kbNote(id)    — full reader + versions + feedback
     #/kb/new             kbNew()       — split editor (create)
     #/kb/edit/<id>       kbEdit(id)    — split editor (edit)
     #/kb/graph           kbGraph()     — full-page force graph
     #/kb/manage          kbManage()    — folders + notes table
     #/kb/collections     kbCollections() — collections list/detail
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
  const fmtDate = (i) => H().fmtDate(i);
  const ago = (i) => H().ago(i);
  const shell = (inner) => H().shell(inner);
  const navigate = (h) => H().navigate(h);
  const openModal = (t, b, s) => H().openModal(t, b, s);
  const closeModal = () => H().closeModal();
  const confirmModal = (m, l, c) => H().confirmModal(m, l, c);
  const isAgent = () => H().isAgent();

  const seg = (i) => (location.hash.replace(/^#/, "").split("/").filter(Boolean)[i] || "").trim();

  /* ----------------------------- markdown ----------------------------- */
  function escapeHtml(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function safeUrl(u) {
    u = String(u).trim();
    if (/^(https?:|mailto:|#|\/)/i.test(u)) return u;
    return "#";
  }
  // Inline transforms. Input is raw (unescaped) markdown text; we escape
  // as we emit each text segment so user input can never inject HTML.
  function inline(text, titleToId) {
    if (!text) return "";
    // inline code first (protect contents)
    text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
    // wikilinks [[Title]] or [[Title|alias]]
    text = text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, title, alias) => {
      const t = title.trim();
      const id = titleToId && titleToId.get(t);
      const label = alias ? alias.trim() : t;
      if (id != null) return `<a href="#/kb/note/${id}" data-wikilink>${escapeHtml(label)}</a>`;
      return `<span data-wikilink data-missing title="Note not found: ${escapeHtml(t)}">${escapeHtml(label)}</span>`;
    });
    // standard links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      (_, t, u) => `<a href="${escapeHtml(safeUrl(u))}" target="_blank" rel="noopener">${escapeHtml(t)}</a>`);
    // bold then italic
    text = text.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${escapeHtml(c)}</strong>`);
    text = text.replace(/(^|[^*])\*([^*]+)\*/g, (_, pre, c) => `${pre}<em>${escapeHtml(c)}</em>`);
    text = text.replace(/(^|[^_])_([^_]+)_/g, (_, pre, c) => `${pre}<em>${escapeHtml(c)}</em>`);
    return text;
  }

  function renderMarkdown(src, titleToId) {
    if (!src) return "";
    const lines = String(src).split(/\r?\n/);
    let html = "", inCode = false, codeBuf = [], listType = null, listBuf = [];
    const flushList = () => {
      if (listType) {
        html += `<${listType}>` + listBuf.map((li) => `<li>${inline(li, titleToId)}</li>`).join("") + `</${listType}>`;
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
      if (m) { flushList(); const lvl = m[1].length; html += `<h${lvl}>${inline(m[2], titleToId)}</h${lvl}>`; continue; }
      if (/^(\s*[-*_]){3,}\s*$/.test(line)) { flushList(); html += "<hr>"; continue; }
      if (/^>\s?/.test(line)) { flushList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""), titleToId)}</blockquote>`; continue; }
      if (/^\s*[-*+]\s+/.test(line)) { if (listType && listType !== "ul") flushList(); listType = "ul"; listBuf.push(line.replace(/^\s*[-*+]\s+/, "")); continue; }
      if (/^\s*\d+\.\s+/.test(line)) { if (listType && listType !== "ol") flushList(); listType = "ol"; listBuf.push(line.replace(/^\s*\d+\.\s+/, "")); continue; }
      if (/^\s*$/.test(line)) { flushList(); continue; }
      flushList();
      html += `<p>${inline(line, titleToId)}</p>`;
    }
    if (inCode) html += `<pre class="md-code"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
    flushList();
    return html;
  }

  /* ----------------------------- title->id map ----------------------------- */
  let _titleMap = null;
  async function ensureTitleMap() {
    if (_titleMap) return _titleMap;
    _titleMap = new Map();
    try {
      // Prefer the note list (gives title+id); fall back to tree if needed.
      const data = await API.listKbNotes({ per_page: 1000 });
      (data.notes || []).forEach((n) => { if (n.title) _titleMap.set(n.title, n.id); });
    } catch (_) {}
    if (!_titleMap.size) {
      try {
        const tree = await API.kbTree();
        collectTitles(tree, _titleMap);
      } catch (_) {}
    }
    return _titleMap;
  }
  function collectTitles(node, map) {
    if (!node) return;
    const folders = node.tree || node.folders || (Array.isArray(node) ? node : null);
    const arr = Array.isArray(folders) ? folders : (node.folders || []);
    arr.forEach((f) => {
      (f.notes || []).forEach((n) => { if (n.title) map.set(n.title, n.id); });
      collectTitles(f, map);
    });
  }

  /* ----------------------------- tree helpers ----------------------------- */
  // Normalize kbTree() response into a nested folder list.
  function normalizeTree(raw) {
    if (!raw) return [];
    const src = raw.tree || raw.folders || (Array.isArray(raw) ? raw : null);
    if (!Array.isArray(src)) return [];
    // If nodes already have children, use as-is; else build from flat list.
    if (src.some((f) => f.children)) return src;
    const byId = new Map();
    src.forEach((f) => byId.set(f.id, Object.assign({ children: [] }, f)));
    const roots = [];
    byId.forEach((f) => {
      if (f.parent_id != null && byId.has(f.parent_id)) byId.get(f.parent_id).children.push(f);
      else roots.push(f);
    });
    return roots;
  }

  /* ============================= home ============================= */
  async function kbHome() {
    const wrap = el("div", { class: "page kb-home" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Knowledge Base")),
      el("div", { class: "kb-search" },
        el("input", { id: "kb-q", type: "text", placeholder: "Search the vault…", "aria-label": "Search knowledge base",
          oninput: debounce(onSearch, 250) })),
      el("div", { class: "kb-cards" },
        card("📂", "Vault Explorer", "Browse folders and notes.", "/kb/vault"),
        card("🕸️", "Graph View", "Explore how notes connect.", "/kb/graph"),
        card("✍️", "Manage Notes", "Folders, drafts and publishing.", "/kb/manage"),
        card("📚", "Collections", "Curated reading lists.", "/kb/collections"),
        card("➕", "New Note", "Write a new knowledge note.", "/kb/new")));

    function card(ic, title, desc, href) {
      return el("a", { class: "kb-card", href: "#" + href, onclick: (e) => { e.preventDefault(); navigate(href); } },
        el("div", { class: "ic" }, ic), el("h3", {}, title), el("p", {}, desc));
    }
    async function onSearch() {
      const q = $("#kb-q").value.trim();
      const box = $("#kb-suggest");
      if (box) box.remove();
      if (!q) return;
      let res = { suggestions: [] };
      try { res = await API.kbSuggest(q); } catch (_) {}
      const sug = res.suggestions || [];
      if (!sug.length) return;
      const pop = el("div", { class: "kb-suggest", id: "kb-suggest" },
        ...sug.map((s) => el("a", { href: "#/kb/note/" + s.id, onclick: (e) => { e.preventDefault(); navigate("/kb/note/" + s.id); } },
          s.title, s.category_name ? el("span", { class: "muted" }, " · " + s.category_name) : null)));
      $(".kb-search").appendChild(pop);
    }

    shell(wrap);
  }

  /* ============================= vault ============================= */
  async function kbVault() {
    shell(el("div", { class: "page" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading vault…")));
    let folders = [];
    try { folders = normalizeTree(await API.kbTree()); } catch (err) { return shell(errPage(err.message)); }

    let activeFolder = null;
    let selectedNote = null;

    const treeEl = el("div", { class: "kb-pane" }, el("h4", {}, "Folders"));
    const listEl = el("div", { class: "kb-pane" });
    const readerEl = el("div", { class: "kb-pane" });

    function renderTree() {
      const ul = el("ul", { class: "kb-tree" }, ...folders.map((f) => folderNode(f, 0)));
      treeEl.replaceChildren(el("h4", {}, "Folders"), ul);
    }
    function folderNode(f, depth) {
      const hasKids = f.children && f.children.length;
      const item = el("div", { class: "kb-tree-item" + (activeFolder === f.id ? " active" : "") },
        el("span", { class: "kb-tree-toggle" }, hasKids ? "▾" : ""),
        el("span", {}, "📁"),
        el("span", { class: "name" }, f.name + (f.note_count != null ? ` (${f.note_count})` : "")));
      item.querySelector(".name").onclick = () => { activeFolder = f.id; renderTree(); loadNotes(); };
      const li = el("li", {}, item);
      if (hasKids) li.appendChild(el("ul", { class: "kb-tree" }, ...f.children.map((c) => folderNode(c, depth + 1))));
      return li;
    }

    async function loadNotes() {
      let notes = [];
      try { notes = (await API.listKbNotes(activeFolder != null ? { folder_id: activeFolder } : {})).notes || []; }
      catch (err) { listEl.replaceChildren(errPage(err.message)); return; }
      if (!notes.length) { listEl.replaceChildren(el("h4", {}, "Notes"), el("div", { class: "empty" }, "No notes here.")); return; }
      listEl.replaceChildren(el("h4", {}, "Notes"),
        el("ul", { class: "kb-note-list" },
          ...notes.map((n) => el("li", { onclick: () => openNote(n) },
            el("div", {}, n.title),
            el("div", { class: "meta" }, (n.status || "draft") + " · " + ago(n.updated_at))))));
    }

    async function openNote(n) {
      selectedNote = n;
      readerEl.replaceChildren(el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…"));
      let note = n, local = { nodes: [], edges: [] };
      try {
        const [g, l] = await Promise.all([API.getKbNote(n.id), API.kbLocalGraph(n.id)]);
        note = g.note || n;
        local = l || { nodes: [], edges: [] };
      } catch (_) {}
      const map = await ensureTitleMap();
      readerEl.replaceChildren(
        el("div", { class: "kb-reader" },
          el("h3", {}, note.title),
          el("div", { class: "md", html: renderMarkdown(note.body || "", map) }),
          el("div", { class: "kb-toolbar" },
            el("button", { class: "btn ghost sm", onclick: () => navigate("/kb/edit/" + note.id) }, "Edit"),
            isAgent() ? el("button", { class: "btn ghost sm", onclick: () => publish(note) }, "Publish") : null,
            el("button", { class: "btn ghost sm", onclick: () => navigate("/kb/note/" + note.id) }, "Open full"))),
        el("div", { class: "kb-backlinks" },
          el("h4", {}, "Backlinks"),
          backlinksList(local),
          el("h4", {}, "Local graph"),
          el("canvas", { class: "kb-minigraph", id: "kb-minigraph" })));
      const cv = $("#kb-minigraph");
      if (cv && OD.graph) {
        OD.graph.renderLocalGraph(cv, local.nodes || [], local.edges || [],
          { onSelect: (id) => navigate("/kb/note/" + id) });
      }
    }

    function backlinksList(local) {
      const inbound = (local.edges || []).filter((e) => e.target === selectedNote.id).map((e) => e.source);
      if (!inbound.length) return el("div", { class: "muted" }, "No backlinks yet.");
      return el("ul", {}, ...inbound.map((id) => {
        const node = (local.nodes || []).find((n) => n.id === id) || { id, title: "Note " + id };
        return el("li", {}, el("a", { href: "#/kb/note/" + node.id, onclick: (e) => { e.preventDefault(); navigate("/kb/note/" + node.id); } }, node.title));
      }));
    }

    async function publish(n) {
      try { await API.publishKbNote(n.id); toast("Published."); openNote(n); }
      catch (err) { toast(err.message, "error"); }
    }

    renderTree();
    loadNotes();
    shell(el("div", { class: "page" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Vault Explorer"),
        el("div", { class: "spacer" }), el("button", { class: "btn primary sm", onclick: () => navigate("/kb/new") }, "New Note")),
      el("div", { class: "kb-vault" }, treeEl, listEl, readerEl)));
  }

  /* ============================= note reader ============================= */
  async function kbNote() {
    const id = Number(seg(2));
    if (!id) return navigate("/kb/vault");
    shell(el("div", { class: "page kb-note" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading note…")));
    let note, local = { nodes: [], edges: [] };
    try {
      const [g, l] = await Promise.all([API.getKbNote(id), API.kbLocalGraph(id).catch(() => ({ nodes: [], edges: [] }))]);
      note = g.note; local = l || { nodes: [], edges: [] };
    } catch (err) { return shell(errPage(err.message)); }
    const map = await ensureTitleMap();

    const body = el("div", { class: "page kb-note" },
      el("button", { class: "btn ghost sm", onclick: () => navigate("/kb/vault") }, "← Vault"),
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, note.title),
        el("div", { class: "spacer" }),
        note.status === "published" ? el("span", { class: "badge-published" }, "Published") : el("span", { class: "badge-draft" }, "Draft")),
      el("div", { class: "kb-toolbar" },
        el("button", { class: "btn ghost sm", onclick: () => navigate("/kb/edit/" + note.id) }, "✏ Edit"),
        isAgent() ? el("button", { class: "btn secondary sm", onclick: () => doPublish(note) }, note.status === "published" ? "Republish" : "Publish") : null,
        isAgent() ? el("button", { class: "btn danger sm", onclick: () => doDelete(note) }, "🗑 Delete") : null),
      el("div", { class: "md", html: renderMarkdown(note.body || "", map) }),
      el("div", { class: "kb-feedback" },
        el("span", { class: "label" }, "Was this helpful?"),
        el("button", { class: "btn ghost sm", onclick: () => feedback(true) }, "👍 Yes"),
        el("button", { class: "btn ghost sm", onclick: () => feedback(false) }, "👎 No")),
      el("div", { class: "mt-6" },
        el("button", { class: "btn ghost sm", onclick: () => versionModal(note) }, "🕑 Version history"),
        el("h3", { class: "h3 mt-4" }, "Backlinks"),
        backlinksPanel(note, local),
        OD.renderEntityLinks ? OD.renderEntityLinks("kb_note", note.id) : null));

    async function doPublish(n) {
      try { await API.publishKbNote(n.id); toast("Published."); kbNote(); }
      catch (err) { toast(err.message, "error"); }
    }
    async function doDelete(n) {
      const ok = await confirmModal("Delete this note permanently?", "Delete", "btn danger sm");
      if (!ok) return;
      try { await API.deleteKbNote(n.id); toast("Deleted."); navigate("/kb/manage"); }
      catch (err) { toast(err.message, "error"); }
    }
    async function feedback(helpful) {
      try { await API.kbNoteFeedback(note.id, helpful); toast("Thanks for the feedback!"); }
      catch (err) { toast(err.message, "error"); }
    }
    shell(body);
  }

  function backlinksPanel(note, local) {
    const inbound = (local.edges || []).filter((e) => e.target === note.id).map((e) => e.source);
    if (!inbound.length) return el("div", { class: "muted" }, "No backlinks yet.");
    return el("ul", {}, ...inbound.map((id) => {
      const node = (local.nodes || []).find((n) => n.id === id) || { id, title: "Note " + id };
      return el("li", {}, el("a", { href: "#/kb/note/" + node.id, onclick: (e) => { e.preventDefault(); navigate("/kb/note/" + node.id); } }, node.title));
    }));
  }

  async function versionModal(note) {
    let data;
    try { data = await API.kbNoteVersions(note.id); } catch (err) { return toast(err.message, "error"); }
    const versions = data.versions || [];
    openModal("Version history · " + note.title, el("div", {},
      versions.length ? el("ul", { class: "kb-coll-notes" },
        ...versions.map((v) => el("li", {},
          el("div", { class: "flex1" }, `v${v.version} · ${v.author_name || "unknown"} · ${fmtDate(v.created_at)}`),
          el("button", { class: "btn ghost sm", onclick: () => diffModal(note, v) }, "Diff vs current")))) :
        el("div", { class: "empty" }, "No previous versions.")), null);
  }

  async function diffModal(note, v) {
    let data;
    try { data = await API.kbNoteVersionDiff(note.id, v.id); } catch (err) { return toast(err.message, "error"); }
    const diff = data.diff || data.text || JSON.stringify(data, null, 2);
    openModal(`Diff · v${v.version}`, el("div", {},
      el("pre", { class: "md-code", style: "white-space:pre-wrap;max-height:50vh;overflow:auto" }, diff)), null);
  }

  /* ============================= editor ============================= */
  function kbNew() { return editorView(null); }
  function kbEdit() { return editorView(Number(seg(2))); }

  async function editorView(editId) {
    shell(el("div", { class: "page" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading editor…")));
    let folders = [];
    try { folders = normalizeTree(await API.kbTree()); } catch (_) {}
    let existing = null;
    if (editId) { try { existing = (await API.getKbNote(editId)).note; } catch (_) {} }

    const titleInput = el("input", { id: "kb-title", class: "sm grow", placeholder: "Note title", value: existing ? existing.title : "" });
    const folderSel = el("select", { id: "kb-folder" }, el("option", { value: "" }, "No folder"),
      ...flattenFolders(folders).map((f) => el("option", { value: f.id, selected: existing && existing.folder_id === f.id ? "" : null }, f.name)));
    const tagsInput = el("input", { id: "kb-tags", class: "sm grow", placeholder: "tags, comma, separated", value: existing && existing.tags ? existing.tags.join(", ") : "" });
    const ta = el("textarea", { id: "kb-body", "aria-label": "Note body (markdown)" }, existing ? existing.body || "" : "");
    const preview = el("div", { class: "preview md" });

    function rerender() {
      ensureTitleMap().then((map) => { preview.innerHTML = renderMarkdown(ta.value, map); });
    }
    ta.addEventListener("input", rerender);
    rerender();

    const wrap = el("div", { class: "page" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, editId ? "Edit Note" : "New Note"),
        el("div", { class: "spacer" }),
        el("button", { class: "btn ghost sm", onclick: () => navigate("/kb/vault") }, "Cancel"),
        el("button", { class: "btn primary sm", onclick: save }, "Save")),
      el("div", { class: "row wrap mb-3" }, titleInput, folderSel, tagsInput,
        el("button", { class: "btn ghost sm", onclick: () => wikilinkPopup(ta, preview) }, "[[ Wikilink")),
      el("div", { class: "kb-editor-bar" },
        b("B", "**", "**"), b("I", "*", "*"), b("H", "## ", ""), b("`", "`", "`"), b("Link", "[", "](https://)")),
      el("div", { class: "kb-editor" }, ta, preview));

    function b(label, pre, post) {
      return el("button", { class: "btn ghost sm", onclick: () => wrapMarkdown(ta, pre, post) }, label);
    }
    shell(wrap);

    async function save() {
      const title = titleInput.value.trim();
      if (!title) { toast("Title is required.", "error"); return; }
      const payload = {
        title,
        body: ta.value,
        folder_id: folderSel.value ? Number(folderSel.value) : null,
        tags: tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean),
      };
      try {
        if (editId) { await API.updateKbNote(editId, payload); toast("Saved."); navigate("/kb/note/" + editId); }
        else { const r = await API.createKbNote(payload); toast("Created."); navigate("/kb/note/" + (r.note ? r.note.id : r.id)); }
      } catch (err) { toast(err.message, "error"); }
    }
  }

  function flattenFolders(folders, out) {
    out = out || [];
    folders.forEach((f) => { out.push(f); if (f.children) flattenFolders(f.children, out); });
    return out;
  }

  function wrapMarkdown(ta, pre, post) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || "text";
    ta.value = ta.value.slice(0, s) + pre + sel + post + ta.value.slice(e);
    ta.dispatchEvent(new Event("input"));
    ta.focus();
  }

  // [[ wikilink autocomplete: fetches note titles and inserts [[Title]]
  async function wikilinkPopup(ta, preview) {
    const existing = await ensureTitleMap();
    const pop = el("div", { class: "wikilink-pop" });
    const input = el("input", { class: "sm grow", placeholder: "Find a note…", style: "margin:6px" });
    pop.appendChild(input);
    const list = el("div", {});
    pop.appendChild(list);
    document.body.appendChild(pop);
    const rect = ta.getBoundingClientRect();
    pop.style.left = rect.left + "px";
    pop.style.top = (rect.top + 28) + "px";
    const titles = [...existing.keys()];
    function render(q) {
      list.replaceChildren(...titles.filter((t) => t.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
        .map((t) => el("div", { onclick: () => insert(t) }, t)));
    }
    function insert(t) {
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + "[[" + t + "]]" + ta.value.slice(s);
      ta.dispatchEvent(new Event("input"));
      pop.remove();
      ta.focus();
    }
    input.addEventListener("input", () => render(input.value));
    render("");
    input.focus();
    setTimeout(() => document.addEventListener("click", function close(ev) {
      if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener("click", close); }
    }), 0);
  }

  /* ============================= graph ============================= */
  async function kbGraph() {
    shell(el("div", { class: "page" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading graph…")));
    let graph, folders = [], tags = [];
    try {
      [graph, folders, tags] = await Promise.all([
        API.kbGraph(), API.kbTree().catch(() => null), API.kbTags().catch(() => ({ tags: [] })),
      ]);
    } catch (err) { return shell(errPage(err.message)); }
    const nodes = graph.nodes || [], edges = graph.edges || [];
    const tagList = Array.isArray(tags) ? tags : (tags.tags || []);

    const search = el("input", { type: "text", placeholder: "Highlight…", "aria-label": "Highlight term",
      oninput: debounce(() => rerender(), 200) });
    const folderSel = el("select", { "aria-label": "Folder filter", onchange: () => rerender() },
      el("option", { value: "" }, "All folders"),
      ...flattenFolders(normalizeTree(folders)).map((f) => el("option", { value: f.id }, f.name)));
    const tagSel = el("select", { "aria-label": "Tag filter", onchange: () => rerender() },
      el("option", { value: "" }, "All tags"),
      ...tagList.map((t) => el("option", { value: t }, t)));
    const legend = el("div", { class: "kb-legend" });

    const canvas = el("canvas", { class: "kb-graph-canvas" });
    shell(el("div", { class: "page" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Knowledge Graph"),
        el("div", { class: "spacer" }), el("span", { class: "muted" }, nodes.length + " notes")),
      el("div", { class: "kb-graph-wrap" },
        el("div", { class: "kb-graph-controls" }, search, folderSel, tagSel, legend),
        canvas)));

    function rerender() {
      const opts = {
        onSelect: (id) => navigate("/kb/note/" + id),
        highlightTerm: search.value.trim() || null,
        folderFilter: folderSel.value ? Number(folderSel.value) : null,
        tagFilter: tagSel.value || null,
      };
      if (OD.graph) OD.graph.renderGraph(canvas, nodes, edges, opts);
      // legend: unique folders present
      const seen = new Map();
      nodes.forEach((n) => { const k = n.folder_id != null ? n.folder_id : "none"; if (!seen.has(k)) seen.set(k, n._color); });
      legend.replaceChildren(...[...seen.entries()].slice(0, 12).map(([k, c]) =>
        el("span", {}, el("span", { class: "swatch", style: `background:${c}` }), k === "none" ? "Unfiled" : "Folder " + k)));
    }
    rerender();
  }

  /* ============================= manage ============================= */
  async function kbManage() {
    shell(el("div", { class: "page" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    let folders = [], notes = [];
    try {
      [folders, notes] = await Promise.all([API.kbTree(), API.listKbNotes({ per_page: 1000 })]);
      folders = normalizeTree(folders);
      notes = notes.notes || [];
    } catch (err) { return shell(errPage(err.message)); }

    const folderPane = el("div", { class: "kb-pane" });
    const tablePane = el("div", { class: "kb-pane" });

    function renderFolders() {
      folderPane.replaceChildren(
        el("h4", {}, "Folders"),
        el("button", { class: "btn primary sm mb-3", onclick: newFolderModal }, "＋ New folder"),
        el("ul", { class: "kb-folder-tree" }, ...folders.map((f) => folderNode(f))));
    }
    function folderNode(f) {
      const item = el("div", { class: "kb-folder-item" },
        el("span", { class: "name" }, "📁 " + f.name),
        el("span", { class: "acts" },
          el("button", { class: "btn ghost sm", title: "Rename", onclick: () => renameFolder(f) }, "✎"),
          el("button", { class: "btn danger sm", title: "Delete", onclick: () => deleteFolder(f) }, "🗑")));
      const li = el("li", {}, item);
      if (f.children && f.children.length) li.appendChild(el("ul", { class: "kb-folder-tree" }, ...f.children.map((c) => folderNode(c))));
      return li;
    }

    function renderTable() {
      if (!notes.length) { tablePane.replaceChildren(el("h4", {}, "Notes"), el("div", { class: "empty" }, "No notes.")); return; }
      tablePane.replaceChildren(el("h4", {}, "Notes (" + notes.length + ")"),
        el("table", { class: "kb-notes-table" },
          el("thead", {}, el("tr", {}, el("th", {}, "Title"), el("th", {}, "Folder"), el("th", {}, "Status"), el("th", {}, "Updated"), el("th", {}, ""))),
          el("tbody", {}, ...notes.map((n) => el("tr", {},
            el("td", {}, el("a", { href: "#/kb/note/" + n.id, onclick: (e) => { e.preventDefault(); navigate("/kb/note/" + n.id); } }, n.title)),
            el("td", {}, n.folder_name || "—"),
            el("td", {}, n.status === "published" ? el("span", { class: "badge-published" }, "Published") : el("span", { class: "badge-draft" }, "Draft")),
            el("td", {}, ago(n.updated_at)),
            el("td", {}, el("a", { class: "btn ghost sm", href: "#/kb/edit/" + n.id, onclick: (e) => { e.preventDefault(); navigate("/kb/edit/" + n.id); } }, "Edit")))))));
    }

    async function newFolderModal() {
      openModal("New folder", el("div", {},
        el("label", { class: "field" }, el("span", { class: "label" }, "Name"), el("input", { id: "ff-name" })),
        el("label", { class: "field" }, el("span", { class: "label" }, "Parent"),
          el("select", { id: "ff-parent" }, el("option", { value: "" }, "Root"),
            ...flattenFolders(folders).map((f) => el("option", { value: f.id }, f.name))))), async () => {
        const name = $("#ff-name").value.trim();
        if (!name) { toast("Name required.", "error"); return false; }
        try { await API.createFolder({ name, parent_id: $("#ff-parent").value ? Number($("#ff-parent").value) : null }); toast("Folder created."); await reload(); return true; }
        catch (err) { toast(err.message, "error"); return false; }
      });
    }
    async function renameFolder(f) {
      openModal("Rename folder", el("div", {},
        el("label", { class: "field" }, el("span", { class: "label" }, "Name"), el("input", { id: "fr-name", value: f.name }))), async () => {
        const name = $("#fr-name").value.trim();
        if (!name) { toast("Name required.", "error"); return false; }
        try { await API.updateFolder(f.id, { name }); toast("Renamed."); await reload(); return true; }
        catch (err) { toast(err.message, "error"); return false; }
      });
    }
    async function deleteFolder(f) {
      const ok = await confirmModal(`Delete folder "${f.name}"? Notes inside are not deleted but become unfiled.`, "Delete", "btn danger sm");
      if (!ok) return;
      try { await API.deleteFolder(f.id); toast("Folder deleted."); await reload(); }
      catch (err) { toast(err.message, "error"); }
    }
    async function reload() {
      const [f, n] = await Promise.all([API.kbTree(), API.listKbNotes({ per_page: 1000 })]);
      folders = normalizeTree(f); notes = n.notes || [];
      renderFolders(); renderTable();
    }

    renderFolders(); renderTable();
    shell(el("div", { class: "page" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Manage Notes"),
        el("div", { class: "spacer" }), el("button", { class: "btn primary sm", onclick: () => navigate("/kb/new") }, "＋ New Note")),
      el("div", { class: "kb-manage" }, folderPane, tablePane)));
  }

  /* ============================= collections ============================= */
  async function kbCollections() {
    const cid = Number(seg(2));
    shell(el("div", { class: "page" }, el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…")));
    let collections = [];
    try { collections = (await API.listKbCollections()).collections || []; } catch (err) { return shell(errPage(err.message)); }

    const listEl = el("div", { class: "kb-pane" });
    const detailEl = el("div", { class: "kb-pane" });

    function renderList() {
      listEl.replaceChildren(el("h4", {}, "Collections"),
        el("button", { class: "btn primary sm mb-3", onclick: newCollModal }, "＋ New collection"),
        el("ul", { class: "kb-coll-list" },
          ...collections.map((c) => el("li", { class: cid === c.id ? "active" : "", onclick: () => navigate("/kb/collections/" + c.id) },
            el("span", { class: "flex1" }, c.name), el("span", { class: "muted" }, (c.note_count != null ? c.note_count : "") + "")))));
    }

    async function renderDetail() {
      const coll = collections.find((c) => c.id === cid);
      if (!coll) { detailEl.replaceChildren(el("div", { class: "empty" }, "Select a collection.")); return; }
      let data;
      try { data = await API.listKbCollectionNotes(cid); } catch (err) { return detailEl.replaceChildren(errPage(err.message)); }
      const notes = data.notes || [];
      detailEl.replaceChildren(el("h4", {}, coll.name),
        el("div", { class: "row mb-3" },
          el("input", { id: "coll-add", class: "sm grow", placeholder: "Note id to add…", "aria-label": "Note id" }),
          el("button", { class: "btn primary sm", onclick: addNote }, "Add")),
        notes.length ? el("ul", { class: "kb-coll-notes" },
          ...notes.map((n) => el("li", {},
            el("a", { class: "flex1", href: "#/kb/note/" + n.id, onclick: (e) => { e.preventDefault(); navigate("/kb/note/" + n.id); } }, n.title),
            el("button", { class: "btn danger sm", onclick: () => removeNote(n.id) }, "Remove")))) :
          el("div", { class: "empty" }, "No notes in this collection."));
    }

    async function addNote() {
      const v = $("#coll-add").value.trim();
      if (!v) return;
      try { await API.addKbCollectionNote(cid, { note_id: Number(v) }); toast("Added."); await reload(); }
      catch (err) { toast(err.message, "error"); }
    }
    async function removeNote(nid) {
      try { await API.removeKbCollectionNote(cid, nid); toast("Removed."); await reload(); }
      catch (err) { toast(err.message, "error"); }
    }
    function newCollModal() {
      openModal("New collection", el("div", {},
        el("label", { class: "field" }, el("span", { class: "label" }, "Name"), el("input", { id: "coll-name" }))), async () => {
        const name = $("#coll-name").value.trim();
        if (!name) { toast("Name required.", "error"); return false; }
        try { const r = await API.createKbCollection({ name }); toast("Created."); navigate("/kb/collections/" + (r.collection ? r.collection.id : r.id)); return true; }
        catch (err) { toast(err.message, "error"); return false; }
      });
    }
    async function reload() {
      collections = (await API.listKbCollections()).collections || [];
      renderList(); await renderDetail();
    }

    renderList(); await renderDetail();
    shell(el("div", { class: "page" },
      el("div", { class: "page-head" }, el("h1", { class: "h2" }, "Collections")),
      el("div", { class: "kb-collections" }, listEl, detailEl)));
  }

  /* ----------------------------- shared ----------------------------- */
  function errPage(msg) {
    return el("div", { class: "page" }, el("div", { class: "empty" }, "Error: ", msg));
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  views.kbHome = kbHome;
  views.kbVault = kbVault;
  views.kbNote = kbNote;
  views.kbNew = kbNew;
  views.kbEdit = kbEdit;
  views.kbGraph = kbGraph;
  views.kbManage = kbManage;
  views.kbCollections = kbCollections;
})(window.OpsDesk = window.OpsDesk || { views: {} });
