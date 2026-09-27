# SIREN — application mobile et serveur

Protection des enfants contre les enlèvements : un boîtier porté par l'enfant envoie
position, vitesse, accélération et batterie ; le serveur calcule un score de risque ;
l'application est le poste de commande du parent (carte, alertes, urgence, partage).

| Dossier | Contenu |
|---|---|
| `src/` | Application Expo (React Native, TypeScript, Expo Router) |
| `server/` | API FastAPI + PostgreSQL/PostGIS (voir `server/README.md`, déploiement o2switch) |
| `docs/` | Contrats d'interface, contradictions entre CDC, traçabilité, risques, rapport |

## Démarrer

```bash
cp .env.example .env      # mode mock par défaut : aucun serveur ni clé nécessaire
npm ci
npx expo run:android      # development build (MapLibre et NetInfo sont natifs)
```

Mode live (serveur réel) : voir [`docs/INTEGRATION-SERVEUR.md`](docs/INTEGRATION-SERVEUR.md).

## Qualité

```bash
npm run lint && npm run typecheck && npm test   # application
cd server && python -m pytest                   # serveur (sans base ni Redis)
```

## Documentation

- [Rapport de mise à niveau](docs/RAPPORT-FINAL.md)
- [Contrat app ↔ serveur v1](docs/contrats/api-app-serveur-v1.md)
- [Contrat dispositif ↔ serveur (proposition)](docs/contrats/dispositif-serveur-v1.md)
- [Contrats IA et entrées manquantes](docs/contrats/ia-v1.md)
- [Contradictions entre CDC](docs/CDC-CONTRADICTIONS.md)
- [Traçabilité CDC → code → tests](docs/TRACABILITE.md)
- [Risques](docs/RISQUES.md)
