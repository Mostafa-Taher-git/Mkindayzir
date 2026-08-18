/* Headless frontend integration test (real SPA + live Flask API).
   Reliable approach: obtain a real session cookie via node fetch (login),
   preload it into jsdom, then boot the SPA. Because api.js uses relative URLs
   resolved against the page origin, we wrap window.fetch to resolve + attach
   the cookie. This drives the AUTHENTICATED render path for every screen and
   asserts real DOM is produced, catching any runtime JS errors.

   Run with: npm run test:frontend  (server must already be running on :5000)
*/
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = "http://127.0.0.1:5000";
const ROOT = __dirname;

// Login is a CSRF-protected mutation: fetch a session token first, exactly
// like the SPA's api.js does before POSTing /api/auth/login. Node's fetch
// does not manage cookies, so we must carry the session cookie that the
// CSRF endpoint sets back into the login request.
async function login(email, password) {
  const csrfRes = await fetch(BASE + "/api/auth/csrf");
  const csrfCookie = csrfRes.headers.get("set-cookie").split(";")[0];
  const csrf = (await csrfRes.json()).csrf_token;
  const loginRes = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, "Cookie": csrfCookie },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) { console.error("login failed", email, loginRes.status); process.exit(2); }
  return loginRes.headers.get("set-cookie").split(";")[0];
}

