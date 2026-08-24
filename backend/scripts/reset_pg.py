"""One-shot: drop & recreate the fresh Postgres schema."""
import asyncio

from app.database import engine, Base
import app.models  # noqa: F401 - register all models on Base


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("fresh PG schema ready")


asyncio.run(main())
