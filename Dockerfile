# =============================================================================
# Mkindayzir — single-process production image
#
# Stage 1 builds the Vite React SPA (frontend/) -> frontend/dist/
# Stage 2 runs FastAPI which serves /api/* AND the static dist/ on :8000
# (via the `mkindayzir` console script + FRONTEND_DIR).
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Frontend build (Vite React SPA at the project root)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Install deps first (better layer caching) — copy lockfile + manifest first.
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the frontend sources and build.
COPY frontend .
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 2: Runtime — single Python process serving API + static frontend
# ---------------------------------------------------------------------------
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Build tooling for cryptography / bcrypt wheels if needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install the backend (editable) — provides `mkindayzir` and `alembic`.
COPY backend/ ./backend/
RUN pip install -e ./backend

# Bring in the built SPA from stage 1.
COPY --from=frontend-build /app/dist /app/dist

# FastAPI mounts this dir to serve the SPA; default when unset is <root>/dist.
ENV FRONTEND_DIR=/app/dist

EXPOSE 8000

# alembic.ini lives in backend/, so run migrations from there, then start.
WORKDIR /app/backend
CMD ["sh", "-c", "alembic upgrade head && mkindayzir start --host 0.0.0.0 --port 8000"]
