import fs from 'fs';
import type { ExpoConfig } from 'expo/config';

// Fichier Firebase (FCM, push Android) : fourni hors Git, chemin via variable d'environnement.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const hasGoogleServices = fs.existsSync(googleServicesFile);

const config: ExpoConfig = {
  name: 'SIREN',
  slug: 'siren-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'sirenapp',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.siren.app',
    // Pas de surcharge d'icône iOS : le paquet ./assets/expo.icon livré avec le
    // gabarit contient le symbole Expo. iOS reprend donc l'icône SIREN définie
    // à la racine de la configuration.
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "SIREN utilise l'appareil photo pour scanner le QR code du dispositif lors de l'appairage.",
      NSFaceIDUsageDescription:
        "SIREN peut utiliser Face ID pour verrouiller l'accès à l'application.",
    },
  },
  android: {
    package: 'com.siren.app',
    adaptiveIcon: {
      backgroundColor: '#D32F2E',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['CAMERA', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
    // Push Android (FCM) : sans google-services.json, l'app fonctionne mais ne reçoit
    // pas de push serveur (les alertes restent visibles à l'ouverture de l'app).
    ...(hasGoogleServices ? { googleServicesFile } : {}),
    // Les cartes utilisent MapLibre + tuiles OpenStreetMap (aucune clé requise).
    // La clé Google n'est injectée que si elle est fournie, pour un éventuel retour
    // au SDK Google Maps ; elle n'est pas nécessaire au fonctionnement actuel.
    ...(process.env.EXPO_PUBLIC_MAPS_API_KEY
      ? { config: { googleMaps: { apiKey: process.env.EXPO_PUBLIC_MAPS_API_KEY } } }
      : {}),
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-notifications',
      {
        color: '#D32F2E',
      },
    ],
    '@react-native-community/datetimepicker',
    '@maplibre/maplibre-react-native',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FBFAF8',
        // Canevas carré : Android 12+ masque l'icône de démarrage en cercle.
        // Un logo au format 3:2 posé pleine largeur y perdait ses extrémités
        // (le « S » et le « N » de SIREN). Le logo occupe donc 53 % du canevas,
        // ce qui le fait tenir entièrement dans le cercle visible.
        image: './assets/images/splash-logo.png',
        imageWidth: 240,
        resizeMode: 'contain',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          "SIREN utilise votre position pour vous situer sur la carte lorsque nécessaire.",
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          "SIREN utilise l'appareil photo pour scanner le QR code du dispositif.",
      },
    ],
    [
      // Sans ce plugin, le manifeste ne déclare que READ_EXTERNAL_STORAGE, qui
      // ne donne plus accès aux médias depuis Android 13 (API 33). Le plugin
      // ajoute READ_MEDIA_IMAGES, nécessaire au choix de la photo de l'enfant.
      'expo-image-picker',
      {
        photosPermission:
          "SIREN accède à vos photos pour définir la photo de profil de votre enfant.",
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 30,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          // Allègement de l'APK : téléphones ARM uniquement (x86/x86_64 = émulateurs),
          // R8 (code) et suppression des ressources inutilisées.
          buildArchs: ['arm64-v8a', 'armeabi-v7a'],
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Pas de ndkVersion forcée : on laisse Expo 54 / RN 0.81 choisir la sienne
          // (27.1.12297006), la seule installée et la seule validée pour cette version.
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  // Valeurs lues au démarrage et validées par src/config/env.ts (jamais de crash si absentes).
  extra: {
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    apiMode: process.env.EXPO_PUBLIC_API_MODE ?? 'mock',
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
    // Vide = pas de WebSocket (o2switch mutualisé) : l'app passe en polling REST.
    wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:8000/api/v1/ws',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    featureWebsocket: process.env.EXPO_PUBLIC_FEATURE_WEBSOCKET,
    featureCredits: process.env.EXPO_PUBLIC_FEATURE_CREDITS,
    featureAds: process.env.EXPO_PUBLIC_FEATURE_ADS,
    featureAudio: process.env.EXPO_PUBLIC_FEATURE_AUDIO,
    featureFaucon: process.env.EXPO_PUBLIC_FEATURE_FAUCON,
    mapsApiKey: process.env.EXPO_PUBLIC_MAPS_API_KEY ?? '',
    // Tuiles vectorielles OpenStreetMap servies par OpenFreeMap : ni clé ni
    // quota, et remplaçable par une instance auto-hébergée le jour venu.
    mapStyleUrl:
      process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
    translationApiKey: process.env.EXPO_PUBLIC_TRANSLATION_API_KEY ?? '',
    // Passerelle temporaire vers Faucon (tracking GPS réel), le temps que le
    // pipeline patch → serveur SIREN soit opérationnel. Aucun identifiant n'est
    // embarqué : l'utilisateur saisit ses accès sur la page de connexion Faucon,
    // et la session est conservée par les cookies de la WebView.
    fauconUrl: process.env.EXPO_PUBLIC_FAUCON_URL ?? 'https://faucon.169.58.69.36.sslip.io/',
  },
};

export default config;
