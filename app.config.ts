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
    icon: './assets/expo.icon',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "SIREN utilise l'appareil photo pour scanner le QR code du dispositif lors de l'appairage.",
      NSFaceIDUsageDescription:
        "SIREN peut utiliser Face ID pour verrouiller l'accès à l'application.",
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#D32F2E',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['CAMERA', 'USE_BIOMETRIC', 'USE_FINGERPRINT'],
    package: 'com.siren.app',
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
      'expo-splash-screen',
      {
        backgroundColor: '#FBFAF8',
        image: './assets/images/image.png',
        imageWidth: 180,
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
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 30,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          ndkVersion: '30.0.15729638',
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
    translationApiKey: process.env.EXPO_PUBLIC_TRANSLATION_API_KEY ?? '',
  },
};

export default config;
