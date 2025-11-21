from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Ensure we load the repo-level .env (two directories above this file)
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)


class Settings(BaseSettings):
    supabase_url: Optional[str] = None
    supabase_service_key: Optional[str] = None
    supabase_storage_bucket: Optional[str] = None

    azure_storage_connection_string: Optional[str] = None
    azure_storage_container: Optional[str] = None

    azure_afr_endpoint: Optional[str] = None
    azure_afr_api_key: Optional[str] = None
    azure_afr_contract_model_id: str = "prebuilt-contract"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"

    redis_broker_url: str = "redis://localhost:6379/0"
    redis_result_backend: str = "redis://localhost:6379/1"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


