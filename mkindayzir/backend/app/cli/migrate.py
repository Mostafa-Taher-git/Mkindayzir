import click
import asyncio
import sys
from app.config import settings
from app.database import DATABASE_URL, engine, Base

@click.group()
def migrate_cli():
    """Database migration commands."""
    pass

@migrate_cli.command()
@click.option("--target", required=True, help="Target PostgreSQL URL (postgresql://user:pass@host:5432/dbname)")
@click.option("--batch-size", default=1000, help="Batch size for migration")
def to_postgres(target, batch_size):
    """Migrate data from SQLite to PostgreSQL."""
    from app.services.migration_service import MigrationService
    service = MigrationService()

    async def _migrate():
        try:
            await service.test_connection(target)
            click.echo("✓ PostgreSQL connection successful")
        except Exception as e:
            click.echo(f"✗ Connection failed: {e}", err=True)
            sys.exit(1)

        click.echo("Starting migration...")
        async for progress in service.start_migration(target):
            step = progress.get("step", "unknown")
            status = progress.get("status", "running")
            count = progress.get("count")

            if status == "done":
                if count is not None:
                    click.echo(f"✓ {step}: {count} rows migrated")
                else:
                    click.echo(f"✓ {step}")
            elif status == "error":
                click.echo(f"✗ {step}: {progress.get('error')}", err=True)
                sys.exit(1)

        click.echo("\nMigration completed successfully!")

    asyncio.run(_migrate())

@migrate_cli.command()
def upgrade():
    """Run Alembic migrations."""
    from alembic import command
    from alembic.config import Config
    import os

    alembic_cfg = Config(os.path.join(settings.backend_dir, "alembic.ini"))
    command.upgrade(alembic_cfg, "head")
    click.echo("Database migrated successfully!")
