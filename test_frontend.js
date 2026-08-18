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

  // KB version diff: create + publish + edit an article, then open the diff modal
  const API2 = window.eval("API"); // top-level const, not on window
  const art = await API2.createKb({ title: "Frontend diff test", body: "line one\nline two", category_id: 1 });
  const aid = art.article.id;
  await API2.publishKb(aid);
  await API2.updateKb(aid, { title: "Frontend diff test", body: "line one\nline two\nline three" });
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

  console.log("\nJS errors during run:", errs.length);
  errs.slice(0, 8).forEach((e) => console.log("  ", e));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length && errs.length === 0 ? 0 : 1);
})().catch((e) => { console.error("TEST CRASHED:", e); process.exit(2); });
