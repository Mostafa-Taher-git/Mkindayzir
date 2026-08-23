import httpx
from app.config import settings
from app.utils.encryption import decrypt, get_encryption_key


DEFAULT_PROVIDERS = {
    "openrouter": {"baseUrl": "https://openrouter.ai/api/v1", "defaultModel": "meta-llama/llama-3.1-8b-instruct:free"},
    "openai": {"baseUrl": "https://api.openai.com/v1", "defaultModel": "gpt-4o-mini"},
    "anthropic": {"baseUrl": "https://api.anthropic.com/v1", "defaultModel": "claude-3-haiku-20240307"},
    "custom": {"baseUrl": "", "defaultModel": ""},
}


class AIService:
    @staticmethod
    async def get_provider_config(user: dict) -> dict:
        provider_name = user.get("aiProvider") or "openrouter"
        provider_defaults = DEFAULT_PROVIDERS.get(provider_name, DEFAULT_PROVIDERS["openrouter"])

        encrypted_api_key = user.get("aiApiKey")
        if not encrypted_api_key:
            raise ValueError("No API key configured. Please add your API key in Settings.")

        key = get_encryption_key()
        api_key = decrypt(encrypted_api_key, key)

        return {
            "name": provider_name,
            "provider": provider_name,
            "baseUrl": provider_defaults["baseUrl"],
            "apiKey": api_key,
            "model": user.get("aiModel") or provider_defaults["defaultModel"],
        }

    @staticmethod
    async def get_available_models(provider_name: str) -> list[dict]:
        provider_defaults = DEFAULT_PROVIDERS.get(provider_name, DEFAULT_PROVIDERS["openrouter"])
        base_url = provider_defaults["baseUrl"]
        if not base_url:
            raise ValueError("Custom provider requires a base URL")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{base_url}/models")
            if not response.is_success:
                raise ValueError(f"Failed to fetch models: {response.status_text}")
            data = response.json()
            models = data.get("data") or []
            return [{"id": m.get("id", ""), "name": m.get("name") or m.get("id", "")} for m in models]

    @staticmethod
    async def stream_chat(messages, provider_config, tools, callbacks, user_id):
        async with httpx.AsyncClient(timeout=120.0) as client:
            is_anthropic = provider_config["name"] == "anthropic"
            request_body = {
                "model": provider_config["model"],
                "messages": messages,
                "stream": True,
            }
            if tools and len(tools) > 0:
                request_body["tools"] = tools
            if is_anthropic:
                request_body["max_tokens"] = 4096

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {provider_config['apiKey']}",
            }
            if is_anthropic:
                headers["anthropic-version"] = "2023-06-01"
                headers["x-api-key"] = provider_config["apiKey"]
                del headers["Authorization"]

            async with client.stream(
                "POST",
                f"{provider_config['baseUrl']}/chat/completions",
                json=request_body,
                headers=headers,
            ) as response:
                if not response.is_success:
                    error_text = await response.aread()
                    if callbacks and callbacks.get("onError"):
                        callbacks["onError"](Exception(f"AI provider error ({response.status_code}): {error_text.decode()}"))
                    return

                buffer = ""
                full_content = ""
                total_tokens = 0
                done_sent = False

                async for chunk in response.aiter_text():
                    buffer += chunk
                    lines = buffer.split("\n")
                    buffer = lines.pop() or ""
                    for line in lines:
                        trimmed = line.strip()
                        if not trimmed or not trimmed.startswith("data:"):
                            continue
                        data_str = trimmed[5:].strip()
                        if data_str == "[DONE]":
                            if not done_sent:
                                done_sent = True
                                if callbacks and callbacks.get("onDone"):
                                    callbacks["onDone"]({"content": full_content, "tokensUsed": total_tokens or None})
                            return
                        try:
                            import json as _json
                            parsed = _json.loads(data_str)
                            if is_anthropic and parsed.get("type") == "content_block_delta":
                                token = parsed.get("delta", {}).get("text", "")
                                full_content += token
                                if callbacks and callbacks.get("onToken"):
                                    callbacks["onToken"](token)
                                continue
                            choices = parsed.get("choices") or []
                            if not choices:
                                continue
                            choice = choices[0]
                            delta = choice.get("delta") or {}
                            if delta.get("content"):
                                token = delta["content"]
                                full_content += token
                                if callbacks and callbacks.get("onToken"):
                                    callbacks["onToken"](token)
                            if delta.get("tool_calls"):
                                for tc in delta["tool_calls"]:
                                    fn = tc.get("function") or {}
                                    name = fn.get("name", "")
                                    args = {}
                                    if fn.get("arguments"):
                                        try:
                                            args = _json.loads(fn["arguments"])
                                        except Exception:
                                            args = {"raw": fn["arguments"]}
                                    if callbacks and callbacks.get("onToolCall"):
                                        callbacks["onToolCall"]({"name": name, "arguments": args})
                            if choice.get("finish_reason") in ("stop", "tool_use"):
                                usage = parsed.get("usage") or {}
                                total_tokens = (usage.get("prompt_tokens") or 0) + (usage.get("completion_tokens") or 0)
                                if not done_sent:
                                    done_sent = True
                                    if callbacks and callbacks.get("onDone"):
                                        callbacks["onDone"]({"content": full_content, "tokensUsed": total_tokens or None})
                        except Exception:
                            continue
                if not done_sent:
                    if callbacks and callbacks.get("onDone"):
                        callbacks["onDone"]({"content": full_content, "tokensUsed": total_tokens or None})
