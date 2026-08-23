import asyncio
import sys
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.database import DATABASE_URL, Base as AppBase, coerce_async_url
from app.models import Base
import json


async def migrate_sqlite_to_postgres(target_url: str):
    sqlite_engine = create_async_engine(f"sqlite+aiosqlite:///{settings.data_dir}/mkindayzir.db")
    postgres_engine = create_async_engine(coerce_async_url(target_url))

    async with postgres_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)

    async with sqlite_engine.connect() as sqlite_conn:
        tables = AppBase.metadata.sorted_tables
        for table in tables:
            table_name = table.name
            json_cols = {c.name for c in table.columns if isinstance(c.type, sa.JSON)}
            stmt = table.select()
            if list(table.primary_key.columns):
                stmt = stmt.order_by(*table.primary_key.columns)

            offset = 0
            total = 0
            while True:
                batch = await sqlite_conn.execute(stmt.limit(1000).offset(offset))
                rows = batch.mappings().all()
                if not rows:
                    break
                records = []
                for r in rows:
                    row_dict = dict(r)
                    for key in json_cols:
                        val = row_dict.get(key)
                        if isinstance(val, str):
                            try:
                                row_dict[key] = json.loads(val)
                            except (json.JSONDecodeError, ValueError):
                                pass
                    records.append(row_dict)
                async with postgres_engine.begin() as pg_conn:
                    await pg_conn.execute(table.insert(), records)
                total += len(records)
                offset += 1000
            if total:
                print(f"{table_name}: migrated {total} rows")

    async with postgres_engine.connect() as pg_conn:
        for table in tables:
            r = await pg_conn.execute(sa.select(sa.func.count()).select_from(table))
            pg_count = r.scalar() or 0
            r = await sqlite_conn.execute(sa.select(sa.func.count()).select_from(table))
            sqlite_count = r.scalar() or 0
            print(f"{table_name}: SQLite={sqlite_count}, PostgreSQL={pg_count}")
            if pg_count != sqlite_count:
                print(f"WARNING: Row count mismatch for {table_name}")

    await sqlite_engine.dispose()
    await postgres_engine.dispose()
    print("Migration completed successfully!")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m app.cli.migrate_db --target postgresql://user:pass@host:5432/dbname")
        sys.exit(1)

    target_url = sys.argv[sys.argv.index("--target") + 1]
    asyncio.run(migrate_sqlite_to_postgres(target_url))


if __name__ == "__main__":
    main()
