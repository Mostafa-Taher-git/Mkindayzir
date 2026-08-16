/* Headless frontend integration test (real SPA + live Flask API).
   Reliable approach: obtain a real session cookie via node fetch (login),
   preload it into jsdom, then boot the SPA. Because api.js uses relative URLs
   resolved against the page origin, we wrap window.fetch to resolve + attach
   the cookie. This drives the AUTHENTICATED render path for every screen and
   asserts real DOM is produced, catching any runtime JS errors. */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = "http://127.0.0.1:5000";
const ROOT = "/media/dell/New Volume/Projects/OpsDesk";

(async () => {
  // ---- obtain a real session cookie ----
  const loginRes = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@opsdesk.local", password: "password" }),
  });
  if (!loginRes.ok) { console.error("login failed", loginRes.status); process.exit(2); }
  const cookie = loginRes.headers.get("set-cookie").split(";")[0];

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
  window.fetch = (url, opts = {}) => {
    const headers = Object.assign({}, opts.headers);
    headers["Cookie"] = cookie;
    return fetch(resolve(url), { ...opts, headers });
  };

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

  await go("#/ticket/1", 1200);
  const detail = appHTML();
  assert(/Activity/.test(detail) && /Conversation/.test(detail), "ticket detail renders conversation + activity");
  assert(/OPS-/.test(detail), "ticket detail shows ref id");

  await go("#/admin");
  assert(/Teams/.test(appHTML()) && /Users/.test(appHTML()) && /Categories/.test(appHTML()), "admin renders teams/categories/users");

  // requester perspective: login as sam
  const lr2 = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sam@opsdesk.local", password: "password" }),
  });
  const cookie2 = lr2.headers.get("set-cookie").split(";")[0];
  window.fetch = (url, opts = {}) => fetch(resolve(url), { ...opts, headers: { ...(opts.headers||{}), Cookie: cookie2 } });
  await go("#/my");
  assert(/My Requests/.test(appHTML()), "requester My Requests renders");

  console.log("\nJS errors during run:", errs.length);
  errs.slice(0, 8).forEach((e) => console.log("  ", e));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length && errs.length === 0 ? 0 : 1);
})().catch((e) => { console.error("TEST CRASHED:", e); process.exit(2); });
