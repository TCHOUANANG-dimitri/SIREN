# SIREN — Agent guide

## Quick start

```bash
cp .env.example .env        # defaults to mock mode, no API keys needed
npm install
npx expo start              # dev server (Expo Go / simulator)
```

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Jest + jest-expo (all `*.test.*` files) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` (ESLint) |
| `npm run android` | `expo run:android` |
| `npm run ios` | `expo run:ios` |
| `npm run build:apk:debug` | Native Gradle APK |
| `npm run build:apk:eas` | EAS preview APK |
| `cd server && docker compose up -d --build` | Backend conteneurisé (API, Celery, PostGIS, Redis, Caddy) — voir `server/README.md` |

**Order**: `lint → typecheck → test` before committing. Backend : tests dans `server/`, stack Docker dans `server/` (`docker compose up -d` ; surcouche dev `-f docker-compose.dev.yml`).

## Architecture

- **Expo Router** file-based routing: `src/app/` → `(auth)/`, `(main)/(tabs)/`, `(emergency)/`
- **Entry**: `expo-router/entry` (declared in `package.json` `"main"`)
- **Path alias**: `@/` → `./src/` (configured in `tsconfig.json` and `jest.config.js`)

### Key directories

| Path | Role |
|---|---|
| `src/app/` | Expo Router screens |
| `src/api/index.ts` | `api` — single switch mock/live (the only data entry point for hooks) |
| `src/api/repositories.ts` | `SirenApi` contract implemented by both backends |
| `src/api/live/` | HTTP implementation over `server/app/api/v1` |
| `src/api/http/client.ts` | Axios client: auth header, single-flight refresh, safe retries, error mapping |
| `src/api/contracts/` | Zod schemas server → app (v1), normalisation, units |
| `src/api/realtime/` | Realtime channel (WebSocket or mock bus) |
| `src/api/hooks/` | React Query hooks (call `api.*`) |
| `src/api/mock/` | Mock backend; reached ONLY via `mock/entry.ts` (stubbed out of live builds by `metro.config.js`) |
| `server/` | FastAPI backend (see `server/README.md`, tests in `server/tests`) |
| `docs/` | Contracts, CDC contradictions, traceability, risks, integration guide |
| `src/stores/` | Zustand stores (auth, location, UI) |
| `src/features/` | Feature modules (auth, emergency, tracking, etc.) |
| `src/components/` | Shared UI components |
| `src/theme/` | Design tokens (`tokens.ts`), Inter font loading |
| `src/models/` | TypeScript entity types |
| `src/config/` | `env.ts` (zod-validated env) |
| `src/i18n/` | i18next `fr.json` / `en.json` |
| `src/utils/` | Storage, secure storage, geo, logger, notifications |

## Key patterns

- **Mock-first**: `EXPO_PUBLIC_API_MODE=mock` (default). The mock backend seeds data and runs a scenario engine at startup, only in mock mode. Never import `src/api/mock/*` from outside `src/api` except through `@/api/mock/entry` guarded by `isMockMode()`.
- **Live**: `EXPO_PUBLIC_API_MODE=live` + `EXPO_PUBLIC_API_BASE_URL` (HTTPS). Empty `EXPO_PUBLIC_WS_URL` = polling (o2switch shared hosting has no WebSocket). See `docs/INTEGRATION-SERVEUR.md`.
- **Contracts**: every server response goes through `src/api/contracts`. Missing optional fields become `null` — never invent values in the UI.
- **Emergency**: `EmergencyGate` watches the risk cache (fed by WS or polling). Nothing in the emergency path may depend on credits or ads.
- **Business parameters**: `src/config/business.ts` (thresholds, 3-secondary cap, credit costs — several marked « à valider »).
- **Auth tokens**: stored in `expo-secure-store` (Keychain/Keystore). Never in AsyncStorage.
- **Server state**: TanStack Query with query keys centralized in `src/api/queryKeys.ts`.
- **RBAC**: `src/features/sharing/permissions.ts` defines the action-permission matrix for `principal` vs `secondaire` roles. Tests at `src/features/sharing/__tests__/permissions.test.ts`.
- **Risk scoring**: `src/api/mock/fusionScore.ts` with hysteresis gate. Tested at `src/api/mock/__tests__/fusionScore.test.ts`.
- **VS Code**: auto-fix + organize imports on save (`.vscode/settings.json`).
- **i18n**: `useTranslation()` from `react-i18next`.
- **Env vars**: set in `.env` as `EXPO_PUBLIC_*`, exposed via `app.config.ts` `extra`, validated by zod in `src/config/env.ts`.

## Testing quirks

- App: Jest unit tests under `src/**/__tests__` (contracts, HTTP client, WebSocket, i18n completeness, freshness, credits…). Native modules (AsyncStorage, NetInfo, SecureStore) are mocked in `jest.setup.js`.
- `src/i18n/__tests__/completeness.test.ts` fails if a `t('key')` used in code is missing in FR or EN.
- Server: `cd server && python -m pytest` (Python 3.12, no DB/Redis needed). One `xfail` documents the server hysteresis gap (CDC contradiction C6).
- Run focused tests: `npx jest src/api/__tests__/httpClient.test.ts`
