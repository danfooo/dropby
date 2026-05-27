import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// ── Animation helpers ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useInView(threshold = 0.15): [React.RefObject<any>, boolean] {
  const ref = useRef<Element>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref as React.RefObject<any>, inView];
}

function fx(visible: boolean) {
  return `transition-[opacity,transform] duration-700 ease-out ${
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
  }`;
}

// ── Icons ─────────────────────────────────────────────────────

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 1 0 20M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
    </svg>
  );
}

// ── Language switcher ─────────────────────────────────────────

const LANGUAGES = [
  { code: 'en-US', label: 'English',   short: 'EN' },
  { code: 'de',    label: 'Deutsch',   short: 'DE' },
  { code: 'es',    label: 'Español',   short: 'ES' },
  { code: 'fr',    label: 'Français',  short: 'FR' },
  { code: 'it',    label: 'Italiano',  short: 'IT' },
  { code: 'pt',    label: 'Português', short: 'PT' },
  { code: 'sv',    label: 'Svenska',   short: 'SV' },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Change language"
      >
        <GlobeIcon />
        {current.short}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-50 animate-fade-in">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                lang.code === i18n.language
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function Get() {
  const { t } = useTranslation();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(timer);
  }, []);

  const [problemRef, problemIn] = useInView();
  const [howRef, howIn] = useInView();
  const [step1Ref, step1In] = useInView(0.2);
  const [step2Ref, step2In] = useInView(0.2);
  const [step3Ref, step3In] = useInView(0.2);
  const [cardRef, cardIn] = useInView(0.2);
  const [bottomRef, bottomIn] = useInView();

  const steps = [
    { icon: '👋', titleKey: 'marketing.step1Title', descKey: 'marketing.step1Desc', ref: step1Ref, inView: step1In },
    { icon: '👀', titleKey: 'marketing.step2Title', descKey: 'marketing.step2Desc', ref: step2Ref, inView: step2In },
    { icon: '🏃', titleKey: 'marketing.step3Title', descKey: 'marketing.step3Desc', ref: step3Ref, inView: step3In },
  ];

  return (
    <div className="bg-white dark:bg-gray-950">

      {/* ── Language switcher — fixed top-right ──────────────── */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* ── 1: Hero ──────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
        <img
          src="/logo-icon.svg" alt="dropby"
          className={`w-16 h-16 mb-6 dark:[filter:invert(1)] ${fx(mounted)}`}
          style={{ transitionDelay: '0ms' }}
        />
        <h1
          className={`text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-50 leading-tight mb-3 ${fx(mounted)}`}
          style={{ transitionDelay: '100ms' }}
        >
          {t('marketing.tagline')}
        </h1>
        <p
          className={`text-xl md:text-2xl font-semibold text-gray-500 dark:text-gray-400 mb-10 ${fx(mounted)}`}
          style={{ transitionDelay: '200ms' }}
        >
          {t('marketing.tagline2')}
        </p>
        <Link
          to="/auth"
          className={`mt-8 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ${fx(mounted)}`}
          style={{ transitionDelay: '500ms' }}
        >
          {t('marketing.webFallback')} →
        </Link>
      </section>

      {/* ── 2: The problem ───────────────────────────────────── */}
      <section ref={problemRef} className="px-6 py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-xl mx-auto text-center">
          <p className={`text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 leading-snug mb-2 ${fx(problemIn)}`} style={{ transitionDelay: '0ms' }}>
            {t('marketing.problemHeadline')}
          </p>
          <p className={`text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 leading-snug mb-8 ${fx(problemIn)}`} style={{ transitionDelay: '100ms' }}>
            {t('marketing.problemLine2')}
          </p>
          <p className={`text-lg text-gray-500 dark:text-gray-400 leading-relaxed mb-8 ${fx(problemIn)}`} style={{ transitionDelay: '200ms' }}>
            {t('marketing.problemBody')}
          </p>
          <p className={`text-lg font-semibold text-emerald-500 ${fx(problemIn)}`} style={{ transitionDelay: '320ms' }}>
            {t('marketing.problemCoda')}
          </p>
        </div>
      </section>

      {/* ── 3: How it works ──────────────────────────────────── */}
      <section className="px-6 py-20 bg-white dark:bg-gray-950">
        <div className="max-w-3xl mx-auto">
          <div ref={howRef} className="text-center mb-12">
            <h2 className={`text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3 ${fx(howIn)}`}>
              {t('marketing.howHeadline')}
            </h2>
            <p className={`text-sm text-gray-400 dark:text-gray-500 ${fx(howIn)}`} style={{ transitionDelay: '100ms' }}>
              {t('marketing.howSubline')}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map((step, i) => (
              <div
                key={step.titleKey}
                ref={step.ref}
                className={`flex flex-col items-start md:items-center md:text-center ${fx(step.inView)}`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
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
          <div
            ref={cardRef}
            className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-gray-700 mb-8 transition-[opacity,transform] duration-700 ease-out ${
              cardIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            style={{ animation: cardIn ? 'float 4s ease-in-out 0.8s infinite' : undefined }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                S
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-50 text-sm">Sarah {t('marketing.mockOpened')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('marketing.mockNote')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-emerald-500 text-white text-center py-2 rounded-xl text-sm font-semibold">
                {t('marketing.mockGoing')}
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-center py-2 rounded-xl text-sm font-semibold">
                {t('marketing.mockMaybe')}
              </div>
            </div>
          </div>
          <p className={`text-center text-gray-500 dark:text-gray-400 text-base ${fx(cardIn)}`} style={{ transitionDelay: '200ms' }}>
            {t('marketing.socialCaption')}
          </p>
        </div>
      </section>

      {/* ── 5: Bottom CTA band ───────────────────────────────── */}
      <section ref={bottomRef} className="bg-emerald-500 px-6 py-20 text-center">
        <h2 className={`text-3xl md:text-4xl font-bold text-white mb-10 ${fx(bottomIn)}`}>
          {t('marketing.bottomHeadline')}
        </h2>
        <Link
          to="/auth"
          className={`mt-8 inline-block text-sm text-emerald-100 hover:text-white transition-colors ${fx(bottomIn)}`}
          style={{ transitionDelay: '300ms' }}
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
