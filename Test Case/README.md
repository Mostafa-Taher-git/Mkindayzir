# OpsDesk — Role-Based Test Suite

Comprehensive, role-based test cases for the OpsDesk internal service request
platform. Each role file contains 20+ deterministic test cases covering
authentication, authorization, CRUD, workflows, error handling, and edge
cases, mapped to the real API endpoints and SPA views of the application.

## 1. Testing framework (chosen: Playwright Test)

| Decision | Choice | Why |
|---|---|---|
| Runner | **Playwright Test** (`@playwright/test`, TypeScript) | Single framework for UI (browser) **and** API (request context) tests; first-class fixtures, parallelism, retries, traces |
| API-layer tests | Playwright `request` fixture | Verifies RBAC/status codes deterministically without UI flakiness |
| UI-layer tests | Playwright Chromium | Covers SPA views (`#/my`, `#/queue`, `#/jira`, `#/trello`, `#/kb`, `#/admin`) |
| Backend unit suite | Existing `pytest` suite (116 tests) | Kept as-is; runs alongside Playwright (see README at repo root) |
| Test DB | Fresh SQLite via `boot_test_server.py` | Never touches the dev `data/opsdesk.db` |

### Prerequisites

- Python 3.10+ with a venv (existing `venv/` works)
- Node 18+ and npm
- Playwright browsers: `npx playwright install chromium`

## 2. Directory structure (repo root)

```
OpsDesk/
├── app/                        # Flask backend (routes, schema, helpers)
├── static/                     # SPA frontend (js/app.js, api.js)
├── templates/                  # App shell (index.html)
├── tests/                      # Existing pytest backend suite
├── data/                       # SQLite DB + uploads (dev)
├── Test Case/                  # <-- THIS TEST SUITE
│   ├── README.md               # You are here
│   ├── 00_Test_Data_and_Setup.md   # Seed users, permissions matrix, data hints
│   ├── 01_Role_Admin.md        # 26 test cases — admin role
│   ├── 02_Role_Manager.md      # 27 test cases — manager role
│   ├── 03_Role_IT_Agent.md     # 30 test cases — IT agent role
│   ├── 04_Role_HR_Agent.md     # 24 test cases — HR agent role
│   ├── 05_Role_Requester.md    # 29 test cases — requester (sam) role
│   ├── 06_Cross_Cutting_Security.md  # 20 auth/security/edge cases
│   └── samples/                # Runnable Playwright example specs (one per role)
│       ├── playwright.config.ts
│       ├── global-setup.ts     # boots/tears down the test Flask server
│       ├── helpers.ts          # login + CSRF + fresh-DB helpers
│       ├── boot_test_server.py # boots Flask on an isolated test DB
│       ├── admin.spec.ts
│       ├── manager.spec.ts
│       ├── agent.spec.ts
│       ├── hragent.spec.ts
│       └── requester.spec.ts
├── run.py / run.sh             # app entry points
└── package.json                # npm scripts (frontend test, etc.)
```

## 3. Setup (one-time)

```bash
cd /media/dell/New\ Volume/Projects/OpsDesk

# 1. Python deps (existing venv)
source venv/bin/activate && pip install -r requirements.txt

# 2. Node deps + Playwright
npm install
npm install -D @playwright/test
npx playwright install chromium

# 3. (Optional) fixed secret for repeatable session tests
export OPERADESK_SECRET="test-secret-change-me"
```

## 4. How to run the tests

### 4a. Automated Playwright suite (samples/)

The sample specs are deliberately self-contained: `playwright.config.ts` uses a
global setup that boots the Flask app on **a fresh throwaway test DB**
(`data/opsdesk_test.db`) on port **5010**, then tears it down. No manual
server needed, and your dev data is untouched.

```bash
npx playwright test --config "Test Case/samples/playwright.config.ts"
```

Run a single role:

```bash
npx playwright test --config "Test Case/samples/playwright.config.ts" --project=admin
npx playwright test --config "Test Case/samples/playwright.config.ts" --project=requester
```

Run against an already-running dev server (skip global setup):

```bash
python run.py &                                  # dev server on :5000
npx playwright test --config "Test Case/samples/playwright.config.ts" --project=admin \
  --grep-invert=@freshdb
```

> **Verified:** the full sample suite runs green out of the box —
> `npx playwright test --config "Test Case/samples/playwright.config.ts"` → **23 passed**.

See `samples/playwright.config.ts` for projects named per role
(`admin`, `manager`, `agent`, `hragent`, `requester`, `security`).

### 4b. Backend pytest suite (existing regression guard)

```bash
source venv/bin/activate
venv/bin/python -m pytest          # 116 tests
```

### 4c. Manual/exploratory execution

1. `source venv/bin/activate && python run.py` → app at `http://127.0.0.1:5000`
2. Log in as the role under test (see `00_Test_Data_and_Setup.md`).
3. Walk each test case top to bottom; fill the **Actual/Notes** column with
   observed behavior (pass/fail + evidence: status code, screenshot, console).

## 5. Test data hints (quick reference)

| Email | Password | Role | Team | Sees |
|---|---|---|---|---|
| `admin@opsdesk.local` | `password` | admin | — | everything |
| `manager@opsdesk.local` | `password` | manager | — | everything |
| `agent@opsdesk.local` | `password` | agent | IT | IT tickets + unassigned |
| `hragent@opsdesk.local` | `password` | agent | HR | HR tickets + unassigned |
| `sam@opsdesk.local` | `password` | requester | IT | own tickets only |

- Fresh installs seed teams `IT, HR, Ops, Finance`, six categories, six SLA
  policies, and the `OPS` Jira project. Issue keys look like `OPS-0001`.
- Every mutating API call needs the CSRF token (`GET /api/auth/csrf` →
  `X-CSRF-Token` header). Login is CSRF-protected too.
- Ticket visibility: admin/manager = all; agent = own team + `team_id IS NULL`;
  requester = own. Invisible resources return **404**, not 403.
- SLA defaults (hours): urgent 1/8, high 2/24, normal 8/72, low 24/168;
  HR-normal 4/48, Finance-normal 4/48.
- CSAT: requester-only, own resolved/closed ticket, 1–5, once.

## 6. Conventions used in every test case

- **ID** — `TC-<ROLE>-NN` (e.g. `TC-ADM-01`, `TC-REQ-07`).
- **Priority** — P0 (blocker/critical), P1 (high), P2 (medium), P3 (low).
- **Type** — Positive / Negative / Edge.
- **UI/API** — SPA view (`#/my`, `#/queue`, …) and/or REST endpoint.
- **Preconditions** — required state; assume data from `00_Test_Data_and_Setup.md`.
- **Steps** — numbered, deterministic, repeatable.
- **Expected** — precise observable outcome (status code, payload field,
  UI element, DB effect).
- **Actual/Notes** — fill during execution; record deviation + evidence.
- **Cleanup** — restore DB to a clean state so cases are independent.
