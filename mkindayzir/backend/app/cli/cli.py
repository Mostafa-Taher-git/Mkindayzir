import click
from .setup import setup_cli
from .migrate import migrate_cli
from .backup import backup_cli
from .password import password_cli

@click.group()
def cli():
    """Mkindayzir command-line interface."""
    pass

cli.add_command(setup_cli)
cli.add_command(migrate_cli)
cli.add_command(backup_cli)
cli.add_command(password_cli)

@cli.command()
def version():
    """Show version information."""
    click.echo("Mkindayzir 1.0.0")

if __name__ == "__main__":
    cli()
