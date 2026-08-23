from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.routers import (
    auth, setup, projects, work_items, iterations, initiatives,
    workflows, labels, spaces, boards, columns, cards, checklists,
    vault, assistant, settings, reports, guides, search, uploads, admin, system
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
    if settings.database_provider == "sqlite":
        from app.database import engine
        from app.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="mkindayzir API", lifespan=lifespan)

app.add_exception_handler(RequestValidationError, custom_exception_handler)
app.add_exception_handler(Exception, custom_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in [
    auth.router, setup.router, projects.router, work_items.router,
    iterations.router, initiatives.router, workflows.router, labels.router,
    spaces.router, boards.router, columns.router, cards.router,
    checklists.router, vault.router, assistant.router, settings.router,
    reports.router, guides.router, search.router, uploads.router, admin.router, system.router
]:
    app.include_router(router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
