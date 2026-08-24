from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import os

from app.config import settings as config_settings

# Single source of truth for the running app version. Bump on every release;
# surfaced via /api/config and shown on the roadmap page ("Your Installation").
APP_VERSION = "1.0.0"

from app.routers import (
    auth, setup, projects, work_items, iterations, initiatives,
    workflows, labels, spaces, boards, columns, cards, checklists,
    vault, assistant, settings, reports, guides, search, uploads, admin, system, dashboard,
    tickets, ws
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
    # SQLite (and Postgres file paths) refuse to create intermediate
    # directories, so a missing DATA_DIR crashed first startup with
    # "unable to open database file".
    for _dir in (config_settings.data_dir, config_settings.UPLOAD_DIR, config_settings.BACKUP_DIR):
        Path(_dir).mkdir(parents=True, exist_ok=True)

    if config_settings.database_provider == "sqlite":
        from app.database import engine
        from app.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="mkindayzir API", lifespan=lifespan)

app.add_exception_handler(RequestValidationError, custom_exception_handler)
app.add_exception_handler(Exception, custom_exception_handler)

# Register the StarletteHTTPException handler LAST so it wins over FastAPI's
# built-in default (which would emit the {"detail": ...} shape).
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402
app.add_exception_handler(StarletteHTTPException, http_exception_handler)

_allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

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
    dashboard.router, tickets.router, ws.router,
]:
    app.include_router(router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/config")
async def public_config():
    # Public, unauthenticated. Only non-sensitive launch info lives here.
    return {
        "mode": config_settings.MKINDAYZIR_MODE,
        "registrationEnabled": config_settings.REGISTRATION_ENABLED,
        "version": APP_VERSION,
    }




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
        self._slashful_paths: set[str] | None = None

    def _build_path_set(self) -> None:
        # Newer FastAPI wraps include_router() in opaque _IncludedRouter
        # objects; the concrete APIRouter hangs off .original_router.
        from app.main import app as fastapi_app

        paths: set[str] = set()

        def walk(routes) -> None:
            for route in routes:
                path = getattr(route, "path", None)
                if path:
                    paths.add(path)
                nested = getattr(route, "routes", None)
                if nested and not path:
                    walk(nested)
                original = getattr(route, "original_router", None)
                if original is not None:
                    walk(original.routes)

        walk(fastapi_app.routes)
        self._slashful_paths = {p for p in paths if p.startswith("/api") and p.endswith("/")}

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if (
                path.startswith("/api")
                and len(path) > 4
                and not path.endswith("/")
            ):
                if self._slashful_paths is None:
                    self._build_path_set()
                if (path + "/") in self._slashful_paths:
                    scope = dict(scope)
                    scope["path"] = path + "/"
        await self.app(scope, receive, send)


app.add_middleware(ApiSlashRedirectMiddleware)

# --------------------------------------------------------------------------- #
# Static serving of the built frontend (production single-process mode).
# Mounted LAST so /api routers take precedence. When the dist directory is
# absent (dev mode) the API still works and SPA routes simply 404.
# --------------------------------------------------------------------------- #
_frontend_dir = Path(os.environ.get("FRONTEND_DIR", "")) if os.environ.get("FRONTEND_DIR") else (
    Path(__file__).resolve().parent.parent.parent / "dist"
)

if _frontend_dir.exists() and _frontend_dir.is_dir():
    _assets_dir = _frontend_dir / "assets"
    if _assets_dir.exists() and _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir), html=False), name="frontend-assets")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        # Resolve candidate and ensure it stays within the frontend directory
        resolved_frontend = _frontend_dir.resolve()
        candidate = (resolved_frontend / path).resolve()
        if path and candidate.is_relative_to(resolved_frontend) and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        # The marketing landing page is the front door: "/" serves it instead
        # of dropping the visitor straight into the console login.
        if not path or path == "/":
            return FileResponse(str(resolved_frontend / "landing.html"))
        return FileResponse(str(resolved_frontend / "index.html"))
