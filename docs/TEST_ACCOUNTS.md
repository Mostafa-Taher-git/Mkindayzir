# Test & Demo Accounts

Ready-made accounts for trying Mkindayzir without creating your own.
All of them are created by one command and are safe to share with testers.

## The accounts

| Role    | Email                     | Password        | What they can do |
|---------|---------------------------|-----------------|------------------|
| ADMIN   | `admin@mkindayzir.demo`   | `Admin@2026!`   | Everything: users, settings, all modules, migrations |
| MANAGER | `manager@mkindayzir.demo` | `Manager@2026!` | Projects, boards, work items, tickets, reports — no user management |
| AGENT   | `agent@mkindayzir.demo`   | `Agent@2026!`   | Helpdesk: full ticket handling (assign/close/reopen), customers; read-only elsewhere |
| MEMBER  | `member@mkindayzir.demo`  | `Member@2026!`  | Create/edit own work items, view + create + reply to tickets |
| VIEWER  | `viewer@mkindayzir.demo`  | `Viewer@2026!`  | Read-only across projects, boards, vault, tickets |

> Personal mode note: these are Team-mode roles. In a **personal** install
> there is a single admin account (created by the setup wizard) — the demo
> seeder still works and simply adds the four accounts alongside it.

## Creating them

From the `backend/` directory:

```bash
python -m app.cli.seed-demo          # or: mkindayzir seed-demo
```

Output shows each account as `+ created` or `= already exists`.
The command is idempotent — run it any number of times, it never duplicates.

Docker:

```bash
docker compose -f docker/docker-compose.yml exec app python -m app.cli.seed-demo
```

## Removing them

```bash
python -m app.cli.password reset <email>   # change a password
```

or delete rows directly: `DELETE FROM users WHERE email LIKE '%@mkindayzir.demo';`
(sessions cascade automatically).

## Security note

These passwords are intentionally public — for evaluation only.
**Do not leave demo accounts enabled on an internet-facing deployment.**
Delete them (`seed-demo` flag file is `data/.demo_seeded`) before going live.
