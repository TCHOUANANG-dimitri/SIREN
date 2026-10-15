# SIREN — application mobile et serveur

Protection des enfants contre les enlèvements : un boîtier porté par l'enfant envoie
position, vitesse, accélération et batterie ; le serveur calcule un score de risque ;
l'application est le poste de commande du parent (carte, alertes, urgence, partage).

| Dossier | Contenu |
|---|---|
| `src/` | Application Expo (React Native, TypeScript, Expo Router) |
| `server/` | API FastAPI, worker et beat Celery (voir `server/README.md`) |
| `data/` | Base reconstituée : `schema.sql` (PostgreSQL/PostGIS) et [`SCHEMA.md`](data/SCHEMA.md) ; sauvegardes hors Git |
| `scripts/db/` | Régénération reproductible du schéma (`rebuild-schema.sh`) |
| `docs/` | Contrats d'interface, contradictions entre CDC, traçabilité, risques, rapports |
| `RAPPORT_SERVICES_ET_COUTS_SIREN.docx` | Services gratuits/payants, fonctionnalités manquantes, coûts (2 pages) |

## Démarrer

```bash
cp .env.example .env      # mode mock par défaut : aucun serveur ni clé nécessaire
npm ci
npx expo run:android      # development build (MapLibre et NetInfo sont natifs)
```

Mode live (serveur réel) : voir [`docs/INTEGRATION-SERVEUR.md`](docs/INTEGRATION-SERVEUR.md).

## Conteneurs (Docker Compose)

```bash
cp server/.env.docker.example server/.env   # remplacer chaque « a-remplacer » (aucun secret dans Git)
docker compose up -d --build                # API, worker, beat, PostgreSQL/PostGIS, Redis, Caddy
curl http://localhost:8000/health
docker compose --profile mobile run --rm mobile-checks   # lint, types, i18n, tests de l'application
docker compose --profile mobile up mobile-dev            # Metro pour Expo Go (port 8081)
```

La base est initialisée depuis `data/schema.sql` au premier démarrage, puis le
service `migration` applique les migrations manquantes (`server/migrations/apply.py`).

## Qualité

```bash
npm run lint && npm run typecheck && npm run i18n:check && npm test   # application
cd server && python -m pytest                                          # serveur (sans base ni Redis)
# serveur sur vraie base PostGIS : voir l'en-tête de server/tests/test_database.py
```

## Documentation

- [Rapport de mise à niveau](docs/RAPPORT-FINAL.md)
- [Contrat app ↔ serveur v1](docs/contrats/api-app-serveur-v1.md)
- [Contrat dispositif ↔ serveur (proposition)](docs/contrats/dispositif-serveur-v1.md)
- [Contrats IA et entrées manquantes](docs/contrats/ia-v1.md)
- [Contradictions entre CDC](docs/CDC-CONTRADICTIONS.md)
- [Traçabilité CDC → code → tests](docs/TRACABILITE.md)
- [Risques](docs/RISQUES.md)
