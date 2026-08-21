"""
AI Models route - returns available models for each provider.
"""
from fastapi import APIRouter

router = APIRouter()

PROVIDER_MODELS = {
    "openrouter": [
        {"id": "anthropic/claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "context": 200000},
        {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "context": 200000},
        {"id": "openai/gpt-4o", "name": "GPT-4o", "context": 128000},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "context": 128000},
        {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash", "context": 1000000},
        {"id": "meta-llama/llama-3.1-70b-instruct", "name": "Llama 3.1 70B", "context": 131072},
    ],
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o", "context": 128000},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "context": 128000},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "context": 128000},
    ],
    "anthropic": [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "context": 200000},
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "context": 200000},
        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "context": 200000},
    ],
    "custom": [],
}


@router.get("/models")
async def get_models(provider: str = "openrouter"):
    """Get available models for a provider."""
    models = PROVIDER_MODELS.get(provider, [])
    return {"provider": provider, "models": models}
