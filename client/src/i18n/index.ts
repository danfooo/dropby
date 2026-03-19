import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enUS from './locales/en-US.json';
import enGB from './locales/en-GB.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'en-US': { translation: enUS },
      'en-GB': { translation: enGB },
      de: { translation: de },
      es: { translation: es },
      fr: { translation: fr },
    },
    fallbackLng: 'en-US',
    supportedLngs: ['en-US', 'en-GB', 'de', 'es', 'fr'],
    detection: {
      order: ['navigator'],
      caches: [],
    },
    interpolation: {
      escapeValue: false,
    },
    // Map language codes to supported locales
    load: 'currentOnly',
  });

// Remap detected language codes to supported locales
const detected = i18n.language;
const langMap: Record<string, string> = {
  en: 'en-US',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  de: 'de',
  es: 'es',
  fr: 'fr',
};

const mapped = langMap[detected] ?? langMap[detected?.split('-')?.[0] ?? ''] ?? 'en-US';
if (mapped !== detected) {
  i18n.changeLanguage(mapped);
}

export default i18n;
