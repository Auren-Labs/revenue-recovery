# Celery Background Job Processing

This document explains how to set up and run Celery workers for background job processing.

## Overview

ContractGuard uses Celery with Redis for processing audit jobs in the background. This provides:

- ✅ **Non-blocking API responses** - API returns immediately
- ✅ **Automatic retries** - Failed jobs retry up to 3 times with exponential backoff
- ✅ **Horizontal scaling** - Run multiple workers to process jobs in parallel
- ✅ **Job progress tracking** - Real-time progress updates via database

## Prerequisites

1. **Redis** must be running and accessible
2. **Python dependencies** installed (celery, redis)

## Setup

### 1. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or using local Redis
redis-server
```

### 2. Configure Redis URL

Ensure your `.env` file has:

```env
REDIS_BROKER_URL=redis://localhost:6379/0
REDIS_RESULT_BACKEND=redis://localhost:6379/1
```

### 3. Start Celery Worker

```bash
# From the contractguard-api directory
celery -A app.workers.celery_app worker --loglevel=info --queues=analysis

# On Windows, use threads pool (prefork doesn't work)
celery -A app.workers.celery_app worker --loglevel=info --queues=analysis --pool=threads --concurrency=4

# On Linux/Mac, you can use prefork (default)
celery -A app.workers.celery_app worker --loglevel=info --queues=analysis --pool=prefork --concurrency=4
```

**Note for Windows users:** The configuration automatically uses `threads` pool for Windows compatibility. If you still see errors, explicitly specify `--pool=threads` in the command.

### 4. Start Celery Beat (Optional - for scheduled tasks)

```bash
celery -A app.workers.celery_app beat --loglevel=info
```

## Monitoring

### Check Worker Status

```bash
celery -A app.workers.celery_app inspect active
celery -A app.workers.celery_app inspect scheduled
celery -A app.workers.celery_app inspect stats
```

### Monitor Tasks in Real-time

```bash
celery -A app.workers.celery_app events
```

### Check Redis Queue

```bash
redis-cli
> LLEN celery  # Check queue length
> KEYS celery*  # List all Celery keys
```

## Task Configuration

### Task: `process_audit_job`

- **Name**: `app.workers.tasks.process_audit_job`
- **Queue**: `analysis`
- **Max Retries**: 3
- **Retry Delay**: Exponential backoff (60s, 120s, 240s)
- **Time Limit**: 1 hour (hard), 55 minutes (soft)

### Retry Logic

The task automatically retries on failure:
- **Attempt 1**: Immediate
- **Attempt 2**: After 60 seconds
- **Attempt 3**: After 120 seconds
- **Attempt 4**: After 240 seconds (final)

If all retries fail, the job status is set to "failed" and an email notification is sent.

## Production Deployment

### Using Supervisor

Create `/etc/supervisor/conf.d/celery.conf`:

```ini
[program:celery_worker]
command=/path/to/venv/bin/celery -A app.workers.celery_app worker --loglevel=info --queues=analysis --concurrency=4
directory=/path/to/contractguard-api
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/celery/worker.log
```

### Using systemd

Create `/etc/systemd/system/celery.service`:

```ini
[Unit]
Description=Celery Worker
After=network.target redis.service

[Service]
Type=forking
User=www-data
Group=www-data
EnvironmentFile=/path/to/.env
WorkingDirectory=/path/to/contractguard-api
ExecStart=/path/to/venv/bin/celery -A app.workers.celery_app worker --loglevel=info --queues=analysis --concurrency=4 --detach
ExecStop=/bin/kill -s TERM $MAINPID
Restart=always

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Worker Not Processing Jobs

1. Check Redis is running: `redis-cli ping` (should return `PONG`)
2. Check worker is connected: `celery -A app.workers.celery_app inspect active`
3. Check queue name matches: `celery -A app.workers.celery_app inspect active_queues`

### Jobs Stuck in Queue

1. Check worker logs for errors
2. Verify Redis connection
3. Check job status in database
4. Restart worker: `celery -A app.workers.celery_app control shutdown`

### Memory Issues

- Reduce `worker_max_tasks_per_child` in `celery_app.py`
- Increase worker restart frequency
- Monitor memory usage: `celery -A app.workers.celery_app inspect stats`

## Fallback Mode

If Celery is not available, the system falls back to async thread processing. This is **not recommended for production** as it:
- Blocks the API event loop
- Doesn't support retries
- Can't scale horizontally

Check logs for: `"Celery not available, using async thread fallback"`

