from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.conversation_service import ConversationService
from app.services.ai_service import AIService
from app.services.ai_tools_service import AIToolsService
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"conversations": await ConversationService.list(db, user)}


@router.post("/conversations", status_code=201)
async def create_conversation(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ConversationService.create(db, data, user)


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ConversationService.get_conversation(db, conv_id, user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await ConversationService.delete(db, conv_id, user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})


@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        conv = await ConversationService.get_conversation(db, conv_id, user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": str(e)}})

    await ConversationService.add_message(db, conv_id, data["content"], "USER", user)

    try:
        provider_config = await AIService.get_provider_config({**user, "aiApiKey": user.get("aiApiKey")})
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": {"code": "CONFIG_ERROR", "message": "AI provider not configured. Please add your API key in Settings."}})

    if data.get("model"):
        provider_config["model"] = data["model"]

    tool_definitions = await AIToolsService.get_tool_definitions()
    messages = [
        {"role": "system", "content": "You are Mkindayzir1, the built-in AI assistant for Mkindayzir, a self-hosted Work OS. Always respond in English unless the user explicitly writes in another language. Be concise and helpful. Refer to yourself as Mkindayzir1 when asked about your name."},
    ] + [
        {"role": m["role"].lower(), "content": m["content"]}
        for m in conv.get("messages", [])
    ] + [{"role": "user", "content": data["content"]}]

    async def event_generator():
        queue = []
        import asyncio

        async def run_stream():
            callbacks = {
                "onToken": lambda token: queue.append({"event": "token", "data": {"content": token}}),
                "onToolCall": lambda tc: queue.append({"event": "tool_call", "data": tc}),
                "onToolResult": lambda tr: queue.append({"event": "tool_result", "data": tr}),
                "onDone": lambda result: queue.append({"event": "done", "data": {"messageId": "placeholder"}}),
                "onError": lambda err: queue.append({"event": "error", "data": {"message": str(err)}}),
            }
            try:
                await AIService.stream_chat(messages, provider_config, tool_definitions, callbacks, user["id"])
            except Exception as e:
                queue.append({"event": "error", "data": {"message": str(e)}})

        task = asyncio.create_task(run_stream())
        try:
            while True:
                if queue:
                    item = queue.pop(0)
                    yield item
                    if item.get("event") == "done":
                        result_data = item.get("data", {})
                        await ConversationService.add_message(db, conv_id, result_data.get("content", ""), "ASSISTANT", user, {
                            "model": provider_config["model"],
                            "tokens": result_data.get("tokensUsed"),
                        })
                        break
                await asyncio.sleep(0.01)
        finally:
            task.cancel()

    return EventSourceResponse(event_generator())


@router.get("/models")
async def list_models(user: dict = Depends(get_current_user)):
    provider_name = user.get("aiProvider") or "openrouter"
    try:
        models = await AIService.get_available_models(provider_name)
        return {"models": models}
    except Exception:
        return {"models": []}


@router.get("/settings")
async def get_ai_settings(user: dict = Depends(get_current_user)):
    return {
        "provider": user.get("aiProvider"),
        "model": user.get("aiModel"),
        "apiKeyConfigured": bool(user.get("aiApiKey")),
    }


@router.patch("/settings")
async def update_ai_settings(data: dict, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.settings_service import SettingsService
    return await SettingsService.update_ai_settings(db, user, data)
