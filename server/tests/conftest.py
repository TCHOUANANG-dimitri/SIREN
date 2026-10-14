import os

# Aucun service externe n'est requis par ces tests : pas de Redis, pas de base.
os.environ.setdefault("REDIS_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "development")
