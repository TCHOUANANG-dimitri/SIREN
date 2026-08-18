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

**Order**: `lint → typecheck → test` before committing.

## Architecture

- **Expo Router** file-based routing: `src/app/` → `(auth)/`, `(main)/(tabs)/`, `(emergency)/`
- **Entry**: `expo-router/entry` (declared in `package.json` `"main"`)
- **Path alias**: `@/` → `./src/` (configured in `tsconfig.json` and `jest.config.js`)

### Key directories

| Path | Role |
|---|---|
| `src/app/` | Expo Router screens |
| `src/api/` | Network layer, React Query hooks, mock backend |
| `src/api/services/` | Backend service functions (mock DB calls) |
| `src/api/hooks/` | React Query wrappers for services |
| `src/api/mock/` | In-memory mock DB, scenario engine, seed data |
| `src/stores/` | Zustand stores (auth, location, UI) |
| `src/features/` | Feature modules (auth, emergency, tracking, etc.) |
| `src/components/` | Shared UI components |
| `src/theme/` | Design tokens (`tokens.ts`), Inter font loading |
| `src/models/` | TypeScript entity types |
| `src/config/` | `env.ts` (zod-validated env) |
| `src/i18n/` | i18next `fr.json` / `en.json` |
| `src/utils/` | Storage, secure storage, geo, logger, notifications |

## Key patterns

- **Mock-first**: `EXPO_PUBLIC_API_MODE=mock` (default). The mock backend seeds data and runs a scenario engine at app startup (`src/app/_layout.tsx` → `initMockBackend()`). No real backend needed for development.
- **Auth tokens**: stored in `expo-secure-store` (Keychain/Keystore). Never in AsyncStorage.
- **Server state**: TanStack Query with query keys centralized in `src/api/queryKeys.ts`.
- **RBAC**: `src/features/sharing/permissions.ts` defines the action-permission matrix for `principal` vs `secondaire` roles. Tests at `src/features/sharing/__tests__/permissions.test.ts`.
- **Risk scoring**: `src/api/mock/fusionScore.ts` with hysteresis gate. Tested at `src/api/mock/__tests__/fusionScore.test.ts`.
- **VS Code**: auto-fix + organize imports on save (`.vscode/settings.json`).
- **i18n**: `useTranslation()` from `react-i18next`.
- **Env vars**: set in `.env` as `EXPO_PUBLIC_*`, exposed via `app.config.ts` `extra`, validated by zod in `src/config/env.ts`.

## Testing quirks

- Only 2 test files exist; both are pure unit tests with no native module mocks needed.
- `jest.config.js` uses `jest-expo` preset with a broad `transformIgnorePatterns` allowlist.
- Run focused tests: `npx jest src/api/mock/__tests__/fusionScore.test.ts`
