from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path

from app.routes import upload, analysis, files

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

    app.include_router(upload.router, prefix="/upload", tags=["upload"])
    app.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
    app.include_router(files.router, tags=["files"])

    return app


app = create_app()


