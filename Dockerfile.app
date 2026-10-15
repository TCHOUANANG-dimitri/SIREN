# SIREN — application mobile (Expo / React Native) : outillage conteneurisé.
# L'application elle-même s'installe sur téléphone (APK) : ce conteneur sert aux
# contrôles reproductibles (lint, types, traductions, tests) et au serveur Metro
# de développement (Expo Go). Il ne produit aucun APK.
FROM node:22-bookworm-slim

ENV CI=1 \
    EXPO_NO_TELEMETRY=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=app:app . .
RUN chown app:app /app

USER app

EXPOSE 8081

# Par défaut : la suite de contrôles du projet (ordre d'AGENTS.md).
CMD ["sh", "-c", "npm run lint && npm run typecheck && npm run i18n:check && npm test -- --ci"]
