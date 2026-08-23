from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import os

from app.config import settings as config_settings
from app.routers import (
    auth, setup, projects, work_items, iterations, initiatives,
    workflows, labels, spaces, boards, columns, cards, checklists,
    vault, assistant, settings, reports, guides, search, uploads, admin, system, dashboard,
    tickets
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
        return JSONResponse(status_code=status_code, content=content)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": str(exc)}})


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config_settings.database_provider == "sqlite":
        from app.database import engine
        from app.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="mkindayzir API", lifespan=lifespan)

app.add_exception_handler(RequestValidationError, custom_exception_handler)
app.add_exception_handler(Exception, custom_exception_handler)

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
    dashboard.router, tickets.router,
]:
    app.include_router(router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/config")
async def public_config():
    return {
        "mode": config_settings.MKINDAYZIR_MODE,
        "registrationEnabled": config_settings.REGISTRATION_ENABLED,
    }




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
        return FileResponse(str(resolved_frontend / "index.html"))
