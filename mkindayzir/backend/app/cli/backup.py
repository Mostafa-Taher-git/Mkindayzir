import click
import asyncio
import os
import shutil
import tarfile
from datetime import datetime
from pathlib import Path
from app.config import settings

@click.group()
def backup_cli():
    """Backup and restore commands."""
    pass

@backup_cli.command()
@click.option("--output", help="Output path for backup file")
def create(output):
    """Create a backup of the database and uploads."""
    backup_dir = Path(settings.data_dir) / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    if not output:
        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        output = str(backup_dir / f"mkindayzir-backup-{timestamp}.tar.gz")

    with tarfile.open(output, "w:gz") as tar:
        db_path = Path(settings.data_dir) / "mkindayzir.db"
        if db_path.exists():
            tar.add(db_path, arcname="mkindayzir.db")
            click.echo(f"✓ Database backed up: {db_path}")

        uploads_dir = Path(settings.data_dir) / "uploads"
        if uploads_dir.exists():
            tar.add(uploads_dir, arcname="uploads")
            click.echo(f"✓ Uploads backed up: {uploads_dir}")

    size = Path(output).stat().st_size / (1024 * 1024)
    click.echo(f"\n✓ Backup created: {output} ({size:.1f} MB)")

@backup_cli.command()
@click.argument("backup_file", type=click.Path(exists=True))
@click.option("--force", is_flag=True, help="Overwrite existing data")
def restore(backup_file, force):
    """Restore from a backup file."""
    if not force:
        click.confirm("This will overwrite existing data. Continue?", abort=True)

    extract_dir = Path(settings.data_dir)

    with tarfile.open(backup_file, "r:gz") as tar:
        tar.extractall(extract_dir)

    click.echo(f"✓ Restored from {backup_file}")