(async () => {
  const cookie = await login("admin@opsdesk.local", "password");

  const vc = new VirtualConsole();
  const errs = [];
  vc.on("jsdomError", (e) => errs.push("jsdomError: " + (e.detail ? (e.detail.stack || e.detail) : (e.message || e))));

  const html = fs.readFileSync(path.join(ROOT, "templates/index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: BASE + "/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  const { document } = window;

  const resolve = (u) => (u.startsWith("http") ? u : BASE + u);
  const withCookie = (opts = {}, ck) => {
    const headers = Object.assign({}, opts.headers);
    headers["Cookie"] = ck || cookie;
    return { ...opts, headers };
  };
  window.fetch = (url, opts = {}) => fetch(resolve(url), withCookie(opts));

  const inject = (rel) => {
    const s = document.createElement("script");
    s.textContent = fs.readFileSync(path.join(ROOT, "static/js", rel), "utf8");
    document.body.appendChild(s);
  };
  inject("api.js");
  inject("views/core.js");
  inject("views/jira.js");
  inject("views/trello.js");
  inject("app.js");

  const results = [];
  const assert = (cond, msg) => { results.push(!!cond); console.log((cond ? "  ok  : " : "  FAIL: ") + msg); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const appHTML = () => document.getElementById("app").innerHTML;
  const go = async (hash, ms = 800) => {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event("hashchange"));
    await wait(ms);
  };

  // boot with cookie -> should land on dashboard (admin)
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await wait(1200);
  assert(/Dashboard/.test(appHTML()), "boot(admin) renders dashboard");
  assert(/class="stat/.test(appHTML()), "dashboard shows stat tiles");

  await go("#/queue");
  assert(/Ticket Queue/.test(appHTML()), "queue view renders");
  assert(/bulk-bar/.test(appHTML()) && /0 selected/.test(appHTML()), "queue shows bulk action bar");

  await go("#/ticket/1", 1200);
  const detail = appHTML();
  assert(/Activity/.test(detail) && /Conversation/.test(detail), "ticket detail renders conversation + activity");
  assert(/OPS-/.test(detail), "ticket detail shows ref id");
  assert(/Knowledge Base/.test(detail), "ticket detail shows the KB bridge section");
  assert(/Follow/.test(detail), "ticket detail shows follow toggle");

  await go("#/kb/manage");
  assert(/Manage Knowledge Base/.test(appHTML()), "Manage KB renders");

  await go("#/admin");
  assert(/Teams/.test(appHTML()) && /Users/.test(appHTML()) && /Categories/.test(appHTML()), "admin renders teams/categories/users");
  assert(/Jira Workflows/.test(appHTML()) && /Custom Fields/.test(appHTML()), "admin renders workflow builder + custom fields");
  assert(/Default scheme/.test(appHTML()), "admin shows default workflow scheme");

  // Phase 1A — Jira suite
  await go("#/jira/projects");
  const projHTML = appHTML();
  assert(/Projects/.test(projHTML) && /Backlog/.test(projHTML) && /Board/.test(projHTML), "jira projects view renders");
  assert(/OPS/.test(projHTML), "jira projects shows the OPS project");

  await go("#/jira/backlog/1", 1500);
  const backlogHTML = appHTML();
  assert(/Backlog/.test(backlogHTML) && /Sprints/.test(backlogHTML), "jira backlog renders sprint buckets");
  assert(/jira-card/.test(backlogHTML), "jira backlog shows draggable issue cards");

  await go("#/jira/board/1", 1500);
  const boardHTML = appHTML();
  assert(/kanban/.test(boardHTML) && /In Progress/.test(boardHTML), "jira board renders kanban columns");

  await go("#/jira/sprints/1", 1500);
  assert(/Sprints/.test(appHTML()), "jira sprints view renders");

  await go("#/jira/goals", 1500);
  const goalsHTML = appHTML();
  assert(/Goals &amp; OKRs|Goals & OKRs/.test(goalsHTML), "jira goals view renders");
  assert(/progress-track/.test(goalsHTML) || /No goals yet/.test(goalsHTML), "jira goals shows progress bars");

  await go("#/jira/issue/1", 1500);
  const issueHTML = appHTML();
  assert(/Conversation/.test(issueHTML) && /Activity/.test(issueHTML), "jira issue detail renders conversation + activity");
  assert(/Allowed transition buttons|→ /.test(issueHTML) || /blocked/.test(issueHTML), "jira issue detail shows transition buttons");

  // Phase 2A — Trello suite (create real workspace/board/list/card via API)
  const trelloFlow = await window.eval(`(async () => {
    const ws = (await API.createWorkspace({ name: "Frontend WS " + Date.now() })).workspace;
    const b = (await API.createBoard({ workspace_id: ws.id, title: "FE Board" })).board;
    const l1 = (await API.createList(b.id, { title: "To Do" })).list;
    const l2 = (await API.createList(b.id, { title: "Done" })).list;
    const c1 = (await API.createCard({ list_id: l1.id, title: "Card One" })).card;
    const c2 = (await API.createCard({ list_id: l1.id, title: "Card Two" })).card;
    const lbl = (await API.createLabel(b.id, { name: "urgent", color: "#EB5A46" })).label;
    await API.attachLabel(c1.id, lbl.id);
    const cl = (await API.addChecklist(c1.id, "Steps")).checklist;
    await API.addChecklistItem(cl.id, "Step A");
    const moved = (await API.moveCard(c1.id, { list_id: l2.id, before_id: null, after_id: null })).card;
    await API.addCardComment(c1.id, "moving along");
    return { ws, b, l1, l2, movedList: moved.list_id };
  })()`);
  await go("#/trello");
  const trelloHomeHTML = appHTML();
  assert(/Trello Boards/.test(trelloHomeHTML), "trello home renders");
  assert(/board-tile/.test(trelloHomeHTML), "trello home shows board tiles");
  assert(/ws-switcher/.test(trelloHomeHTML), "trello home shows workspace switcher");

  await go("#/trello/board/" + trelloFlow.b.id, 1800);
  const boardHTML2 = appHTML();
  assert(/board-cols/.test(boardHTML2) && /tlist/.test(boardHTML2), "trello board renders columns");
  assert(/trello-card/.test(boardHTML2), "trello board renders card tiles");
  assert(/draggable="true"/.test(boardHTML2), "trello cards are drag-enabled");
  assert(trelloFlow.movedList === trelloFlow.l2.id, "trello card move API works across lists");
  assert(/urgent/.test(boardHTML2), "trello card shows attached label");
  assert(/Done/.test(boardHTML2) && /To Do/.test(boardHTML2), "trello board shows both lists");

  // card modal opens with checklists + members + comments sections
  const cardNode = document.querySelector(".trello-card");
  if (cardNode) { cardNode.click(); await wait(400); }
  const modalBack = document.getElementById("modal-back");
  assert(modalBack && /card-modal/.test(modalBack.innerHTML), "trello card modal opens");
  assert(modalBack && /Checklists/.test(modalBack.innerHTML), "trello card modal shows checklists");
  assert(modalBack && /Activity/.test(modalBack.innerHTML), "trello card modal shows activity");
  assert(modalBack && /Add label/.test(modalBack.innerHTML), "trello card modal shows label picker");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await wait(100);

  await go("#/trello/starred", 1200);
  assert(/Trello Boards/.test(appHTML()), "trello starred view renders");

  // create a sprint + move an issue into it via the API (exercise the backend)
  const sprFlow = await window.eval(`(async () => {
    const proj = (await API.listProjects()).projects.find((p) => p.key === "OPS");
    const spr = await API.createSprint({ project_id: proj.id, name: "Frontend Sprint " + Date.now() });
    await API.startSprint(spr.sprint.id);
    const afterStart = await API.listSprints(proj.id);
    await API.completeSprint(spr.sprint.id);
    const afterClose = await API.listSprints(proj.id);
    return {
      started: afterStart.sprints.some((s) => s.id === spr.sprint.id && s.status === "active"),
      closed: afterClose.sprints.find((s) => s.id === spr.sprint.id).status === "closed",
    };
  })()`);
  assert(sprFlow.started, "jira sprint starts");
  assert(sprFlow.closed, "jira sprint completes");

  // KB version diff: create + publish + edit an article, then open the diff modal.
  // Title is unique per run because kb_notes enforces UNIQUE(folder_id, title).
  const API2 = window.eval("API"); // top-level const, not on window
  const kt = "Frontend diff test " + Date.now();
  const art = await API2.createKb({ title: kt, body: "line one\nline two", category_id: 1 });
  const aid = art.note.id;
  await API2.publishKb(aid);
  await API2.updateKb(aid, { title: kt, body: "line one\nline two\nline three" });
  await go("#/kb/" + aid, 1200);
  assert(/Version history/.test(appHTML()), "KB article shows version history");
  const diffBtn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Diff vs previous");
  if (diffBtn) { diffBtn.click(); await wait(300); }
  const modal = document.getElementById("modal-back");
  assert(modal && /diff-view/.test(modal.innerHTML), "version diff modal opens");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await wait(100);

  // requester perspective: login as sam
  const cookie2 = await login("sam@opsdesk.local", "password");
  window.fetch = (url, opts = {}) => fetch(resolve(url), withCookie(opts, cookie2));
  await go("#/my");
  assert(/My Requests/.test(appHTML()), "requester My Requests renders");
  assert(/SLA/.test(appHTML()), "requester queue shows SLA column");

  // sam's newest ticket: follow/edit/SLA-due-date visible
  const myTickets = await window.eval("API.listIssues()");
  const mine = myTickets.issues.filter((t) => t.requester_id === 5).sort((a, b) => b.id - a.id);
  await go("#/ticket/" + mine[0].id, 1200);
  const mineHTML = appHTML();
  assert(/Follow/.test(mineHTML), "requester detail shows follow toggle");
  assert(/Expected first response/.test(mineHTML), "requester detail shows SLA due dates");
  assert(/Edit/.test(mineHTML), "requester detail shows Edit button while unassigned");

  console.log("\nJS errors during run:", errs.length);
  errs.slice(0, 8).forEach((e) => console.log("  ", e));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length && errs.length === 0 ? 0 : 1);
})().catch((e) => { console.error("TEST CRASHED:", e); process.exit(2); });
