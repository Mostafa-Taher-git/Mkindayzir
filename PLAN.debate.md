# OpsDesk Plan — Debate Record (full critic pass)

A skeptical senior-engineering reviewer (leaf subagent, ran the full plan twice)
challenged `PLAN.md`. Below is the **complete** critique from the second pass,
my responses, and the resulting plan changes.

## A. Critic's ranked critiques (verbatim, 11 points)
1. **The 7 known bugs are buried, not front-loaded.** Split across "P0/P1" and
   bundled with tests/hardening inside a 9-phase plan that will never ship.
   Treat them as a standalone, non-negotiable ship-stopper milestone.
   `requester_id` spoofable + `/meta` leak are authZ holes, not polish.
2. **Requester notification on status change is mis-scoped as "optional Phase G-lite" — it is core MVP.** A help desk that never tells a requester their ticket was resolved is not a help desk. Must precede KB/SLA/automation.
3. **Password reset is missing entirely.** No recovery path = locked-out users = support burden. MVP, not later.
4. **The AI ("agy") layer is over-promising and the riskiest item.** External LLM call from "thin" Flask: API-key management, network timeouts, provider drift, cost, and — critically — **a prompt-injection vector**: a crafted ticket description becomes attacker-controlled input to the LLM. Also the *least editable* part for a JS/HTML/CSS beginner. "Graceful degradation" understates the maintenance tax. **Keep it out of MVP.**
5. **Deploy story contradicts the hard constraint.** User can only run Flask in their own session; agent servers aren't browser-reachable. Docker+gunicorn multi-worker is a fantasy for them. Per-request DB connection is the correct *correctness* fix (module-level conn w/ `check_same_thread=False` is a latent threading bug even in dev), but drop container/multi-worker deploy from MVP.
6. **Security is under-weighted in specifics.** CSRF: "SameSite + fetch with credentials" is insufficient — for a cookie+JSON API you need a **token or a custom-header check** (makes the request non-simple, CORS-blocked). **Session cookie flags (Secure, HttpOnly, SameSite) are never mentioned.** Secret management: misnamed `OPERATION` var, no `.env.example`, no rotation note.
7. **KB/SLA/automation/webhooks/PWA in one go violates "thin editable Python."** Each adds Python surface (rules engine, IMAP poller, webhook dispatcher, AI client) the beginner *cannot* safely edit — the heaviest Python in the project. The plan contradicts its own guardrail.
8. **Phase ordering is wrong.** KB precedes notifications; SLA/automation precede basic requester comms. ROI ordering should be: fix → notify/reset → spec-coverage.
9. **Login robustness is thin.** Rate-limit listed, but no account lockout, no secure-cookie flags, no password-strength/reset. Brute-force + lockout recovery are paired concerns.
10. **Schedulers are unaddressed.** Auto-close, SLA breach, mailpoll, webhook retries all need a background loop; only auto-close exists, no documented scheduler story for single-process Flask.
11. **P1 tests are vague.** "Mirror lifecycle" — instead tie tests directly to the security fixes (requester can't set `requester_id`, `/meta` scoped, TZ math correct).

## B. Critic's revised phase list (TRUE minimum)
- **Phase 0** — Fix the 7 bugs + secrets + cookie flags + login rate-limit + length caps + attachment byte-check + per-request DB conn.
- **Phase 1** — Requester notifications (outbound email/UI on status change) + password reset + login hardening (lockout, Secure/HttpOnly/SameSite).
- **Phase 2** — Backend pytest suite covering fixes + lifecycle + RBAC + dashboard + TZ.
- *(Post-MVP: KB, then SLA, then automation — one at a time, only after stable in prod.)*

## C. Critic's DROP-from-MVP list
AI/agy · SLA policies & auto-routing · automation rules + canned replies ·
inbound/outbound webhooks · PWA/offline · Docker/gunicorn multi-worker ·
CSAT/30-day trends/CSV export · IMAP mailpoll intake. *(Keep only outbound
status notifications, part of Phase 1.)*

## D. My responses
- **Agree & adopted:** Phase 0 now explicitly names Secure/HttpOnly/SameSite
  cookie flags, CSRF via token-or-custom-header, per-request DB conn, length
  caps, attachment byte-check, login lockout, and tests tied to the security
  fixes. Multi-worker/Docker deploy dropped (matches your run-it-yourself
  constraint). Schedulers noted as a single-process background loop.
- **Agree & adopted (scope):** automation engine, webhooks, IMAP intake, PWA,
  CSAT/export all moved to post-MVP (already in the Deferred list).
- **PARTIAL — the AI conflict:** The critic says drop AI; **you explicitly asked
  for "agy" in the MVP.** I am keeping AI in the plan per your instruction, but
  adopting the critic's hard guardrails: it is the riskiest piece, so it MUST be
  (1) key-gated + feature-flagged, (2) strictly draft-only — AI output can never
  trigger an action, (3) **prompt-injection hardened** — ticket text is treated
  as untrusted; the model gets a strict system prompt, outputs are clearly
  labeled "AI-generated, not verified", and we never auto-send, (4) capped input
  size, (5) fails closed (no key / timeout → feature hidden). If you'd rather
  follow the critic and ship AI later, say so and I'll move Phase 5 to post-MVP.
- **Disagree (scope):** I keep KB + SLA + basic reporting in MVP because your
  source spec defines those as the *minimum* for a help desk, and you asked for a
  "full mvp". They are small, well-bounded additions that stay thin+commented.

## E. Net result
Plan is now: **Phase 0 (stabilize)** → **Phase 1 (notify + password reset +
login hardening)** → **Phase 2 (KB)** → **Phase 3 (SLA + routing)** →
**Phase 4 (reporting: CSAT/trend/export)**. **AI/"agy" deferred to v2** (user
decision 2026-08-17 — build it last, after the core is verified). Deferred:
automation, webhooks, IMAP, PWA, Docker/gunicorn, multi-worker. Security
specifics from the critic are folded into Phase 0/1.
