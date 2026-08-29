from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    encryption_key: str = ""
    nextjs_url: str = "http://localhost:8000"
    default_ai_provider: str = "openrouter"
    default_ai_model: str = "anthropic/claude-sonnet-4-20250514"
    ai_rate_limit: int = 20  # requests per minute per user
    port: int = 8000

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"


settings = Settings()
