import asyncio
import sys
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from app.database import DATABASE_URL, Base as AppBase
from app.models import Base
import aiosqlite
import json


async def migrate_sqlite_to_postgres(target_url: str):
    sqlite_engine = create_async_engine(f"sqlite+aiosqlite:///{settings.data_dir}/mkindayzir.db")

    postgres_engine = create_async_engine(target_url)

    async with postgres_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)

    async with sqlite_engine.connect() as sqlite_conn:
        tables = list(AppBase.metadata.tables.keys())
        for table_name in tables:
            table = AppBase.metadata.tables[table_name]
            result = await sqlite_conn.execute(table.select())
            rows = result.fetchall()

            if rows:
                async with postgres_engine.begin() as pg_conn:
                    for row in rows:
                        row_dict = dict(row._mapping)
                        for key, value in list(row_dict.items()):
                            if isinstance(value, str):
                                col = table.c.get(key)
                                if col and isinstance(col.type, sa.JSON):
                                    try:
                                        row_dict[key] = json.loads(value)
                                    except Exception:
                                        pass
                        await pg_conn.execute(table.insert().values(**row_dict))

    async with postgres_engine.connect() as pg_conn:
        for table_name in tables:
            table = AppBase.metadata.tables[table_name]
            result = await pg_conn.execute(sa.select(sa.func.count()).select_from(table))
            pg_count = result.scalar()

            result = await sqlite_conn.execute(sa.select(sa.func.count()).select_from(table))
            sqlite_count = result.scalar()

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
