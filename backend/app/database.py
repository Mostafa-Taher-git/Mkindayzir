from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


def coerce_async_url(url: str) -> str:
    """Ensure a database URL uses an async driver.

    SQLAlchemy 2.0 async engines require the async scheme
    (``postgresql+asyncpg://``). Plain ``postgresql://`` / ``postgres://``
    URLs raise when used with ``create_async_engine``.
    """
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://") or url.startswith("postgres+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    return url


if settings.database_provider == "sqlite":
    DATABASE_URL = f"sqlite+aiosqlite:///{settings.data_dir}/mkindayzir.db"
else:
    DATABASE_URL = coerce_async_url(settings.database_url)

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


AppBase = Base


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
