import os
import click
from pathlib import Path
from .setup import setup_cli
from .migrate import migrate_cli
from .backup import backup_cli
from .password import password_cli
from .seed_demo import main as seed_demo_main


@click.group()
def cli():
    """Mkindayzir command-line interface."""
    pass


cli.add_command(setup_cli)
cli.add_command(migrate_cli)
cli.add_command(backup_cli)
cli.add_command(password_cli)


@cli.command("seed-demo")
@click.option("--force", is_flag=True, help="Re-run even if the flag file exists (still idempotent per user).")
def seed_demo(force):
    """Create the standard demo/test accounts (see docs/TEST_ACCOUNTS.md)."""
    seed_demo_main()


@cli.command()
@click.option("--mode", default="personal", help="Run mode: personal (SQLite) or team (PostgreSQL).")
@click.option("--host", default="0.0.0.0", help="Bind host.")
@click.option("--port", default=3000, type=int, help="Bind port (production serves PORT 3000).")
@click.option("--reload", is_flag=True, help="Enable auto-reload (dev only).")
def start(mode, host, port, reload):
    """Launch the Mkindayzir server (API + built frontend in production)."""
    import subprocess
    import uvicorn

    os.environ["MKINDAYZIR_MODE"] = mode

    backend_dir = Path(__file__).resolve().parent.parent
    click.echo("Applying database migrations (alembic upgrade head) ...")
    migration = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        check=False,
    )
    if migration.returncode != 0:
        click.echo(
            "WARNING: 'alembic upgrade head' failed (returned "
            f"{migration.returncode}). Continuing without migrations. "
            "If this is unexpected, ensure alembic.ini exists in the backend directory."
        )

    click.echo(f"Starting Mkindayzir (mode={mode}) on {host}:{port} ...")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


@cli.command()
def version():
    """Show version information."""
    click.echo("Mkindayzir 1.0.0")


if __name__ == "__main__":
    cli()
