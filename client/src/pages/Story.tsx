import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function useInView(threshold = 0.4): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function useTypewriter(text: string, active: boolean, speed = 40) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!active) return;
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, active, speed]);
  return displayed;
}

// Scroll progress bar at top
function ProgressBar() {
  const [progress, setProgress] = useState(0);
  const onScroll = useCallback(() => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    setProgress(h > 0 ? window.scrollY / h : 0);
  }, []);
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-50 bg-gray-200/30 dark:bg-gray-800/30">
      <div
        className="h-full bg-emerald-500 transition-[width] duration-75"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

// Full-screen slide wrapper
function Slide({
  children,
  bg = 'bg-white dark:bg-gray-950',
  className = '',
}: {
  children: React.ReactNode;
  bg?: string;
  className?: string;
}) {
  return (
    <section className={`min-h-screen flex flex-col items-center justify-center px-6 py-20 ${bg} ${className}`}>
      {children}
    </section>
  );
}

// Animated text reveal
function Reveal({
  children,
  visible,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  visible: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`transition-[opacity,transform] duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Chat bubble for the messaging scene
function ChatBubble({
  text,
  side,
  visible,
  delay,
  color = 'bg-gray-100 dark:bg-gray-800',
}: {
  text: string;
  side: 'left' | 'right';
  visible: boolean;
  delay: number;
  color?: string;
}) {
  return (
    <div
      className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-base transition-[opacity,transform] duration-500 ease-out ${color} ${
          side === 'right' ? 'rounded-br-md' : 'rounded-bl-md'
        } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        <p className={side === 'right' ? 'text-white' : 'text-gray-800 dark:text-gray-200'}>
          {text}
        </p>
      </div>
    </div>
  );
}

// The door animation
function DoorAnimation({ active }: { active: boolean }) {
  return (
    <div className="relative w-32 h-44 mx-auto">
      {/* Door frame */}
      <div className="absolute inset-0 rounded-t-xl border-4 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800" />
      {/* Door */}
      <div
        className="absolute inset-1 rounded-t-lg bg-emerald-500 origin-left transition-transform duration-1000 ease-out"
        style={{
          transform: active ? 'perspective(600px) rotateY(-70deg)' : 'perspective(600px) rotateY(0deg)',
        }}
      >
        {/* Doorknob */}
        <div className="absolute right-3 top-1/2 w-3 h-3 rounded-full bg-emerald-300" />
      </div>
      {/* Light streaming out */}
      <div
        className={`absolute inset-2 rounded-t-md bg-gradient-to-r from-yellow-100/80 to-yellow-50/0 dark:from-yellow-200/20 dark:to-transparent transition-opacity duration-1000 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '400ms' }}
      />
    </div>
  );
}

