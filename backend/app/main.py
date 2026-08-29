from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import os

from app.config import settings as config_settings
from app.version import APP_VERSION

from app.routers import (
    auth, setup, projects, work_items, iterations, initiatives,
    workflows, labels, spaces, boards, columns, cards, checklists,
    vault, assistant, settings, reports, guides, search, uploads, admin, system, dashboard,
    tickets, ws, board_backgrounds, card_comments, users, archive,
    organizations, invitations, transfers, clerk_webhook,
)


async def custom_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "VALIDATION_ERROR", "message": str(exc.errors()[0]["msg"]) if exc.errors() else str(exc)}}
        )
    if hasattr(exc, "status_code"):
        status_code = exc.status_code
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            content = detail
        else:
            content = {"error": {"code": str(status_code), "message": str(detail)}}
        headers = getattr(exc, "headers", None)
        return JSONResponse(status_code=status_code, content=content, headers=headers)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": str(exc)}})


def http_exception_handler(request: Request, exc):
    """Normalize HTTPException to the SAME {"error": {...}} envelope used by
    every other error path. Without this, HTTPException responses were
    double-wrapped as {"detail": {"error": {...}}}, which the frontend's
    api.ts cannot parse (users saw raw statusText instead of messages)."""
    detail = getattr(exc, "detail", str(exc))
    if isinstance(detail, dict) and "error" in detail:
        content = detail
    else:
        content = {"error": {"code": str(getattr(exc, "status_code", 500)), "message": str(detail)}}
    return JSONResponse(
        status_code=getattr(exc, "status_code", 500),
        content=content,
        headers=getattr(exc, "headers", None),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Bootstrap storage directories BEFORE the engine opens a connection.
    # Uploads/backups still live on the filesystem — ensure their dirs exist.
    for _dir in (config_settings.data_dir, config_settings.UPLOAD_DIR, config_settings.BACKUP_DIR):
        Path(_dir).mkdir(parents=True, exist_ok=True)

    # Idempotent schema bootstrap: create any tables that don't exist yet.
    # New models added to app.models register here and become available
    # without requiring a manual `mkindayzir migrate upgrade` run.
    from app.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        await conn.exec_driver_sql(
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS "clerkId" VARCHAR(255) UNIQUE'
        )

        # Idempotent column adds for the org/owner migration. The underlying
        # driver is asyncpg/PostgreSQL. Each block checks information_schema
        # so re-running is a no-op.
        await conn.exec_driver_sql(
            "ALTER TABLE vault_notes ADD COLUMN IF NOT EXISTS \"ownerType\" VARCHAR(10) NOT NULL DEFAULT 'personal'"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE vault_notes ADD COLUMN IF NOT EXISTS \"ownerUserId\" VARCHAR(36)"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE vault_notes ADD COLUMN IF NOT EXISTS \"ownerOrgId\" VARCHAR(36)"
        )
        # Backfill ownerUserId = authorId for any rows that pre-date the columns
        # (should be a no-op after the ADD COLUMN above, kept for safety).
        await conn.exec_driver_sql(
            'UPDATE vault_notes SET "ownerUserId" = "authorId" '
            "WHERE \"ownerType\" = 'personal' AND \"ownerUserId\" IS NULL"
        )

        # Project, space, ticket owner columns
        for table, user_col in (
            ("projects", "createdById"),
            ("spaces", "createdById"),
            ("tickets", "createdById"),
        ):
            await conn.exec_driver_sql(
                f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "ownerType" VARCHAR(10) NOT NULL DEFAULT \'personal\''
            )
            await conn.exec_driver_sql(
                f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "ownerUserId" VARCHAR(36)'
            )
            await conn.exec_driver_sql(
                f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "ownerOrgId" VARCHAR(36)'
            )
            await conn.exec_driver_sql(
                f'UPDATE {table} SET "ownerUserId" = "{user_col}" '
                f"WHERE \"ownerType\" = 'personal' AND \"ownerUserId\" IS NULL"
            )

        # Remove the single-org constraint — users may now belong to multiple orgs.
        await conn.exec_driver_sql(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_org_member_one_org_per_user'
                ) THEN
                    ALTER TABLE organization_members
                    DROP CONSTRAINT uq_org_member_one_org_per_user;
                END IF;
            END $$;
            """
        )

        # Onboarded flag: replaces the fragile "0 projects → /onboarding" guard.
        await conn.exec_driver_sql(
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS "onboarded" BOOLEAN NOT NULL DEFAULT FALSE'
        )

        # Make Project.key org-scoped instead of globally unique, so copies
        # within the same org don't collide.
        await conn.exec_driver_sql(
            "DO $$ BEGIN "
            "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_key_key') THEN "
            "ALTER TABLE projects DROP CONSTRAINT projects_key_key; "
            "END IF; "
            "END $$;"
        )
        await conn.exec_driver_sql(
            'CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_key_personal" ON projects ("key") WHERE "ownerType" = \'personal\''
        )
        await conn.exec_driver_sql(
            'CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_key_org" ON projects ("key") WHERE "ownerType" = \'org\''
        )

    yield


app = FastAPI(title="mkindayzir API", lifespan=lifespan)

app.add_exception_handler(RequestValidationError, custom_exception_handler)
app.add_exception_handler(Exception, custom_exception_handler)

# Register the StarletteHTTPException handler LAST so it wins over FastAPI's
# built-in default (which would emit the {"detail": ...} shape).
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402
app.add_exception_handler(StarletteHTTPException, http_exception_handler)

_allowed_origins = list(dict.fromkeys([
    *os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
    ).split(","),
    config_settings.CLERK_FRONTEND_API,
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in [
    auth.router, setup.router, projects.router, work_items.router,
    iterations.router, initiatives.router, workflows.router, labels.router,
    spaces.router, boards.router, columns.router, cards.router,
    checklists.router, vault.router, assistant.router, settings.router,
    reports.router, guides.router, search.router, uploads.router, admin.router, system.router,
    dashboard.router, tickets.router, ws.router, board_backgrounds.router,
    card_comments.router, users.router, archive.router,
    organizations.router, invitations.router, transfers.router, clerk_webhook.router,
]:
    app.include_router(router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/config")
async def public_config():
    return {"version": APP_VERSION}




# --------------------------------------------------------------------------- #
# API slash-tolerance middleware.
#
# Routers declare collections WITH a trailing slash ("/api/projects/") while
# the SPA calls them WITHOUT ("/api/projects"). Starlette would normally 307-
# redirect the slashless form, but the SPA catch-all route below intercepts
# the request first, so POST/PATCH to "/api/projects" died with 405.
#
# A blanket rewrite is wrong too ("/api/auth/login" has no slash-ful twin),
# so this middleware builds the concrete set of API paths once at startup and
# only rewrites when the slash-ful variant actually exists. Both spellings
# then work for every current and future route with zero client changes.
# --------------------------------------------------------------------------- #
class ApiSlashRedirectMiddleware:
    def __init__(self, app):
        self.app = app
        self._slashful_patterns: list | None = None

    def _build_path_set(self) -> None:
        # Newer FastAPI wraps include_router() in opaque _IncludedRouter
        # objects; the concrete APIRouter hangs off .original_router.
        import re as _re
        from app.main import app as fastapi_app

        patterns: list[_re.Pattern] = []

        def add(path: str) -> None:
            if not path.startswith("/api") or not path.endswith("/"):
                return
            # Turn "/api/x/{item_id}/y/" into a full-match regex.
            regex = _re.sub(r"\{[^}]+\}", "[^/]+", path)
            patterns.append(_re.compile("^" + regex + "$"))

        def walk(routes) -> None:
            for route in routes:
                path = getattr(route, "path", None)
                if path:
                    add(path)
                nested = getattr(route, "routes", None)
                if nested and not path:
                    walk(nested)
                original = getattr(route, "original_router", None)
                if original is not None:
                    walk(original.routes)

        walk(fastapi_app.routes)
        self._slashful_patterns = patterns

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if (
                path.startswith("/api")
                and len(path) > 4
                and not path.endswith("/")
            ):
                if self._slashful_patterns is None:
                    self._build_path_set()
                candidate = path + "/"
                if any(pat.match(candidate) for pat in self._slashful_patterns):
                    scope = dict(scope)
                    scope["path"] = candidate
        await self.app(scope, receive, send)


app.add_middleware(ApiSlashRedirectMiddleware)

# --------------------------------------------------------------------------- #
# Static serving of the built frontend (production single-process mode).
# Mounted LAST so /api routers take precedence. When the dist directory is
# absent (dev mode) the API still works and SPA routes simply 404.
# --------------------------------------------------------------------------- #
_frontend_dir = Path(os.environ.get("FRONTEND_DIR", "")) if os.environ.get("FRONTEND_DIR") else (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
)

if _frontend_dir.exists() and _frontend_dir.is_dir():
    _assets_dir = _frontend_dir / "assets"
    if _assets_dir.exists() and _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir), html=False), name="frontend-assets")

    @app.get("/api/{path:path}")
    async def api_fallback(path: str):
        # Unmatched /api/* must never fall through to the SPA shell: the SPA
        # catch-all below would otherwise answer real API typos/missing
        # endpoints with index.html + 200, which silently renders as an
        # "empty page" instead of a visible failure.
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "NOT_FOUND", "message": f"Unknown API endpoint: /api/{path}"}},
        )

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        # HTML shells must always be revalidated: hashed asset filenames make
        # new builds safe, but a stale index.html would keep pointing at an
        # OLD bundle (heuristic caching has no TTL), so users saw pre-redesign
        # pages hours after a deploy. no-cache forces the check, costs one 304.
        no_cache = {"Cache-Control": "no-cache"}
        # Resolve candidate and ensure it stays within the frontend directory
        resolved_frontend = _frontend_dir.resolve()
        # Marketing pages are edited directly in frontend/public/ — serve them
        # from there so content fixes don't require a frontend rebuild.
        if path.endswith(".html"):
            public_candidate = (resolved_frontend.parent / "public" / path).resolve()
            if public_candidate.is_relative_to((resolved_frontend.parent / "public").resolve()) and public_candidate.is_file():
                return FileResponse(str(public_candidate), headers=no_cache)
        candidate = (resolved_frontend / path).resolve()
        if path and candidate.is_relative_to(resolved_frontend) and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate), headers=no_cache)
        # The marketing landing page is the front door: "/" serves it instead
        # of dropping the visitor straight into the console login. Prefer the
        # live public/ copy so content edits never need a rebuild.
        if not path or path == "/":
            public_landing = (resolved_frontend.parent / "public" / "landing.html").resolve()
            if public_landing.is_file():
                return FileResponse(str(public_landing), headers=no_cache)
            return FileResponse(str(resolved_frontend / "landing.html"), headers=no_cache)
        return FileResponse(str(resolved_frontend / "index.html"), headers=no_cache)
