"""
Celery application configuration for background job processing.
"""
from __future__ import annotations

from celery import Celery
from app.config import get_settings

settings = get_settings()

# Create Celery app
celery_app = Celery(
    "contractguard",
    broker=settings.redis_broker_url,
    backend=settings.redis_result_backend,
)

# Task routing - route all tasks to 'analysis' queue
celery_app.conf.task_routes = {
    "app.workers.tasks.*": {"queue": "analysis"},
}

# Task execution settings
celery_app.conf.update(
    # Task time limits
    task_time_limit=3600,  # Hard time limit: 1 hour
    task_soft_time_limit=3300,  # Soft time limit: 55 minutes (sends SoftTimeLimitExceeded)
    
    # Task acknowledgment
    task_acks_late=True,  # Acknowledge after task completion (not before)
    task_reject_on_worker_lost=True,  # Reject tasks if worker dies
    
    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    result_backend_transport_options={
        "master_name": "mymaster",
        "visibility_timeout": 3600,
    },
    
    # Worker settings
    worker_prefetch_multiplier=1,  # Only prefetch 1 task at a time (fair distribution)
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks (memory management)
    
    # Windows compatibility: Use threads pool instead of prefork
    # Prefork doesn't work on Windows, so we use threads or solo
    worker_pool="threads",  # Use threads pool for Windows compatibility
    worker_concurrency=4,  # Number of concurrent threads
    
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
    
    # Task discovery
    include=["app.workers.tasks"],
)



