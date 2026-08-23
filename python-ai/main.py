"""
Mkindayzir AI Service - Python FastAPI backend for AI processing.
Handles AI chat streaming, tool execution, and model management.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes.ai_chat import router as chat_router
from app.routes.ai_models import router as models_router
from app.config import settings

load_dotenv()

app = FastAPI(
    title="Mkindayzir AI Service",
    description="AI processing backend for Mkindayzir",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.nextjs_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/ai", tags=["AI Chat"])
app.include_router(models_router, prefix="/ai", tags=["AI Models"])


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "mkindayzir-ai", "version": "1.0.0"}
