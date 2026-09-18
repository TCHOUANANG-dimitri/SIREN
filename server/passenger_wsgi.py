"""
SIREN — Pont WSGI pour o2switch mutualisé (Phusion Passenger).

L'outil "Setup Python App" de cPanel sert l'application via Passenger, qui ne
parle que WSGI. SIREN est une app ASGI (FastAPI) : on la rend WSGI avec le pont
`a2wsgi`. La configuration du panel doit être :

  Application Root     : <dossier racine de ce fichier> (ex: /home/USER/siren-api)
  Application URL      : <ton sous-domaine> (ex: api.sirenexample.com)
  Application startup file : passenger_wsgi.py
  Application entry point  : application

Sous ce pont, aucun événement de cycle de vie ASGI (lifespan/on_startup) n'est
déclenché : tout le code de démarrage est donc exécuté à l'import (_boot()),
et les tâches lourdes (retrain / purge) sont exclusivement lancées par cron via
run_tasks.py — jamais dans une requête du worker Passenger.
"""

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("passenger")


def _boot() -> None:
    """
    Initialisations exécutées une seule fois, à l'import du module, quand
    Passenger démarre (ou relance) l'application. PAS d'appel réseau lourd ici :
    la structure de la base est gérée une seule fois via Supabase (db_schema.sql).
    """
    logger.info("SIREN WSGI boot (environnement=%s)", "voir .env / variables panel")


_boot()

try:
    from a2wsgi import ASGIMiddleware
    from app.main import app as fastapi_app

    application = ASGIMiddleware(fastapi_app)
except Exception:
    # Renvoyer une 500 explicite à la place d'un crash silencieux de Passenger.
    logger.exception("Echec de l'import de l'application FastAPI")

    def application(environ, start_response):
        start_response(
            "500 Internal Server Error",
            [("Content-Type", "text/plain; charset=utf-8")],
        )
        return [b"Erreur au demarrage de SIREN : consultez le Passenger log file."]