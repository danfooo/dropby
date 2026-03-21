import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from './locales/en-US.json';
import enGB from './locales/en-GB.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import sv from './locales/sv.json';

const langMap: Record<string, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  en: 'en-US',
  de: 'de',
  es: 'es',
  fr: 'fr',
  sv: 'sv',
};

const navLang = navigator?.language || 'en-US';
const lng = langMap[navLang] ?? langMap[navLang.split('-')[0]] ?? 'en-US';

i18n
  .use(initReactI18next)
  .init({
    lng,
    resources: {
      'en-US': { translation: enUS },
      'en-GB': { translation: enGB },
      de: { translation: de },
      es: { translation: es },
      fr: { translation: fr },
      sv: { translation: sv },
    },
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
