"""
Central application configuration.

All tunables live here. Values come from environment variables or a .env
file (see docs/CONFIGURATION.md for the full reference).

IMPORTANT — path handling:
    Relative filesystem settings (DATA_DIR, UPLOAD_DIR, BACKUP_DIR) are
    anchored to the *backend directory*, NOT the current working directory.
    This makes the app behave identically whether you launch it from
    `backend/`, the project root, or an installed `mkindayzir` console
    command. Absolute paths (e.g. /app/data in Docker) are used as-is.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Stable anchors derived from THIS file's location:
#   backend/app/config.py -> parents[1] = backend/, parents[2] = project root
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent


def _find_env_file() -> str:
    """Pick the most specific .env file available.

    Priority: current working directory first (lets a deployment override),
    then backend/.env, then project-root/.env. Returns '.env' when nothing
    exists so pydantic keeps its default behaviour.
    """
    for candidate in (Path.cwd() / ".env", BACKEND_DIR / ".env", PROJECT_ROOT / ".env"):
        if candidate.is_file():
            return str(candidate)
    return ".env"


def _anchor(value: str, base: Path) -> str:
    """Resolve a possibly-relative path against `base`; absolutes pass through."""
    p = Path(value)
    return str(p if p.is_absolute() else (base / p).resolve())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_find_env_file(), env_file_encoding="utf-8", extra="ignore"
    )

    # Core
    ENV: str = "development"
    MKINDAYZIR_MODE: str = "personal"
    AUTO_LOGIN: bool = False

    # Database
    DATABASE_PROVIDER: str = "sqlite"
    DATABASE_URL: str = "file:./data/mkindayzir.db"
    DATA_DIR: str = "./data"

    # Security
    SESSION_SECRET: str
    ENCRYPTION_KEY: str
    SESSION_MAX_AGE: int = 86400
    BCRYPT_ROUNDS: int = 12

    # File Storage
    UPLOAD_DIR: str = "./data/uploads"
    MAX_UPLOAD_SIZE: int = 26214400
    BACKUP_DIR: str = "./data/backups"

    # Rate Limiting
    RATE_LIMIT_GENERAL: int = 100
    RATE_LIMIT_AI: int = 20
    RATE_LIMIT_AUTH: int = 5

    # AI
    DEFAULT_AI_PROVIDER: str = "openrouter"
    DEFAULT_AI_MODEL: str = "nvidia/nemotron-3-super-120b-a12b:free"
    PYTHON_AI_URL: str = "http://localhost:8000"
    # Optional server-level fallback key so the assistant works out of the box
    # (personal user keys, stored encrypted, always take precedence).
    OPENROUTER_API_KEY: str = ""

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@mkindayzir.local"

    # Logging
    LOG_LEVEL: str = "info"
    LOG_FORMAT: str = "json"

    # Features
    REGISTRATION_ENABLED: bool = False
    GUIDE_CENTER_ENABLED: bool = True
    MAX_PROJECTS: int = 0
    MAX_USERS: int = 0

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Anchor every relative filesystem path to the backend directory so
        # storage locations never depend on where the process was started.
        self.DATA_DIR = _anchor(self.DATA_DIR, BACKEND_DIR)
        self.UPLOAD_DIR = _anchor(self.UPLOAD_DIR, BACKEND_DIR)
        self.BACKUP_DIR = _anchor(self.BACKUP_DIR, BACKEND_DIR)

    @property
    def database_url(self) -> str:
        if self.database_provider == "sqlite":
            return f"sqlite+aiosqlite:///{self.data_dir}/mkindayzir.db"
        return self.DATABASE_URL

    @property
    def database_provider(self) -> str:
        return self.DATABASE_PROVIDER

    @property
    def data_dir(self) -> str:
        return self.DATA_DIR

    def get_database_url(self) -> str:
        return self.database_url


settings = Settings()
