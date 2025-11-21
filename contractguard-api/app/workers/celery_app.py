from __future__ import annotations

from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "contractguard",
    broker=settings.redis_broker_url,
    backend=settings.redis_result_backend,
)

celery_app.conf.task_routes = {"app.workers.tasks.*": {"queue": "analysis"}}



