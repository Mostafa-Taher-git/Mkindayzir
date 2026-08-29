"""
AI Service - handles communication with AI providers and tool execution.
"""
import httpx
import json
from typing import AsyncGenerator

from app.config import settings

# Tool definitions that the AI can use
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_work_items",
            "description": "Search work items by query, status, assignee, or project",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "status": {"type": "string", "description": "Filter by status"},
                    "project_id": {"type": "string", "description": "Filter by project ID"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_work_item",
            "description": "Create a new work item in a project",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "title": {"type": "string"},
                    "type": {"type": "string", "enum": ["TASK", "BUG", "FEATURE", "IMPROVEMENT"]},
                    "priority": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
                    "description": {"type": "string"},
                },
                "required": ["project_id", "title", "type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_vault",
            "description": "Search knowledge vault notes by query",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vault_note",
            "description": "Get the full content of a vault note by ID or slug",
            "parameters": {
                "type": "object",
                "properties": {
                    "identifier": {"type": "string", "description": "Note ID or slug"},
                },
                "required": ["identifier"],
            },
        },
    },
]

PROVIDER_URLS = {
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
}

SYSTEM_PROMPT = """You are the Mkindayzir Assistant - an AI helper integrated into the Mkindayzir Work OS.
You can help users with:
- Searching and managing work items (tasks, bugs, features)
- Finding information in the knowledge vault
- Creating new work items
- Answering questions about their projects and tasks

Be concise, helpful, and professional. When you find relevant information, present it clearly.
If you need to perform an action, use the available tools."""


class AIService:
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=60.0)

    async def stream_chat(
        self,
        message: str,
        history: list,
        api_key: str,
        provider: str,
        model: str,
        user_id: str,
    ) -> AsyncGenerator[dict, None]:
        """Stream chat completion from AI provider."""

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history)
        messages.append({"role": "user", "content": message})

        if provider == "anthropic":
            async for event in self._stream_anthropic(messages, api_key, model):
                yield event
        else:
            async for event in self._stream_openai_compatible(messages, api_key, provider, model):
                yield event

    async def _stream_openai_compatible(
        self, messages: list, api_key: str, provider: str, model: str
    ) -> AsyncGenerator[dict, None]:
        """Stream from OpenAI-compatible API (OpenRouter, OpenAI, custom)."""

        url = PROVIDER_URLS.get(provider, provider)  # custom = full URL
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if provider == "openrouter":
            headers["HTTP-Referer"] = "http://localhost:8000"
            headers["X-Title"] = "Mkindayzir"

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "tools": TOOLS,
        }

        try:
            async with self.http_client.stream(
                "POST", url, headers=headers, json=payload
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield {"type": "error", "data": {"message": f"AI provider error: {error_body.decode()}"}}
                    return

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        yield {"type": "done", "data": {"finished": True}}
                        return

                    try:
                        chunk = json.loads(data)
                        choice = chunk.get("choices", [{}])[0]
                        delta = choice.get("delta", {})

                        if "content" in delta and delta["content"]:
                            yield {"type": "token", "data": {"content": delta["content"]}}

                        if "tool_calls" in delta:
                            for tc in delta["tool_calls"]:
                                if tc.get("function", {}).get("name"):
                                    yield {
                                        "type": "tool_call",
                                        "data": {
                                            "id": tc.get("id", ""),
                                            "name": tc["function"]["name"],
                                            "arguments": tc["function"].get("arguments", ""),
                                        },
                                    }
                    except json.JSONDecodeError:
                        continue

        except httpx.ConnectError:
            yield {"type": "error", "data": {"message": "Cannot connect to AI provider. Check your internet connection."}}
        except Exception as e:
            yield {"type": "error", "data": {"message": f"AI error: {str(e)}"}}

    async def _stream_anthropic(
        self, messages: list, api_key: str, model: str
    ) -> AsyncGenerator[dict, None]:
        """Stream from Anthropic's native API."""

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }

        # Convert messages format for Anthropic
        system = ""
        anthropic_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                anthropic_messages.append(msg)

        payload = {
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": anthropic_messages,
            "stream": True,
        }

        try:
            async with self.http_client.stream(
                "POST", url, headers=headers, json=payload
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield {"type": "error", "data": {"message": f"Anthropic error: {error_body.decode()}"}}
                    return

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    try:
                        event = json.loads(line[6:])
                        event_type = event.get("type", "")

                        if event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield {"type": "token", "data": {"content": delta["text"]}}

                        elif event_type == "message_stop":
                            yield {"type": "done", "data": {"finished": True}}

                    except json.JSONDecodeError:
                        continue

        except httpx.ConnectError:
            yield {"type": "error", "data": {"message": "Cannot connect to Anthropic. Check your internet connection."}}
        except Exception as e:
            yield {"type": "error", "data": {"message": f"Anthropic error: {str(e)}"}}

    async def execute_tool(self, tool_name: str, arguments: dict, session_token: str) -> dict:
        """Execute a tool by calling back to the Next.js API."""

        nextjs_base = settings.nextjs_url
        headers = {"Cookie": f"session={session_token}", "Content-Type": "application/json"}

        try:
            if tool_name == "search_work_items":
                query = arguments.get("query", "")
                res = await self.http_client.get(
                    f"{nextjs_base}/api/search",
                    params={"q": query, "types": "work_item"},
                    headers=headers,
                )
                return res.json() if res.status_code == 200 else {"error": "Search failed"}

            elif tool_name == "create_work_item":
                res = await self.http_client.post(
                    f"{nextjs_base}/api/work-items",
                    json=arguments,
                    headers=headers,
                )
                return res.json() if res.status_code in (200, 201) else {"error": "Create failed"}

            elif tool_name == "search_vault":
                query = arguments.get("query", "")
                res = await self.http_client.get(
                    f"{nextjs_base}/api/search",
                    params={"q": query, "types": "vault_note"},
                    headers=headers,
                )
                return res.json() if res.status_code == 200 else {"error": "Search failed"}

            elif tool_name == "get_vault_note":
                identifier = arguments.get("identifier", "")
                res = await self.http_client.get(
                    f"{nextjs_base}/api/vault/notes/{identifier}",
                    headers=headers,
                )
                return res.json() if res.status_code == 200 else {"error": "Note not found"}

            else:
                return {"error": f"Unknown tool: {tool_name}"}

        except Exception as e:
            return {"error": str(e)}
