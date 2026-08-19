/* ==========================================================================
   OpsDesk AI Chat — Phase 4A (AI Chat Core).

   Routes (see app.js router):
     #/ai               aiChat()           — conversation list + thread
     #/ai/<id>          aiChatSession(id)  — open directly into a conversation
     AI Copilot drawer: OD.views.openAiDrawer() — slide-over mini chat (Ctrl/Cmd+J)

   Streaming: POST message via API.aiChatStream(convId, message), read the
   SSE body (text/event-stream) with a reader + TextDecoder, accumulate `data: `
   lines, parse JSON, and for type:"chunk" append text to the assistant bubble.

   Backend contract (handled here):
     GET  /api/ai/conversations              -> {conversations:[{id,title,created_at,updated_at}],...}
     POST /api/ai/conversations              -> 201 {conversation}
     DELETE /api/ai/conversations/<id>       -> {ok}
     GET  /api/ai/conversations/<id>/messages -> {messages:[{id,role,content,tool_name,tool_args,tool_status,...}]}
     POST /api/ai/chat/<id>                  -> SSE {type:"chunk"|"done"|"error"} (or JSON 503/429)
     GET  /api/ai/models                     -> {models:[{id,label}]}
     GET  /api/ai/usage                      -> {tokens_prompt,tokens_completion,cost_usd,messages,conversations}
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
  const fmtDate = (i) => H().fmtDate(i);
  const ago = (i) => H().ago(i);
  const shell = (inner) => H().shell(inner);
  const navigate = (h) => H().navigate(h);

  const seg = (i) => (location.hash.replace(/^#/, "").split("/").filter(Boolean)[i] || "").trim();

  /* ----------------------------- markdown ----------------------------- */
  // Self-contained markdown renderer (mirrors kb.js). Escapes HTML as it emits
  // every text segment so user/AI content can never inject markup (XSS-safe).
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

  // Render markdown into a (reused) bubble element's innerHTML.
  function setBubbleMD(node, src) {
    node.innerHTML = renderMarkdown(src);
  }

  /* ----------------------------- SSE reader ----------------------------- */
  // Reads the streaming Response. Calls handlers as events arrive.
  // onChunk(text), onDone(), onError(message), onNonStream(status, jsonBody)
  async function readStream(response, handlers) {
    if (response.status !== 200) {
      let body = {};
      try { body = await response.json(); } catch (_) {}
      if (handlers.onNonStream) handlers.onNonStream(response.status, body);
      return;
    }
    if (!response.body || !response.body.getReader) {
      let body = {};
      try { body = await response.json(); } catch (_) {}
      if (body && body.error) { if (handlers.onError) handlers.onError(body.error); }
      else if (handlers.onError) handlers.onError("Unexpected response from AI service.");
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line; each frame is "data: <json>\n".
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = frame.split("\n").filter((l) => l.startsWith("data:"));
          for (const dl of dataLines) {
            const payload = dl.slice(5).trim();
            if (!payload) continue;
            let ev;
            try { ev = JSON.parse(payload); } catch (_) { continue; }
            handleEvent(ev, handlers);
          }
        }
      }
      // Flush any trailing frame without a blank line (some servers omit it).
      const trailing = buf.trim();
      if (trailing.startsWith("data:")) {
        const payload = trailing.slice(5).trim();
        if (payload) { try { handleEvent(JSON.parse(payload), handlers); } catch (_) {} }
      }
    } catch (err) {
      if (handlers.onError) handlers.onError("Stream interrupted: " + (err.message || "connection lost"));
    }
  }
  function handleEvent(ev, handlers) {
    if (!ev || !ev.type) return;
    if (ev.type === "chunk") { if (handlers.onChunk) handlers.onChunk(ev.text || ""); }
    else if (ev.type === "tool_call") { if (handlers.onToolCall) handlers.onToolCall(ev); }
    else if (ev.type === "tool_result") { if (handlers.onToolResult) handlers.onToolResult(ev); }
    else if (ev.type === "done") {
      if (ev.awaiting_confirmation) { if (handlers.onAwaitingConfirmation) handlers.onAwaitingConfirmation(ev); }
      else { if (handlers.onDone) handlers.onDone(ev); }
    }
    else if (ev.type === "error") { if (handlers.onError) handlers.onError(ev.message || "AI error"); }
  }

  /* ----------------------------- shared chat controller ----------------------------- */
  // Builds the message thread + composer for a container. Used by BOTH the
  // full page view and the slide-over drawer.
  function buildChat(container, opts) {
    opts = opts || {};
    const compact = !!opts.compact;
    let convId = opts.convId || null;
    let busy = false;

    let header = null;
    if (!compact) {
      header = el("div", { class: "ai-thread-head" },
        el("div", { class: "ai-model-wrap" },
          el("span", { class: "label" }, "Model"),
          el("select", { id: "ai-model", class: "sm", "aria-label": "Model" }, el("option", {}, "Loading…"))),
        el("div", { class: "ai-usage muted" }, ""));
      container.appendChild(header);
    }

    const thread = el("div", { class: "ai-thread" + (compact ? " compact" : "") });
    const emptyState = el("div", { class: "ai-empty" },
      el("div", { class: "ai-empty-ic" }, "🤖"),
      el("h3", {}, "Ask the AI Copilot"),
      el("p", { class: "muted" }, "Summarize tickets, draft replies, or brainstorm a fix. Your history is saved per conversation."));
    container.appendChild(thread);

    const composer = el("div", { class: "ai-composer" });
    const ta = el("textarea", { class: "ai-input", rows: compact ? 2 : 3,
      placeholder: "Message the AI…  (Enter to send, Shift+Enter for newline)", "aria-label": "Message the AI" });
    const sendBtn = el("button", { class: "btn primary", onclick: send }, compact ? "➤" : "Send");
    composer.appendChild(el("div", { class: "ai-composer-row" }, ta, sendBtn));
    container.appendChild(composer);

    if (!convId) thread.replaceChildren(emptyState);
    if (!compact) { loadModels(); loadUsage(); }

    function renderEmpty() { thread.replaceChildren(emptyState); }

    async function loadModels() {
      try {
        const data = await API.aiModels();
        const sel = $("#ai-model");
        if (!sel) return;
        sel.replaceChildren(...(data.models || []).map((m) =>
          el("option", { value: m.id, selected: m.id === (data.current || m.id) ? "" : null }, m.label)));
      } catch (_) { /* non-critical */ }
    }
    async function loadUsage() {
      try {
        const u = await API.aiUsage();
        const box = $(".ai-usage");
        if (!box) return;
        const cost = typeof u.cost_usd === "number" ? "$" + u.cost_usd.toFixed(4) : "—";
        box.textContent = `Messages ${u.messages || 0} · Tokens ${(u.tokens_prompt || 0) + (u.tokens_completion || 0)} · ${cost}`;
      } catch (_) { /* non-critical */ }
    }

    function scrollDown() { thread.scrollTop = thread.scrollHeight; }

    function addBubble(role) {
      const bubble = el("div", { class: "ai-bubble " + role });
      const body = el("div", { class: "md" });
      bubble.appendChild(body);
      thread.appendChild(bubble);
      scrollDown();
      return { bubble, body };
    }
    function userBubble(text) {
      const { bubble, body } = addBubble("user");
      setBubbleMD(body, text);
    }
    function sysMsg(text, isError) {
      thread.appendChild(el("div", { class: "ai-system" + (isError ? " error" : "") }, text));
      scrollDown();
    }

    // ---- tool confirmation helpers (Phase 4B) ----
    function statusLabel(status) {
      switch (status) {
        case "approved": return "✓ Approved";
        case "rejected": return "✕ Rejected";
        case "executed": return "✅ Executed";
        case "pending":  return "⏳ Pending";
        default:         return status || "⏳ Pending";
      }
    }

    function toolArgsToJson(args) {
      let val = args;
      if (val && typeof val !== "object") val = { value: val };
      try { return JSON.stringify(val == null ? {} : val, null, 2); }
      catch (_) { return String(val == null ? "" : val); }
    }

    function buildToolCard(opts) {
      opts = opts || {};
      const card = el("div", {
        class: "tool-card",
        "data-msg-id": opts.msgId != null ? String(opts.msgId) : "",
        "data-status": opts.status || "pending",
      });
      card.appendChild(el("div", { class: "tool-card__title" },
        "🔧 AI wants to run: ", el("strong", {}, opts.name || "tool")));
      card.appendChild(el("pre", { class: "tool-card__args" }, toolArgsToJson(opts.args)));
      const actions = el("div", { class: "tool-card__actions" });
      if (opts.interactive) {
        actions.appendChild(el("button", { class: "btn primary sm",
          onclick: () => confirmTool(opts.msgId, "approve", card) }, "Approve"));
        actions.appendChild(el("button", { class: "btn ghost sm",
          onclick: () => confirmTool(opts.msgId, "reject", card) }, "Reject"));
      } else {
        actions.appendChild(el("div", { class: "tool-card__status" }, statusLabel(opts.status)));
      }
      card.appendChild(actions);
      return card;
    }

    function attachToolCard(ev) {
      const card = buildToolCard({ name: ev.name, args: ev.args, msgId: ev.id, interactive: true, status: "pending" });
      thread.appendChild(card);
      scrollDown();
      return card;
    }

    function attachToolResult(ev) {
      thread.appendChild(el("div", { class: "tool-card__result-note" }, "✅ tool executed"));
      scrollDown();
    }

    function showWaiting() {
      if (thread.querySelector(".ai-tool-waiting")) return;
      thread.appendChild(el("div", { class: "ai-tool-waiting" }, "⏳ Waiting for your approval…"));
      scrollDown();
    }

    let resumeStarted = false;
    async function confirmTool(id, decision, card) {
      if (card.dataset.locked) return;
      card.dataset.locked = "1";
      card.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const actions = card.querySelector(".tool-card__actions");
      const statusEl = el("div", { class: "tool-card__status" }, decision === "approve" ? "Approving…" : "Rejecting…");
      actions.appendChild(statusEl);
      try {
        await API.aiToolConfirm(id, decision);
      } catch (err) {
        toast(err.message || "Confirmation failed.", "error");
        card.dataset.locked = "";
        card.querySelectorAll("button").forEach((b) => (b.disabled = false));
        statusEl.remove();
        return;
      }
      statusEl.textContent = statusLabel(decision === "approve" ? "approved" : "rejected");
      card.dataset.status = decision === "approve" ? "approved" : "rejected";
      if (resumeStarted) return;
      resumeStarted = true;
      startResume();
    }

    async function startResume() {
      if (busy) return;
      const w = thread.querySelector(".ai-tool-waiting");
      if (w) w.remove();
      busy = true;
      sendBtn.disabled = true;
      await streamInto(convId, { resume: true });
      busy = false;
      sendBtn.disabled = false;
      await reloadMessages(convId);
      ta.focus();
    }

    async function streamInto(convId, payload) {
      const { bubble, body } = addBubble("assistant");
      let acc = "";
      let awaiting = false;
      try {
        const res = await API.aiChatStream(convId, payload);
        await readStream(res, {
          onChunk: (t) => { acc += t; setBubbleMD(body, acc); scrollDown(); },
          onToolCall: (ev) => attachToolCard(ev),
          onToolResult: (ev) => attachToolResult(ev),
          onAwaitingConfirmation: () => {
            awaiting = true;
            showWaiting();
            if (!acc) body.innerHTML = '<span class="muted">Waiting for your approval…</span>';
          },
          onDone: () => {
            if (!acc) body.innerHTML = '<span class="muted">(no response)</span>';
            else setBubbleMD(body, acc);
          },
          onError: (msg) => { bubble.remove(); sysMsg(msg, true); },
          onNonStream: (status, jsonBody) => {
            bubble.remove();
            const msg = (jsonBody && jsonBody.error) ||
              (status === 429 ? "Rate limited. Please slow down and try again." : "AI service unavailable.");
            sysMsg(msg, true);
          },
        });
      } catch (err) {
        bubble.remove();
        sysMsg(err.message || "Network error talking to AI.", true);
      }
      return awaiting;
    }

    async function reloadMessages(id) {
      const loadId = id != null ? id : convId;
      convId = loadId;
      let data;
      thread.replaceChildren(el("div", { class: "empty" }, el("span", { class: "spinner" }), " Loading…"));
      try { data = await API.getAiMessages(loadId); }
      catch (err) { thread.replaceChildren(el("div", { class: "empty" }, err.message)); return; }
      const msgs = data.messages || [];
      if (!msgs.length) { renderEmpty(); return; }
      thread.replaceChildren();
      msgs.forEach((m) => {
        if (m.role === "user") { userBubble(m.content || ""); return; }
        if (m.role === "tool_call") {
          thread.appendChild(buildToolCard({
            name: m.tool_name, args: m.tool_args, msgId: m.id,
            interactive: false, status: m.tool_status || "approved",
          }));
          return;
        }
        if (m.role === "tool_result") {
          let result = (m.content && (m.content.text || m.content)) || m.content || "";
          if (typeof result !== "string") {
            try { result = JSON.stringify(result, null, 2); } catch (_) { result = String(result); }
          }
          thread.appendChild(el("div", { class: "tool-card__result" },
            el("div", { class: "tool-card__result-label" }, "✅ Tool result"),
            el("pre", { class: "tool-card__args" }, result)));
          return;
        }
        const { bubble, body } = addBubble("assistant");
        setBubbleMD(body, m.content || "");
      });
      scrollDown();
    }

    async function send() {
      const text = ta.value.trim();
      if (!text || busy) return;
      if (!convId) {
        try {
          const r = await API.createAiConversation({ title: null });
          convId = r.conversation.id;
          if (thread.contains(emptyState)) thread.removeChild(emptyState);
          if (opts.onConversationCreated) opts.onConversationCreated(convId);
        } catch (err) {
          toast(err.message || "Could not start chat.", "error");
          return;
        }
      }
      busy = true;
      sendBtn.disabled = true;
      ta.value = "";
      userBubble(text);
      resumeStarted = false;

      const awaiting = await streamInto(convId, { message: text });
      busy = false;
      sendBtn.disabled = false;
      if (opts.onMessageSent) opts.onMessageSent(convId);
      if (header) loadUsage();
      if (!awaiting) await reloadMessages(convId);
      ta.focus();
    }

    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });

    return {
      getConvId: () => convId,
      setConvId: (id) => { convId = id; },
      loadMessages: (id) => reloadMessages(id),
      focus: () => ta.focus(),
    };
  }

  /* ============================= full page ============================= */
  async function aiChat() {
    const cid = Number(seg(1));
    if (cid) return aiChatSession(cid);
    shell(buildPage(null));
  }
  async function aiChatSession(convId) { shell(buildPage(convId)); }

  function buildPage(initialConvId) {
    const wrap = el("div", { class: "page ai-page" });

    // --- LEFT: conversation list ---
    const listEl = el("div", { class: "ai-list" });
    const newBtn = el("button", { class: "btn primary block mb-3", onclick: () => startNew() }, "＋ New chat");
    listEl.appendChild(newBtn);
    const listBox = el("div", { class: "ai-list-box" });
    listEl.appendChild(listBox);

    // --- RIGHT: thread ---
    const rightEl = el("div", { class: "ai-thread-wrap" });
    const rightInner = el("div", { class: "ai-chat" });
    rightEl.appendChild(rightInner);

    wrap.appendChild(el("div", { class: "page-head" },
      el("h1", { class: "h2" }, "AI Copilot"),
      el("div", { class: "spacer" }),
      el("button", { class: "btn ghost sm", onclick: () => { if (OD.views.openAiDrawer) OD.views.openAiDrawer(); } },
        "Open mini chat (Ctrl+J)")));
    wrap.appendChild(el("div", { class: "ai-layout" }, listEl, rightEl));

    let controller = null;
    let activeId = initialConvId ? Number(initialConvId) : null;

    function renderThread() {
      rightInner.replaceChildren();
      controller = buildChat(rightInner, {
        convId: activeId,
        onConversationCreated: (id) => { activeId = id; refreshList(); },
        onMessageSent: () => refreshList(),
      });
      if (activeId) controller.loadMessages(activeId);
    }

    async function refreshList() {
      let data;
      try { data = await API.listAiConversations({ per_page: 50 }); }
      catch (_) { listBox.replaceChildren(el("div", { class: "empty" }, "Could not load chats.")); return; }
      const convs = data.conversations || [];
      if (!convs.length) { listBox.replaceChildren(el("div", { class: "empty" }, "No conversations yet.")); return; }
      listBox.replaceChildren(...convs.map((c) => convItem(c)));
    }

    function convItem(c) {
      const deleting = el("button", { class: "btn danger sm ai-del", title: "Delete",
        onclick: (e) => { e.stopPropagation(); del(c); } }, "🗑");
      return el("div", { class: "ai-conv" + (c.id === activeId ? " active" : ""),
        onclick: () => openConv(c.id) },
        el("div", { class: "ai-conv-title" }, c.title || "Untitled chat"),
        el("div", { class: "ai-conv-meta muted" }, ago(c.updated_at)),
        deleting);
    }

    async function del(c) {
      const ok = await H().confirmModal(`Delete "${c.title || "this chat"}"? This cannot be undone.`, "Delete", "btn danger sm");
      if (!ok) return;
      try {
        await API.deleteAiConversation(c.id);
        toast("Deleted.");
        if (activeId === c.id) { activeId = null; renderThread(); }
        refreshList();
      } catch (err) { toast(err.message, "error"); }
    }

    function openConv(id) { activeId = Number(id); refreshList(); renderThread(); }
    function startNew() { activeId = null; refreshList(); renderThread(); }

    refreshList();
    renderThread();
    return wrap;
  }

  /* ============================= slide-over drawer ============================= */
  // Exposed as OD.views.openAiDrawer() so app.js can toggle it (Ctrl/Cmd+J).
  let _drawer = null;
  function openAiDrawer() {
    if (_drawer) { closeAiDrawer(); return; }
    const panel = el("aside", { class: "ai-drawer", role: "dialog", "aria-label": "AI Copilot", tabindex: "-1" });
    const head = el("div", { class: "ai-drawer-head" },
      el("strong", {}, "🤖 AI Copilot"),
      el("button", { class: "btn ghost sm", "aria-label": "Close", onclick: closeAiDrawer }, "✕"));
    const chatWrap = el("div", { class: "ai-drawer-body" });
    panel.appendChild(head);
    panel.appendChild(chatWrap);

    const backdrop = el("div", { class: "ai-drawer-backdrop", onclick: closeAiDrawer });
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.classList.add("ai-drawer-open");
    _drawer = { panel, backdrop };

    const ctrl = buildChat(chatWrap, { compact: true, onMessageSent: () => {} });
    API.listAiConversations({ per_page: 1 }).then((d) => {
      const convs = d.conversations || [];
      if (convs.length) ctrl.loadMessages(convs[0].id);
    }).catch(() => {});
    setTimeout(() => { const t = panel.querySelector("textarea"); if (t) t.focus(); }, 0);
  }
  function closeAiDrawer() {
    if (!_drawer) return;
    _drawer.panel.remove();
    _drawer.backdrop.remove();
    document.body.classList.remove("ai-drawer-open");
    _drawer = null;
  }

  /* ----------------------------- registration ----------------------------- */
  views.aiChat = aiChat;
  views.aiChatSession = aiChatSession;
  views.openAiDrawer = openAiDrawer;
})(window.OpsDesk = window.OpsDesk || { views: {} });