export default function Story() {
  const { t } = useTranslation();

  // Slide visibility
  const [s1Ref, s1] = useInView(0.3);
  const [s2Ref, s2] = useInView(0.3);
  const [s3Ref, s3] = useInView(0.3);
  const [s4Ref, s4] = useInView(0.3);
  const [s5Ref, s5] = useInView(0.3);
  const [s6Ref, s6] = useInView(0.3);
  const [s7Ref, s7] = useInView(0.3);
  const [s8Ref, s8] = useInView(0.3);

  // Typewriter for the key moment
  const typed = useTypewriter(t('story.typewriter'), s5, 50);

  // Entrance mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-950 overflow-x-hidden">
      <ProgressBar />

      {/* ── 1: The hook — nostalgia ─────────────────────────── */}
      <Slide>
        <div ref={s1Ref} className="max-w-lg text-center">
          <Reveal visible={mounted} delay={200}>
            <p className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-gray-50 leading-tight">
              {t('story.hookLine1')}
            </p>
          </Reveal>
          <Reveal visible={mounted} delay={600}>
            <p className="text-5xl md:text-6xl font-bold text-emerald-500 leading-tight mt-2">
              {t('story.hookLine2')}
            </p>
          </Reveal>
          <Reveal visible={mounted} delay={1200}>
            <p className="text-lg text-gray-400 dark:text-gray-500 mt-8">
              {t('story.scrollHint')}
            </p>
            <div className="mt-4 animate-bounce text-gray-300 dark:text-gray-600 text-2xl">
              ↓
            </div>
          </Reveal>
        </div>
      </Slide>

      {/* ── 2: The memory ──────────────────────────────────── */}
      <Slide bg="bg-gray-50 dark:bg-gray-900">
        <div ref={s2Ref} className="max-w-md text-center">
          <Reveal visible={s2} delay={0}>
            <p className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 leading-snug">
              {t('story.memoryLine1')}
            </p>
          </Reveal>
          <Reveal visible={s2} delay={200}>
            <p className="text-xl text-gray-500 dark:text-gray-400 mt-6 leading-relaxed">
              {t('story.memoryLine2')}
            </p>
          </Reveal>
          <Reveal visible={s2} delay={400}>
            <p className="text-xl text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">
              {t('story.memoryLine3')}
            </p>
          </Reveal>
        </div>
      </Slide>

      {/* ── 3: The problem — the group chat ────────────────── */}
      <Slide>
        <div ref={s3Ref} className="max-w-sm w-full">
          <Reveal visible={s3} delay={0}>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 text-center mb-8">
              {t('story.chatTitle')}
            </p>
          </Reveal>
          <div className="space-y-3">
            <ChatBubble
              text={t('story.chat1')}
              side="left"
              visible={s3}
              delay={300}
            />
            <ChatBubble
              text={t('story.chat2')}
              side="right"
              visible={s3}
              delay={700}
              color="bg-blue-500"
            />
            <ChatBubble
              text={t('story.chat3')}
              side="left"
              visible={s3}
              delay={1100}
            />
            <ChatBubble
              text={t('story.chat4')}
              side="right"
              visible={s3}
              delay={1500}
              color="bg-blue-500"
            />
            <ChatBubble
              text={t('story.chat5')}
              side="left"
              visible={s3}
              delay={1900}
            />
          </div>
          <Reveal visible={s3} delay={2400}>
            <p className="text-center text-gray-400 dark:text-gray-500 mt-8 text-base italic">
              {t('story.chatPunchline')}
            </p>
          </Reveal>
        </div>
      </Slide>

      {/* ── 4: The feeling ─────────────────────────────────── */}
      <Slide bg="bg-gray-50 dark:bg-gray-900">
        <div ref={s4Ref} className="max-w-md text-center">
          <Reveal visible={s4} delay={0}>
            <p className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-50 leading-tight">
              {t('story.feelingLine1')}
            </p>
          </Reveal>
          <Reveal visible={s4} delay={300}>
            <p className="text-xl text-gray-500 dark:text-gray-400 mt-6 leading-relaxed">
              {t('story.feelingLine2')}
            </p>
          </Reveal>
          <Reveal visible={s4} delay={600}>
            <p className="text-xl text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">
              {t('story.feelingLine3')}
            </p>
          </Reveal>
        </div>
      </Slide>

      {/* ── 5: The door opens — the key moment ─────────────── */}
      <Slide>
        <div ref={s5Ref} className="max-w-md text-center">
          <Reveal visible={s5} delay={0}>
            <DoorAnimation active={s5} />
          </Reveal>
          <Reveal visible={s5} delay={600}>
            <p className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-50 mt-10 leading-snug">
              {t('story.doorTitle')}
            </p>
          </Reveal>
          <div className="mt-6 h-8">
            <p className="text-lg text-emerald-500 font-semibold">
              {typed}
              <span className="animate-pulse">|</span>
            </p>
          </div>
        </div>
      </Slide>

      {/* ── 6: How it actually looks ───────────────────────── */}
      <Slide bg="bg-gray-50 dark:bg-gray-900">
        <div ref={s6Ref} className="max-w-sm w-full">
          <Reveal visible={s6} delay={0}>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 text-center mb-8">
              {t('story.mockTitle')}
            </p>
          </Reveal>

          {/* Notification mock */}
          <Reveal visible={s6} delay={300}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-700 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <img src="/logo-icon.svg" alt="" className="w-5 h-5 [filter:invert(1)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-gray-50 text-sm">dropby</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">{t('story.notifText')}</p>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{t('story.notifTime')}</p>
              </div>
            </div>
          </Reveal>

          {/* App card mock */}
          <Reveal visible={s6} delay={700}>
            <div
              className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-gray-700"
              style={{ animation: s6 ? 'float 4s ease-in-out 1.5s infinite' : undefined }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  S
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-50 text-sm">
                    Sarah {t('marketing.mockOpened')}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {t('marketing.mockNote')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-emerald-500 text-white text-center py-2.5 rounded-xl text-sm font-semibold cursor-pointer hover:bg-emerald-600 transition-colors">
                  {t('marketing.mockGoing')}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal visible={s6} delay={1100}>
            <p className="text-center text-gray-400 dark:text-gray-500 mt-6 text-base">
              {t('story.mockCaption')}
            </p>
          </Reveal>
        </div>
      </Slide>

      {/* ── 7: The contrast ────────────────────────────────── */}
      <Slide>
        <div ref={s7Ref} className="max-w-lg text-center">
          <Reveal visible={s7} delay={0}>
            <p className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 leading-snug">
              {t('story.contrastLine1')}
            </p>
          </Reveal>
          <Reveal visible={s7} delay={300}>
            <div className="mt-10 flex flex-col sm:flex-row gap-6 justify-center">
              <div className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-2xl p-6">
                <p className="text-3xl mb-3">💬</p>
                <p className="font-semibold text-gray-400 dark:text-gray-500 text-sm">{t('story.contrastBefore')}</p>
                <p className="text-gray-400 dark:text-gray-600 text-sm mt-2 leading-relaxed">{t('story.contrastBeforeDesc')}</p>
              </div>
              <div className="flex-1 bg-emerald-50 dark:bg-emerald-950 rounded-2xl p-6 ring-2 ring-emerald-500/20">
                <p className="text-3xl mb-3">🚪</p>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">{t('story.contrastAfter')}</p>
                <p className="text-emerald-600/70 dark:text-emerald-400/70 text-sm mt-2 leading-relaxed">{t('story.contrastAfterDesc')}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </Slide>

      {/* ── 8: CTA ─────────────────────────────────────────── */}
      <Slide bg="bg-emerald-500">
        <div ref={s8Ref} className="max-w-md text-center">
          <Reveal visible={s8} delay={0}>
            <p className="text-4xl md:text-5xl font-bold text-white leading-tight">
              {t('story.ctaLine1')}
            </p>
          </Reveal>
          <Reveal visible={s8} delay={300}>
            <p className="text-xl text-emerald-100 mt-6 leading-relaxed">
              {t('story.ctaLine2')}
            </p>
          </Reveal>
          <Reveal visible={s8} delay={600}>
            <Link
              to="/auth"
              className="inline-block mt-10 px-10 py-4 bg-white text-emerald-600 rounded-full font-bold text-lg hover:bg-gray-50 hover:scale-105 active:scale-95 transition-[background-color,transform] duration-150 shadow-lg"
            >
              {t('story.ctaButton')}
            </Link>
          </Reveal>
          <Reveal visible={s8} delay={800}>
            <p className="text-emerald-200 text-sm mt-6">
              {t('story.ctaFootnote')}
            </p>
          </Reveal>
        </div>
      </Slide>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-950 py-8 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <Link to="/" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Home</Link>
          <span>·</span>
          <Link to="/about" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">About</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
