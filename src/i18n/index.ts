import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { en, fr } from './resources';
import { deviceLanguage } from './language';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  // Langue du téléphone au démarrage ; le choix fait dans SIREN est appliqué
  // dès que les préférences locales sont lues (voir language.ts).
  lng: deviceLanguage(Localization.getLocales()[0]?.languageCode),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
  // Une clé absente ne doit jamais afficher un texte vide.
  returnEmptyString: false,
});

export default i18n;
