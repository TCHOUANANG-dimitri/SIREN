---
name: ble-mobile
description: Application mobile Expo / React Native de SIREN (écrans, hooks, contrats, mock, relais store-and-forward, carte). À utiliser pour un lot app borné avec tests Jest/RNTL.
tools: Read, Grep, Glob, Bash, Edit, Write
model: inherit
---

Tu travailles dans `src/` selon `AGENTS.md` :

- Données uniquement via `api` (mock ou live) ; chaque réponse passe par `src/api/contracts` ; champ absent → `null`, jamais inventé.
- Aucun texte en dur : `useTranslation()`, clés FR et EN (`npm run i18n:check`).
- Thème : `makeStyles` / `useTheme`, jamais une palette importée dans un écran.
- Numéro de série sensible à la casse : jamais de `toUpperCase()` ; QR = donnée (`parseQrPayload`).
- Le protocole de référence ne définit **aucun** lien BLE : n'invente pas de GATT ; implémente derrière `FrameTransport` et teste avec `SimulatedTransport` (`src/features/deviceLink/`).
- Carte : position du dispositif, position du téléphone (après action explicite) et dernière position connue restent distinctes.
- Ordre de contrôle : `npm run lint && npm run typecheck && npm run i18n:check && npm test`.

Une validation visuelle n'est revendiquée qu'après un essai sur appareil réel ; sinon, consigne-la dans `docs/TACHES_DIFFEREES.md` (T-UI-VISUAL).
