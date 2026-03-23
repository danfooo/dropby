import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function AppleIcon() {
  return (
    <svg className="w-5 h-5 fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 20.5v-17c0-.83.94-1.3 1.6-.8l14 8.5a1 1 0 0 1 0 1.6l-14 8.5c-.66.5-1.6.03-1.6-.8z" />
    </svg>
  );
}

function StoreButtons({ variant }: { variant: 'primary' | 'inverted' }) {
  const { t } = useTranslation();
  const btn =
    variant === 'primary'
      ? 'inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors'
      : 'inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-white hover:bg-gray-50 text-gray-900 font-semibold text-sm transition-colors';
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <a href="#" className={btn}>
        <AppleIcon />
        {t('marketing.downloadAppStore')}
      </a>
      <a href="#" className={btn}>
        <PlayIcon />
        {t('marketing.downloadGooglePlay')}
      </a>
    </div>
  );
}

function QrBlock({ variant }: { variant: 'primary' | 'inverted' }) {
  const { t } = useTranslation();
  const labelClass = variant === 'primary' ? 'text-gray-400 dark:text-gray-500' : 'text-emerald-100';
  return (
    <div className="hidden md:flex gap-8 mt-6">
      <div className="flex flex-col items-center gap-2">
        <img src="/qr-ios.svg" alt="QR code — App Store" className="w-20 h-20 rounded-lg" />
        <span className={`text-xs ${labelClass}`}>App Store</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <img src="/qr-android.svg" alt="QR code — Google Play" className="w-20 h-20 rounded-lg" />
        <span className={`text-xs ${labelClass}`}>Google Play</span>
      </div>
    </div>
  );
}

export default function Get() {
  const { t } = useTranslation();

  const steps = [
    { icon: '🚪', titleKey: 'marketing.step1Title', descKey: 'marketing.step1Desc' },
    { icon: '👀', titleKey: 'marketing.step2Title', descKey: 'marketing.step2Desc' },
    { icon: '🏃', titleKey: 'marketing.step3Title', descKey: 'marketing.step3Desc' },
  ];

  return (
    <div className="bg-white dark:bg-gray-950">

      {/* ── 1: Hero ──────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
        <img src="/logo-icon.svg" alt="dropby" className="w-16 h-16 mb-6 dark:invert" />
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-50 leading-tight mb-3">
          {t('marketing.tagline')}
        </h1>
        <p className="text-xl md:text-2xl font-semibold text-gray-500 dark:text-gray-400 mb-10">
          {t('marketing.tagline2')}
        </p>
        <StoreButtons variant="primary" />
        <QrBlock variant="primary" />
        <Link
          to="/auth"
          className="mt-8 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {t('marketing.webFallback')} →
        </Link>
      </section>

      {/* ── 2: The problem ───────────────────────────────────── */}
      <section className="px-6 py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 leading-snug mb-2">
            {t('marketing.problemHeadline')}
          </p>
          <p className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 leading-snug mb-8">
            {t('marketing.problemLine2')}
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
            {t('marketing.problemBody')}
          </p>
          <p className="text-lg font-semibold text-emerald-500">
            {t('marketing.problemCoda')}
          </p>
        </div>
      </section>

      {/* ── 3: How it works ──────────────────────────────────── */}
      <section className="px-6 py-20 bg-white dark:bg-gray-950">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">
              {t('marketing.howHeadline')}
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {t('marketing.howSubline')}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map(step => (
              <div key={step.titleKey} className="flex flex-col items-start md:items-center md:text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-2xl mb-4 flex-shrink-0">
                  {step.icon}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-50 mb-1">{t(step.titleKey)}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4: Mock in-app moment ────────────────────────────── */}
      <section className="px-6 py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-xs mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-gray-700 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                S
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-50 text-sm">Sarah opened her door 🚪</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">coffee and a walk, anyone?</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-emerald-500 text-white text-center py-2 rounded-xl text-sm font-semibold">
                Going 🏃
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-center py-2 rounded-xl text-sm font-semibold">
                Maybe
              </div>
            </div>
          </div>
          <p className="text-center text-gray-500 dark:text-gray-400 text-base">
            {t('marketing.socialCaption')}
          </p>
        </div>
      </section>

      {/* ── 5: Bottom CTA band ───────────────────────────────── */}
      <section className="bg-emerald-500 px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-10">
          {t('marketing.bottomHeadline')}
        </h2>
        <div className="flex justify-center">
          <StoreButtons variant="inverted" />
        </div>
        <div className="flex justify-center">
          <QrBlock variant="inverted" />
        </div>
        <Link
          to="/auth"
          className="mt-8 inline-block text-sm text-emerald-100 hover:text-white transition-colors"
        >
          {t('marketing.webFallback')} →
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-white dark:bg-gray-950 py-8 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <Link to="/about" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">About</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Privacy</Link>
        </div>
      </footer>

    </div>
  );
}
