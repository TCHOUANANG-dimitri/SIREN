import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import fr from './fr.json';
import en from './en.json';

const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? 'fr';
const initialLanguage = deviceLanguage === 'en' ? 'en' : 'fr';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: initialLanguage,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export async function changeAppLanguage(lang: 'fr' | 'en') {
  await i18n.changeLanguage(lang);
}

export default i18n;
