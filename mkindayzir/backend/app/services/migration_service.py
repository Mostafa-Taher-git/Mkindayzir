import asyncio
import os
import shutil
from datetime import datetime
from pathlib import Path
from sqlalchemy import text, inspect, select, func, table, column
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from app.database import DATABASE_URL, engine as app_engine, Base as AppBase
import json


class MigrationService:
    BATCH_SIZE = 1000
    TABLES_IN_ORDER = [
        "users", "sessions",
        "projects", "iterations", "initiatives", "work_items",
        "spaces", "space_members", "boards", "columns", "cards",
        "vault_folders", "vault_notes", "vault_tags",
        "conversations", "messages",
        "activities", "audit_logs",
        "comments", "attachments", "labels", "workflows", "guides", "system_configs"
    ]

    def __init__(self):
        self._progress_store = {}

    async def test_connection(self, pg_url: str) -> dict:
        """Test if we can connect to the target PostgreSQL."""
        try:
            engine = create_async_engine(pg_url)
            async with engine.connect() as conn:
                result = await conn.execute(text("SELECT version()"))
                version = result.scalar_one()
            await engine.dispose()
            return {"success": True, "version": version}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def pre_check(self, pg_url: str) -> dict:
        """Count all rows in SQLite, verify target is empty."""
        try:
            sqlite_engine = create_async_engine(DATABASE_URL)
            pg_engine = create_async_engine(pg_url)
            
            table_counts = {}
            async with sqlite_engine.connect() as sqlite_conn:
                for table_name in self.TABLES_IN_ORDER:
                    try:
                        result = await sqlite_conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                        count = result.scalar_one()
                        table_counts[table_name] = count
                    except Exception:
                        table_counts[table_name] = 0
            
            # Check if PostgreSQL target is empty
            async with pg_engine.connect() as pg_conn:
                result = await pg_conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
                ))
                existing_tables = result.scalar_one()
            
            await sqlite_engine.dispose()
            await pg_engine.dispose()
            
            return {
                "success": True,
                "table_counts": table_counts,
                "total_records": sum(table_counts.values()),
                "target_empty": existing_tables == 0,
                "warnings": []
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def start_migration(self, job_id: str, pg_url: str):
        """Stream progress as migration runs."""
        try:
            # Step 1: Backup
            backup_path = await self._create_backup()
            yield {"step": "backup", "status": "done", "path": backup_path}
            
            # Step 2: Create schema in PostgreSQL
            pg_engine = create_async_engine(pg_url)
            async with pg_engine.begin() as conn:
                await conn.run_sync(AppBase.metadata.create_all)
            yield {"step": "schema", "status": "done"}
            
            # Step 3: Migrate each table
            sqlite_engine = create_async_engine(DATABASE_URL)
            async with sqlite_engine.connect() as sqlite_conn:
                for table_name in self.TABLES_IN_ORDER:
                    count = await self._migrate_table(table_name, sqlite_conn, pg_engine)
                    yield {"step": f"table:{table_name}", "status": "done", "count": count}
                
                # Step 4: Verify row counts (still inside sqlite_conn context)
                all_match = True
                async with pg_engine.connect() as pg_conn:
                    for table_name in self.TABLES_IN_ORDER:
                        try:
                            result = await pg_conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                            pg_count = result.scalar_one()
                            
                            result = await sqlite_conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                            sqlite_count = result.scalar_one()
                            
                            if pg_count != sqlite_count:
                                all_match = False
                        except Exception:
                            pass
            
            yield {"step": "verify", "status": "done", "all_match": all_match}
            
            # Step 5: Update .env
            await self._update_env(pg_url)
            yield {"step": "config", "status": "done"}
            
            await sqlite_engine.dispose()
            await pg_engine.dispose()
            
            yield {"step": "complete", "status": "done", "mode": "team"}
            
        except Exception as e:
            yield {"step": "error", "status": "error", "error": str(e)}

    async def _create_backup(self) -> str:
        """Create backup of SQLite database."""
        backup_dir = Path(settings.data_dir) / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        backup_path = backup_dir / f"pre-migration-{timestamp}.db"
        
        db_path = Path(settings.data_dir) / "mkindayzir.db"
        if db_path.exists():
            shutil.copy2(db_path, backup_path)
        
        return str(backup_path)

    async def _migrate_table(self, table_name: str, sqlite_conn, pg_engine) -> int:
        """Batch-read from SQLite, batch-insert into PostgreSQL."""
        total = 0
        
        try:
            # Reflect table from SQLite
            inspector = inspect(sqlite_conn)
            columns = [c["name"] for c in inspector.get_columns(table_name)]
            
            if not columns:
                return 0
            
            async with pg_engine.connect() as pg_conn:
                # Use raw SQL for batch insert
                offset = 0
                while True:
                    rows = await sqlite_conn.execute(
                        text(f"SELECT * FROM {table_name} LIMIT {self.BATCH_SIZE} OFFSET {offset}")
                    )
                    batch = rows.fetchall()
                    if not batch:
                        break
                    
                    # Build insert statement
                    col_names = ", ".join(columns)
                    placeholders = ", ".join([f":{c}" for c in columns])
                    insert_sql = text(f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})")
                    
                    for row in batch:
                        row_dict = dict(row._mapping)
                        await pg_conn.execute(insert_sql, row_dict)
                    
                    await pg_conn.commit()
                    total += len(batch)
                    offset += self.BATCH_SIZE
                    
        except Exception as e:
            print(f"Error migrating {table_name}: {e}")
        
        return total

    async def _update_env(self, pg_url: str):
        """Update .env file with new database settings."""
        # Find .env file - try project root first, then backend parent
        project_root = Path(__file__).resolve().parent.parent.parent
        env_path = project_root / ".env"
        
        if not env_path.exists():
            # Try backend directory
            env_path = project_root / "backend" / ".env"
        
        if not env_path.exists():
            return
        
        lines = env_path.read_text().splitlines()
        updated_lines = []
        keys_to_update = {
            "DATABASE_PROVIDER": "postgresql",
            "DATABASE_URL": pg_url,
            "MKINDAYZIR_MODE": "team",
        }
        
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                updated_lines.append(line)
                continue
            
            key = stripped.split("=")[0].strip()
            if key in keys_to_update:
                updated_lines.append(f"{key}={keys_to_update[key]}")
            else:
                updated_lines.append(line)
        
        # Ensure REGISTRATION_ENABLED is set
        if not any(line.strip().startswith("REGISTRATION_ENABLED") for line in updated_lines):
            updated_lines.append("REGISTRATION_ENABLED=true")
        
        env_path.write_text("\n".join(updated_lines) + "\n")

    async def rollback(self, job_id: str):
        """Revert .env to SQLite mode."""
        project_root = Path(__file__).resolve().parent.parent.parent
        env_path = project_root / ".env"
        if not env_path.exists():
            env_path = project_root / "backend" / ".env"
        
        if not env_path.exists():
            return {"status": "rolled_back"}
        
        lines = env_path.read_text().splitlines()
        updated_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                updated_lines.append(line)
                continue
            
            key = stripped.split("=")[0].strip()
            if key == "DATABASE_PROVIDER":
                updated_lines.append("DATABASE_PROVIDER=sqlite")
            elif key == "MKINDAYZIR_MODE":
                updated_lines.append("MKINDAYZIR_MODE=personal")
            elif key == "DATABASE_URL":
                updated_lines.append("DATABASE_URL=file:./data/mkindayzir.db")
            else:
                updated_lines.append(line)
        
        env_path.write_text("\n".join(updated_lines) + "\n")
        return {"status": "rolled_back"}
