import click
from .setup import setup_cli
from .backup import backup_cli
from .password import password_cli
from .seed_demo import main as seed_demo_main


@click.group()
def cli():
    """Mkindayzir command-line interface."""
    pass


cli.add_command(setup_cli)
cli.add_command(backup_cli)
cli.add_command(password_cli)


@cli.command("seed-demo")
@click.option("--force", is_flag=True, help="Re-run even if the flag file exists (still idempotent per user).")
def seed_demo(force):
    """Create the standard demo/test accounts (see docs/TEST_ACCOUNTS.md)."""
    seed_demo_main()


@cli.command()
@click.option("--host", default="0.0.0.0", help="Bind host.")
@click.option("--port", default=8000, type=int, help="Bind port (production serves port 8000).")
@click.option("--reload", is_flag=True, help="Enable auto-reload (dev only).")
def start(host, port, reload):
    """Launch the Mkindayzir server (API + built frontend in production)."""
    import uvicorn

    click.echo(f"Starting Mkindayzir on {host}:{port} ...")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


@cli.command()
def version():
    """Show version information."""
    click.echo("Mkindayzir 1.0.0")


if __name__ == "__main__":
    cli()
