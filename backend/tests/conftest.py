"""
Shared pytest fixtures: a fully isolated FastAPI app per test.

Strategy
--------
- Point DATA_DIR / UPLOAD_DIR / BACKUP_DIR at a throwaway temp directory and
  force DATABASE_PROVIDER=sqlite BEFORE importing app modules (config is a
  singleton created at import time).
- create_all() builds the schema on the temp SQLite DB; no Alembic needed.
- Requests go through httpx.AsyncClient + ASGITransport (the supported
  in-process pattern for httpx>=0.28), wrapped in a thin SYNC adapter so test
  bodies stay simple. Every request runs on ONE persistent event loop, which
  keeps aiosqlite pool connections loop-consistent.
"""
import os
import tempfile
import hashlib

# --- env must be set before app.config is imported anywhere ---------------
_TMP = tempfile.mkdtemp(prefix="mkindayzir-test-")
os.environ["DATABASE_PROVIDER"] = "sqlite"
os.environ["DATA_DIR"] = os.path.join(_TMP, "data")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["BACKUP_DIR"] = os.path.join(_TMP, "backups")
os.environ["MKINDAYZIR_MODE"] = "team"           # exercise RBAC paths
os.environ["AUTO_LOGIN"] = "false"
os.environ["REGISTRATION_ENABLED"] = "true"
# deterministic 32-byte hex keys so encryption round-trips are testable
os.environ["SESSION_SECRET"] = hashlib.sha256(b"s").hexdigest()
os.environ["ENCRYPTION_KEY"] = hashlib.sha256(b"e").hexdigest()

import sys
import asyncio
from pathlib import Path

import pytest  # noqa: E402
import httpx  # noqa: E402

_BACKEND_DIR = str(Path(__file__).resolve().parents[1])
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


class SyncClient:
    """Blocking facade over httpx.AsyncClient running on one event loop."""

    def __init__(self, async_client: httpx.AsyncClient, loop: asyncio.AbstractEventLoop):
        self._ac = async_client
        self._loop = loop

    def _run(self, coro):
        return self._loop.run_until_complete(coro)

    # -- verb passthroughs -------------------------------------------------
    def get(self, url, **kw):
        return self._run(self._ac.get(url, **kw))

    def post(self, url, json=None, **kw):
        return self._run(self._ac.post(url, json=json, **kw))

    def patch(self, url, json=None, **kw):
        return self._run(self._ac.patch(url, json=json, **kw))

    def put(self, url, json=None, **kw):
        return self._run(self._ac.put(url, json=json, **kw))

    def delete(self, url, **kw):
        return self._run(self._ac.delete(url, **kw))

    @property
    def cookies(self):
        return self._ac.cookies


@pytest.fixture()
def client():
    from pathlib import Path as _Path
    from app.config import settings as cfg

    # httpx.ASGITransport does not execute FastAPI lifespan hooks, so do the
    # same storage-dir bootstrap the server's lifespan performs.
    for d in (cfg.data_dir, cfg.UPLOAD_DIR, cfg.BACKUP_DIR):
        _Path(d).mkdir(parents=True, exist_ok=True)

    from app.database import engine
    from app.models import Base as ModelsBase
    from app.main import app

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(ModelsBase.metadata.create_all)

    loop.run_until_complete(_create())

    transport = httpx.ASGITransport(app=app)
    ac = httpx.AsyncClient(transport=transport, base_url="http://test")

    yield SyncClient(ac, loop)

    async def _teardown():
        await ac.aclose()
        async with engine.begin() as conn:
            await conn.run_sync(ModelsBase.metadata.drop_all)
        await engine.dispose()

    loop.run_until_complete(_teardown())
    loop.close()


ADMIN = {"email": "admin@example.com", "password": "supersecret123", "displayName": "Admin"}
MEMBER = {"email": "member@example.com", "password": "memberpass123", "displayName": "Member"}
VIEWER = {"email": "viewer@example.com", "password": "viewerpass123", "displayName": "Viewer"}


def setup_users(client):
    """Create admin via setup wizard + member/viewer via register.

    /api/auth/register hardcodes role=MEMBER, so the VIEWER account is
    promoted with a direct DB update afterwards (equivalent to an admin
    changing the role; no public promote endpoint exists).
    """
    r = client.post("/api/setup/", json={"mode": "team", **ADMIN, "confirmPassword": ADMIN["password"]})
    assert r.status_code == 201, r.text
    for u in (MEMBER, VIEWER):
        r = client.post("/api/auth/register", json=u)
        assert r.status_code == 201, r.text
    import sqlite3
    con = sqlite3.connect(os.path.join(os.environ["DATA_DIR"], "mkindayzir.db"))
    con.execute("UPDATE users SET role='VIEWER' WHERE email=?", (VIEWER["email"],))
    con.commit()
    con.close()


def login(client, who):
    r = client.post("/api/auth/login", json={"email": who["email"], "password": who["password"]})
    assert r.status_code == 200, r.text
    return r
