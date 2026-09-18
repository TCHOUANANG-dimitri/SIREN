import type { ExpoConfig } from 'expo/config';

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
    // react-native-maps exige la meta-data com.google.android.geo.API_KEY dans le
    // manifeste : sans elle, les 6 écrans carte ne s'affichent pas en build autonome.
    // Renseigner EXPO_PUBLIC_MAPS_API_KEY avant le prebuild pour l'injecter.
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
          // Pas de ndkVersion forcée : on laisse Expo 54 / RN 0.81 choisir la sienne
          // (27.1.12297006), la seule installée et la seule validée pour cette version.
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiMode: process.env.EXPO_PUBLIC_API_MODE ?? 'mock',
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
    wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws',
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
