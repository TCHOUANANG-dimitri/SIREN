from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "siren",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_soft_time_limit=3600,
    task_time_limit=7200,
    worker_max_tasks_per_child=100,
    beat_schedule={
        "retrain-all-children": {
            "task": "app.tasks.retrain.retrain_all_children",
            "schedule": crontab(hour=3, minute=0),
            "options": {"queue": "ml"},
        },
        "purge-old-positions": {
            "task": "app.tasks.retrain.purge_old_positions",
            "schedule": crontab(hour=4, minute=0, day_of_week=0),
            "options": {"queue": "maintenance"},
        },
    },
)
