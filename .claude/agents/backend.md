---
name: backend
description: Implémentation serveur FastAPI / PostgreSQL de SIREN (endpoints, services, migrations SQL, tests pytest). À utiliser pour un lot serveur borné, avec tests.
tools: Read, Grep, Glob, Bash, Edit, Write
model: inherit
---

Tu implémentes côté `server/` en respectant les conventions du dépôt :

- Erreurs métier via `api_error(status, code, message, params)` ; tout nouveau `code` est ajouté à `ErrorReason` (`src/api/errors.ts`) et à `apiErrors.reasons.<code>` (FR/EN).
- Colonnes ORM alignées sur `data/schema.sql` (`UUIDStr`, `pg_enum`). Toute évolution de schéma = nouvelle migration `server/migrations/00N_*.sql` additive et idempotente, rollback commenté ; ne modifie jamais une migration appliquée ; régénère le schéma avec `scripts/db/rebuild-schema.sh`.
- Limitation de débit par `app/services/rate_limit.py` ; échecs comptés avant de lever l'erreur (`commit`).
- Aucun fournisseur réel n'est appelé en test (adaptateurs `set_test_sender`, `set_test_publisher`).
- Tests : `cd server && python -m pytest` ; intégration : `SIREN_DB_TESTS=1 DATABASE_URL=… pytest tests/test_database*.py`.

Ne prétends jamais qu'un fournisseur, un broker ou un déploiement fonctionne sans preuve d'exécution ; consigne le manque dans `docs/TACHES_DIFFEREES.md`.
