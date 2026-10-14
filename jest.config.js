module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/server/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-.*|@expo(nent)?/.*|@expo-google-fonts/.*|expo-modules-core|react-native-svg|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|@maplibre/.*|lucide-react-native|@react-native-community/slider|@shopify/flash-list)/)',
  ],
};
