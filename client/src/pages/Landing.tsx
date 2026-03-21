import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Landing() {
  const { t } = useTranslation();

  const steps = [
    { icon: '🚪', titleKey: 'landing.step1Title', descKey: 'landing.step1Desc' },
    { icon: '👀', titleKey: 'landing.step2Title', descKey: 'landing.step2Desc' },
    { icon: '✅', titleKey: 'landing.step3Title', descKey: 'landing.step3Desc' },
  ];

  return (
    <div className="min-h-full flex flex-col bg-white">
      {/* Top spacer */}
      <div className="flex-1" />

      {/* Hero */}
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <img src="/logo-icon.svg" alt="dropby" className="w-16 h-16 mb-4" />
        <h1 className="text-4xl font-bold text-gray-900 mb-2">dropby</h1>
        <p className="text-2xl font-semibold text-gray-900 mb-2">
          {t('landing.tagline')}
        </p>
        <p className="text-gray-400 text-sm max-w-xs leading-relaxed">{t('landing.subtagline')}</p>
      </div>

      {/* Feature cards */}
      <div className="px-6 py-8 border-t border-gray-100">
        <div className="space-y-4 max-w-sm mx-auto">
          {steps.map(item => (
            <div key={item.titleKey} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">
                {item.icon}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t(item.titleKey)}</p>
                <p className="text-sm text-gray-500 mt-0.5">{t(item.descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="flex-1" />

      {/* CTA */}
      <div className="px-6 pt-2 pb-6">
        <Link
          to="/auth"
          className="block w-full bg-emerald-500 hover:bg-emerald-600 text-white text-center py-4 rounded-2xl font-semibold text-lg transition-colors"
        >
          {t('landing.getStarted')}
        </Link>
      </div>

      {/* Imprint */}
      <div className="pb-8 text-center">
        <Link to="/about" className="text-xs text-gray-500 hover:text-gray-700">About</Link>
      </div>
    </div>
  );
}
