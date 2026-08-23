from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
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
    DEFAULT_AI_MODEL: str = "anthropic/claude-sonnet-4-20250514"
    PYTHON_AI_URL: str = "http://localhost:8000"

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
