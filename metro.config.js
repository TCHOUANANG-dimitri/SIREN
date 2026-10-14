// Configuration Metro : défaut Expo + exclusion du backend simulé des builds live.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const MOCK_ENTRY = path.join(__dirname, 'src', 'api', 'mock', 'entry.ts');
const MOCK_STUB = path.join(__dirname, 'src', 'api', 'mock', 'entry.live-stub.ts');

// En mode live, `src/api/mock/entry` est remplacé par un module vide : ni la base
// de démonstration ni les données fictives (enfants, positions) ne sont embarquées.
if (process.env.EXPO_PUBLIC_API_MODE === 'live') {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
    if (resolved.type === 'sourceFile' && resolved.filePath === MOCK_ENTRY) {
      return { type: 'sourceFile', filePath: MOCK_STUB };
    }
    return resolved;
  };
}

module.exports = config;
