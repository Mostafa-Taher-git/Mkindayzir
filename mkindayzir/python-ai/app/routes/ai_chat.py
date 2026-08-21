"""
AI Chat route - handles streaming conversations with AI providers.
"""
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.services.ai_service import AIService

router = APIRouter()
ai_service = AIService()


class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    user_id: str
    api_key: str  # Decrypted key passed from Next.js
    provider: str = "openrouter"
    model: str = "anthropic/claude-sonnet-4-20250514"
    history: list = []


class ToolCallResult(BaseModel):
    tool_call_id: str
    name: str
    result: str


@router.post("/chat")
async def chat(request: ChatRequest):
    """Stream AI chat response via Server-Sent Events."""

    if not request.api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured")

    async def event_generator():
        try:
            async for event in ai_service.stream_chat(
                message=request.message,
                history=request.history,
                api_key=request.api_key,
                provider=request.provider,
                model=request.model,
                user_id=request.user_id,
            ):
                yield {
                    "event": event["type"],
                    "data": json.dumps(event["data"]),
                }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }

    return EventSourceResponse(event_generator())


@router.post("/tools/execute")
async def execute_tool(request: Request):
    """Execute an AI tool call by calling back to Next.js API."""
    body = await request.json()
    tool_name = body.get("name")
    arguments = body.get("arguments", {})
    nextjs_token = body.get("session_token", "")

    result = await ai_service.execute_tool(tool_name, arguments, nextjs_token)
    return {"result": result}
