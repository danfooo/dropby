import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from './locales/en-US.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import sv from './locales/sv.json';
import zhCN from './locales/zh-CN.json';

const langMap: Record<string, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-US',
  en: 'en-US',
  de: 'de',
  es: 'es',
  fr: 'fr',
  it: 'it',
  pt: 'pt',
  sv: 'sv',
  'zh-CN': 'zh-CN',
  'zh-SG': 'zh-CN',
  'zh-Hans': 'zh-CN',
  zh: 'zh-CN',
};

const navLang = navigator?.language || 'en-US';
const lng = langMap[navLang] ?? langMap[navLang.split('-')[0]] ?? 'en-US';

i18n
  .use(initReactI18next)
  .init({
    lng,
    resources: {
      'en-US': { translation: enUS },
      de: { translation: de },
      es: { translation: es },
      fr: { translation: fr },
      it: { translation: it },
      pt: { translation: pt },
      sv: { translation: sv },
      'zh-CN': { translation: zhCN },
    },
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
