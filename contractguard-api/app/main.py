from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from pathlib import Path

from app.routes import upload, analysis, files, auth, export, chat, disputes
from app.middleware.rate_limit import RateLimitMiddleware
from app.routes.feedback import router as feedback_router

# Load env vars from project root (.env sits one level above contractguard-api)
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)


def create_app() -> FastAPI:
    app = FastAPI(
        title="ContractGuard API",
        description="Backend services that power the ContractGuard dashboard",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Rate limiting: 60 requests/minute, 1000 requests/hour per client
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=60,
        requests_per_hour=1000,
    )

    app.include_router(auth.router, tags=["auth"])
    app.include_router(upload.router, prefix="/upload", tags=["upload"])
    app.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
    app.include_router(files.router, tags=["files"])
    app.include_router(export.router, prefix="/export", tags=["export"])
    app.include_router(chat.router)
    app.include_router(disputes.router)
    app.include_router(feedback_router)

    # Root health check endpoint (simple and fast)
    @app.get("/")
    async def root():
        return JSONResponse({"status": "ok", "message": "ContractGuard API is running"})

    @app.get("/health")
    async def health():
        return JSONResponse({"status": "ok", "message": "ContractGuard API is healthy"})

    return app


app = create_app()


