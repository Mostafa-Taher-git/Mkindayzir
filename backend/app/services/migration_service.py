import asyncio
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import text, select, insert, func
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.database import (
    DATABASE_URL,
    coerce_async_url,
    Base as AppBase,
)

import app.models  # registers all table classes on Base.metadata



class MigrationService:
    BATCH_SIZE = 1000

    def __init__(self):
        # Per-job progress store. Each entry:
        #   {
        #     "current": <last step dict>,
        #     "history": [<step dict>, ...],
        #     "done": bool,
        #     "error": Optional[str],
        #     "subscribers": set(asyncio.Queue),
        #   }
        self._jobs: dict[str, dict] = {}

    # ------------------------------------------------------------------ #
    # URL coercion
    # ------------------------------------------------------------------ #
    @staticmethod
    def _coerce(url: str) -> str:
        return coerce_async_url(url)

    # ------------------------------------------------------------------ #
    # Table ordering derived from metadata (topological by FK)
    # ------------------------------------------------------------------ #
    @property
    def tables_in_order(self) -> list[str]:
        return [t.name for t in AppBase.metadata.sorted_tables]

    # ------------------------------------------------------------------ #
    # Progress store / SSE
    # ------------------------------------------------------------------ #
    def register_job(self, job_id: str) -> None:
        if job_id not in self._jobs:
            self._jobs[job_id] = {
                "current": None,
                "history": [],
                "done": False,
                "error": None,
                "subscribers": set(),
            }

    def _emit(self, job_id: str, step: dict) -> None:
        job = self._jobs.setdefault(
            job_id,
            {"current": None, "history": [], "done": False, "error": None, "subscribers": set()},
        )
        job["history"].append(step)
        job["current"] = step
        if step.get("step") in ("complete", "error"):
            job["done"] = True
            if step.get("status") == "error":
                job["error"] = step.get("error")
        for q in list(job["subscribers"]):
            try:
                q.put_nowait(step)
            except asyncio.QueueFull:
                pass

    async def get_progress(self, job_id: str) -> Optional[dict]:
        job = self._jobs.get(job_id)
        if job is None:
            return None
        return {
            "job_id": job_id,
            "current": job["current"],
            "history": job["history"],
            "done": job["done"],
            "error": job["error"],
        }

    async def subscribe_progress(self, job_id: str):
        """Async generator that yields new steps as they are emitted (SSE)."""
        job = self._jobs.get(job_id)
        if job is None:
            return
        q: asyncio.Queue = asyncio.Queue(maxsize=1024)
        job["subscribers"].add(q)
        sent = 0
        try:
            while sent < len(job["history"]):
                yield job["history"][sent]
                sent += 1
            while not job["done"] or sent < len(job["history"]):
                try:
                    step = await asyncio.wait_for(q.get(), timeout=30)
                except asyncio.TimeoutError:
                    yield {"step": "heartbeat", "status": "running"}
                    continue
                yield step
                sent += 1
        finally:
            job["subscribers"].discard(q)

    # ------------------------------------------------------------------ #
    # Connection helpers
    # ------------------------------------------------------------------ #
    def _sqlite_engine(self):
        return create_async_engine(DATABASE_URL)

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    async def test_connection(self, pg_url: str) -> dict:
        """Test if we can connect to the target PostgreSQL."""
        engine = None
        try:
            engine = create_async_engine(self._coerce(pg_url))
            async with engine.connect() as conn:
                result = await conn.execute(text("SELECT version()"))
                version = result.scalar_one()
            return {"success": True, "version": version}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            if engine is not None:
                await engine.dispose()

    async def pre_check(self, pg_url: str) -> dict:
        """Count all rows in SQLite, verify target is empty."""
        sqlite_engine = None
        pg_engine = None
        try:
            sqlite_engine = self._sqlite_engine()
            pg_engine = create_async_engine(self._coerce(pg_url))

            table_counts: dict[str, int] = {}
            async with sqlite_engine.connect() as sqlite_conn:
                for table_name in self.tables_in_order:
                    try:
                        table = AppBase.metadata.tables[table_name]
                        result = await sqlite_conn.execute(
                            sa.select(func.count()).select_from(table)
                        )
                        count = result.scalar_one() or 0
                        table_counts[table_name] = count
                    except Exception:
                        table_counts[table_name] = 0

            warnings: list[str] = []
            target_empty = True
            async with pg_engine.connect() as pg_conn:
                result = await pg_conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
                ))
                existing_tables = result.scalar_one() or 0
                target_empty = existing_tables == 0
                if not target_empty:
                    warnings.append(
                        "Target PostgreSQL already contains tables; migration may fail or duplicate data."
                    )

            return {
                "success": True,
                "table_counts": table_counts,
                "total_records": sum(table_counts.values()),
                "target_empty": target_empty,
                "warnings": warnings,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            if sqlite_engine is not None:
                await sqlite_engine.dispose()
            if pg_engine is not None:
                await pg_engine.dispose()

    async def start_migration(self, job_id: str, pg_url: str):
        """Stream progress as migration runs."""
        self.register_job(job_id)
        coerced_pg_url = self._coerce(pg_url)
        sqlite_engine = None
        pg_engine = None
        try:
            # Step 1: Backup
            backup_path = await self._create_backup()
            step = {"step": "backup", "status": "done", "path": backup_path}
            self._emit(job_id, step)
            yield step

            # Step 2: Create schema in PostgreSQL
            pg_engine = create_async_engine(coerced_pg_url)
            async with pg_engine.begin() as conn:
                await conn.run_sync(AppBase.metadata.create_all)
            step = {"step": "schema", "status": "done"}
            self._emit(job_id, step)
            yield step

            # Step 3: Migrate each table (in FK order)
            sqlite_engine = self._sqlite_engine()
            mismatches: list[str] = []
            async with sqlite_engine.connect() as sqlite_conn:
                for table_name in self.tables_in_order:
                    count = await self._migrate_table(table_name, sqlite_conn, pg_engine)
                    step = {"step": f"table:{table_name}", "status": "done", "count": count}
                    self._emit(job_id, step)
                    yield step

                # Step 4: Verify row counts
                async with pg_engine.connect() as pg_conn:
                    for table_name in self.tables_in_order:
                        table = AppBase.metadata.tables[table_name]
                        try:
                            r = await pg_conn.execute(
                                sa.select(func.count()).select_from(table)
                            )
                            pg_count = r.scalar_one() or 0
                            r = await sqlite_conn.execute(
                                sa.select(func.count()).select_from(table)
                            )
                            sqlite_count = r.scalar_one() or 0
                            if pg_count != sqlite_count:
                                mismatches.append(
                                    f"{table_name}: sqlite={sqlite_count} pg={pg_count}"
                                )
                        except Exception:
                            pass

            if mismatches:
                step = {
                    "step": "verify",
                    "status": "error",
                    "all_match": False,
                    "mismatches": mismatches,
                }
                self._emit(job_id, step)
                yield step
                step = {
                    "step": "error",
                    "status": "error",
                    "error": "Row count verification failed: " + "; ".join(mismatches),
                }
                self._emit(job_id, step)
                yield step
                return

            step = {"step": "verify", "status": "done", "all_match": True}
            self._emit(job_id, step)
            yield step

            # Step 5: Update .env
            await self._update_env(pg_url)
            step = {"step": "config", "status": "done"}
            self._emit(job_id, step)
            yield step

            step = {"step": "complete", "status": "done", "mode": "team"}
            self._emit(job_id, step)
            yield step
        except Exception as e:
            step = {"step": "error", "status": "error", "error": str(e)}
            self._emit(job_id, step)
            yield step
        finally:
            if sqlite_engine is not None:
                await sqlite_engine.dispose()
            if pg_engine is not None:
                await pg_engine.dispose()

    async def _create_backup(self) -> str:
        """Create backup of SQLite database."""
        backup_dir = Path(settings.data_dir) / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        date = datetime.now().strftime("%Y-%m-%d")
        backup_path = backup_dir / f"pre-migration-{date}.db"

        db_path = Path(settings.data_dir) / "mkindayzir.db"
        if db_path.exists():
            shutil.copy2(db_path, backup_path)

        return str(backup_path)

    async def _migrate_table(self, table_name: str, sqlite_conn, pg_engine) -> int:
        """Batch-read from SQLite, batch-insert into PostgreSQL.

        Uses the SQLAlchemy Core metadata (not the async inspector, which is
        a coroutine in SQLAlchemy 2.0 async and cannot be awaited inline).
        """
        total = 0
        try:
            source_table = AppBase.metadata.tables[table_name]
            target_table = AppBase.metadata.tables[table_name]

            pk_cols = list(target_table.primary_key.columns)
            stmt = select(source_table)
            if pk_cols:
                stmt = stmt.order_by(*pk_cols)

            json_cols = {
                c.name for c in target_table.columns if isinstance(c.type, sa.JSON)
            }

            async with pg_engine.begin() as pg_conn:
                offset = 0
                while True:
                    batch_stmt = stmt.limit(self.BATCH_SIZE).offset(offset)
                    result = await sqlite_conn.execute(batch_stmt)
                    rows = result.mappings().all()
                    if not rows:
                        break

                    batch = []
                    for r in rows:
                        row_dict = dict(r)
                        for key in json_cols:
                            val = row_dict.get(key)
                            if isinstance(val, str):
                                try:
                                    row_dict[key] = json.loads(val)
                                except (json.JSONDecodeError, ValueError):
                                    pass
                        batch.append(row_dict)

                    await pg_conn.execute(insert(target_table), batch)
                    total += len(batch)
                    offset += self.BATCH_SIZE

            await self._reset_sequence(table_name, pg_engine)
        except Exception as e:
            print(f"Error migrating {table_name}: {e}")
        return total

    async def _reset_sequence(self, table_name: str, pg_engine) -> None:
        """Set the PostgreSQL serial sequence to MAX(pk) if present."""
        target_table = AppBase.metadata.tables.get(table_name)
        if target_table is None:
            return
        pk_cols = list(target_table.primary_key.columns)
        if not pk_cols or not all(isinstance(c.type, sa.Integer) for c in pk_cols):
            # Schema uses string UUID primary keys -> no sequence to reset.
            return
        pk = pk_cols[0]
        try:
            async with pg_engine.connect() as conn:
                res = await conn.execute(text(
                    "SELECT pg_get_serial_sequence(:t, :c)"
                ), {"t": table_name, "c": pk.name})
                seq = res.scalar_one_or_none()
                if not seq:
                    return
                res = await conn.execute(select(func.max(pk)).select_from(target_table))
                max_id = res.scalar_one_or_none()
                next_val = (max_id or 0) + 1
                await conn.execute(text("SELECT setval(:s, :v, false)"), {"s": seq, "v": next_val})
                await conn.commit()
        except Exception as e:
            print(f"Error resetting sequence for {table_name}: {e}")

    async def _update_env(self, pg_url: str) -> None:
        """Update .env file with new database settings (preserving other keys)."""
        project_root = Path(__file__).resolve().parent.parent.parent
        env_path = project_root / ".env"
        if not env_path.exists():
            env_path = project_root / "backend" / ".env"
        if not env_path.exists():
            return

        lines = env_path.read_text().splitlines()
        updated_lines: list[str] = []
        keys_to_update = {
            "DATABASE_PROVIDER": "postgres",
            "DATABASE_URL": pg_url,
            "MKINDAYZIR_MODE": "team",
        }
        seen = set()
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                updated_lines.append(line)
                continue
            key = stripped.split("=", 1)[0].strip()
            if key in keys_to_update:
                updated_lines.append(f"{key}={keys_to_update[key]}")
                seen.add(key)
            else:
                updated_lines.append(line)

        for key, val in keys_to_update.items():
            if key not in seen:
                updated_lines.append(f"{key}={val}")

        if not any(line.strip().startswith("REGISTRATION_ENABLED") for line in updated_lines):
            updated_lines.append("REGISTRATION_ENABLED=true")

        env_path.write_text("\n".join(updated_lines) + "\n")

    async def rollback(self, job_id: Optional[str] = None) -> dict:
        """Revert .env to SQLite / personal mode.

        NOTE: This only switches the configuration back to personal mode. The
        SQLite file is preserved untouched, so application data remains intact.
        A true data-level restore (copying a pre-migration backup back over the
        PostgreSQL database) is out of scope here and should be done via the
        backup/restore CLI commands if needed.
        """
        project_root = Path(__file__).resolve().parent.parent.parent
        env_path = project_root / ".env"
        if not env_path.exists():
            env_path = project_root / "backend" / ".env"
        if not env_path.exists():
            return {"status": "rolled_back", "note": "no .env file found"}

        lines = env_path.read_text().splitlines()
        updated_lines: list[str] = []
        seen = set()
        overrides = {
            "DATABASE_PROVIDER": "sqlite",
            "MKINDAYZIR_MODE": "personal",
            "DATABASE_URL": "file:./data/mkindayzir.db",
        }
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                updated_lines.append(line)
                continue
            key = stripped.split("=", 1)[0].strip()
            if key in overrides:
                updated_lines.append(f"{key}={overrides[key]}")
                seen.add(key)
            else:
                updated_lines.append(line)

        for key, val in overrides.items():
            if key not in seen:
                updated_lines.append(f"{key}={val}")

        env_path.write_text("\n".join(updated_lines) + "\n")
        return {"status": "rolled_back"}
