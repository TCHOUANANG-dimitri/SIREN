import os

# Aucun service externe n'est requis par ces tests : pas de Redis, pas de base.
os.environ.setdefault("REDIS_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest


@pytest.fixture(scope="session")
def db_client():
    """Un seul TestClient (donc une seule boucle d'événements) pour toute la base de test :
    le pool de connexions asyncpg de l'application est lié à cette boucle."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
