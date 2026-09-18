"""
SIREN — Mode "cron" pour hébergement mutualisé.

Pas de Celery worker persistant possible sur o2switch mutualisé : les tâches
planifiées du beat (celery_app.py) sont donc appelées directement, en processus
détaché, depuis la crontab cPanel.

Usage :
    source /home/USER/virtualenv/<nom>/<VERSION>/bin/activate && cd <APP_ROOT>
    python run_tasks.py retrain   # réentraînement nocturne (tous les enfants éligibles)
    python run_tasks.py purge     # purge des positions > POSITION_RETENTION_DAYS
"""

import argparse
import asyncio
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("run_tasks.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("cron")

TASKS = {
    # équivalent : celery beat -> "retrain-all-children" (tous les jours à 03:00)
    "retrain": ("app.tasks.retrain", "_retrain_all_children_async"),
    # équivalent : celery beat -> "purge-old-positions" (dimanche à 04:00)
    "purge": ("app.tasks.retrain", "_purge_async"),
}


async def _run(task_name: str) -> None:
    module_path, func_name = TASKS[task_name]
    import importlib

    module = importlib.import_module(module_path)
    func = getattr(module, func_name)
    logger.info("Debut de la tache cron : %s", task_name)
    await func()
    logger.info("Tache cron terminee : %s", task_name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Runner cron des taches SIREN")
    parser.add_argument("task", choices=list(TASKS), help="Tache a executer")
    args = parser.parse_args()
    try:
        asyncio.run(_run(args.task))
    except Exception:
        logger.exception("Echec de la tache cron : %s", args.task)
        sys.exit(1)


if __name__ == "__main__":
    main()