import click
import asyncio
import sys
import os
import subprocess
from pathlib import Path
from app.config import settings
from app.database import DATABASE_URL, engine, Base

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


@click.group()
def migrate_cli():
    """Database migration commands."""
    pass


@migrate_cli.command()
@click.option("--target", required=True, help="Target PostgreSQL URL (postgresql://user:pass@host:5432/dbname)")
def to_postgres(target):
    """Migrate data from SQLite to PostgreSQL."""
    from app.cli.migrate_db import migrate_sqlite_to_postgres

    async def _migrate():
        await migrate_sqlite_to_postgres(target)
        click.echo("\nMigration completed successfully!")

    try:
        asyncio.run(_migrate())
    except Exception as e:
        click.echo(f"✗ Migration failed: {e}", err=True)
        sys.exit(1)


@migrate_cli.command()
def migrate_db():
    """Migrate SQLite -> PostgreSQL using the proven service function."""
    from app.cli.migrate_db import migrate_sqlite_to_postgres

    target = os.environ.get("DATABASE_URL")
    if not target or target.startswith("sqlite"):
        click.echo("Set DATABASE_URL to a postgresql:// target first.", err=True)
        sys.exit(1)

    async def _run():
        await migrate_sqlite_to_postgres(target)

    asyncio.run(_run())


@migrate_cli.command()
def upgrade():
    """Run Alembic migrations (upgrade head)."""
    alembic_ini = BACKEND_DIR / "alembic.ini"
    if not alembic_ini.exists():
        click.echo(f"alembic.ini not found at {alembic_ini}", err=True)
        sys.exit(1)

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR),
    )
    if result.returncode != 0:
        click.echo("Alembic upgrade failed.", err=True)
        sys.exit(result.returncode)
    click.echo("Database migrated successfully!")
