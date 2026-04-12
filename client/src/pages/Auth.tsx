import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { authApi, invitesApi, waitlistApi, associatePendingGuest, trackApi } from '../api';
import { useAuthStore } from '../stores/auth';
import Avatar from '../components/Avatar';
import Turnstile from '../components/Turnstile';

type Tab = 'login' | 'signup';

export default function Auth() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showResend, setShowResend] = useState(false);
  const [inviter, setInviter] = useState<{ display_name: string } | null>(null);
  const [view, setView] = useState<'auth' | 'forgot'>('auth');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/home';

  // Invite token can come from either the redirect URL (?redirect=/invite/:token)
  // or from localStorage if the user previously visited /invite/:token.
  const inviteToken =
    redirect.match(/^\/invite\/([^/?]+)/)?.[1] ??
    (typeof window !== 'undefined' ? localStorage.getItem('dropby_invite_token') : null);

  // Waitlist state (used when no invite token)
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [honeypot, setHoneypot] = useState(''); // hidden field — bots fill, humans don't

  useEffect(() => {
    // Track auth page views for signup funnel analysis.
    // Intent = signup if arriving via invite redirect, login otherwise.
    const intent = redirect.startsWith('/invite/') ? 'signup' : 'login';
    trackApi.event('page.auth_viewed', { intent });
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    invitesApi.get(inviteToken)
      .then(data => {
        if (data?.inviter) {
          setInviter(data.inviter);
          setTab('signup');
        }
      })
      .catch(() => {});
  }, [inviteToken]);

  const handleSuccess = async (data: { user: any; token: string }) => {
    setAuth(data.user, data.token);
    await associatePendingGuest();
    navigate(redirect);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      if (tab === 'signup') {
        await authApi.signup(email, password, displayName, i18n.language, redirect !== '/home' ? redirect : undefined, inviteToken);
        setMessage(t('auth.verifyEmailSent'));
        setTab('login');
      } else {
        const data = await authApi.login(email, password);
        handleSuccess(data);
      }
    } catch (err: any) {
      const code = err.response?.data?.error;
      if (code === 'EMAIL_NOT_VERIFIED' || code === 'EMAIL_EXISTS_UNVERIFIED') {
        setError(t('auth.verifyEmailSent'));
        setShowResend(true);
      } else if (code === 'INVITE_REQUIRED') {
        setError(t('auth.inviteRequired'));
      } else if (err.response?.status === 409) {
        setTab('login');
        setMessage('Looks like you already have an account — log in below.');
      } else {
        setError(err.response?.data?.error || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaitlistError('');
    if (!turnstileToken) { setWaitlistError(t('waitlist.captchaPending')); return; }
    setWaitlistLoading(true);
    try {
      await waitlistApi.join(waitlistEmail.trim(), i18n.language, turnstileToken, honeypot);
      setWaitlistDone(true);
    } catch (err: any) {
      const code = err.response?.data?.error;
      if (code === 'RATE_LIMITED') setWaitlistError(t('waitlist.rateLimited'));
      else if (code === 'INVALID_EMAIL') setWaitlistError(t('waitlist.invalidEmail'));
      else setWaitlistError(t('auth.somethingWentWrong'));
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await authApi.resendVerification(email, redirect !== '/home' ? redirect : undefined);
      setMessage(t('auth.verificationResent'));
      setShowResend(false);
    } catch {
      setError(t('auth.couldNotResend'));
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      if (Capacitor.getPlatform() === 'ios') {
        // Native iOS: use Capacitor plugin
        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
        const result = await SignInWithApple.authorize({
          clientId: 'cc.dropby.app',
          redirectURI: 'https://drop-by.fly.dev',
          scopes: 'email name',
        });
        const { identityToken, givenName, familyName } = result.response;
        if (!identityToken) throw new Error('No identity token');
        const fullName = (givenName || familyName) ? { givenName: givenName ?? undefined, familyName: familyName ?? undefined } : undefined;
        const data = await authApi.apple(identityToken, fullName, inviteToken);
        handleSuccess(data);
      } else {
        // Web: use Apple JS SDK
        if (!(window as any).AppleID) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Apple Sign In'));
            document.head.appendChild(script);
          });
        }
        const AppleID = (window as any).AppleID;
        AppleID.auth.init({
          clientId: import.meta.env.VITE_APPLE_SERVICE_ID,
          scope: 'name email',
          redirectURI: window.location.origin,
          usePopup: true,
        });
        const result = await AppleID.auth.signIn();
        const identityToken = result.authorization?.id_token;
        if (!identityToken) throw new Error('No identity token');
        const firstName = result.user?.name?.firstName;
        const lastName = result.user?.name?.lastName;
        const fullName = (firstName || lastName) ? { givenName: firstName ?? undefined, familyName: lastName ?? undefined } : undefined;
        const data = await authApi.apple(identityToken, fullName, inviteToken);
        handleSuccess(data);
      }
    } catch (err: any) {
      // Ignore user cancellation
      const msg = String(err?.message ?? err?.error ?? '');
      if (err?.response?.data?.error === 'INVITE_REQUIRED') {
        setError(t('auth.inviteRequired'));
      } else if (err?.code !== '1001' && !msg.includes('1001') && err?.error !== 'popup_closed_by_user') {
        setError(t('auth.appleFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) { setError(t('auth.googleFailed')); return; }
    setLoading(true);
    try {
      const data = await authApi.google(credentialResponse.credential, inviteToken);
      handleSuccess(data);
    } catch (err: any) {
      const code = err.response?.data?.error;
      if (code === 'INVITE_REQUIRED') setError(t('auth.inviteRequired'));
      else setError(code || t('auth.googleFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 bg-white dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="dropby" className="h-16 mx-auto dark:[filter:invert(1)]" />
        </div>

        {view === 'forgot' ? (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">{t('auth.forgotPassword')}</h2>
            {!forgotSent ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('auth.forgotPasswordDesc')}</p>
                {error && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
                )}
                <form onSubmit={async e => {
                  e.preventDefault();
                  setLoading(true);
                  try {
                    await authApi.forgotPassword(forgotEmail);
                    setForgotSent(true);
                  } catch {
                    setError(t('auth.somethingWentWrong'));
                  } finally {
                    setLoading(false);
                  }
                }} className="space-y-3">
                  <input
                    type="email"
                    placeholder={t('auth.email')}
                    required
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:text-gray-50"
                  />
                  <button type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors">
                    {loading ? t('auth.pleaseWait') : t('auth.sendResetLink')}
                  </button>
                </form>
                <p className="text-center mt-4">
                  <button type="button" onClick={() => { setView('auth'); setError(''); }} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">{t('auth.backToLogin')}</button>
                </p>
              </>
            ) : (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t('auth.resetLinkSent')}</p>
                <button type="button" onClick={() => { setView('auth'); setForgotSent(false); setError(''); }} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                  {t('auth.backToLogin')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {inviter && (
              <div className="text-center mb-6">
                <Avatar name={inviter.display_name} size="lg" className="mx-auto mb-3" />
                <p className="text-gray-700 dark:text-gray-300 font-medium">{t('auth.connectWithName', { name: inviter.display_name })}</p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6">
              {(['login', 'signup'] as Tab[]).map(tabKey => (
                <button
                  key={tabKey}
                  onClick={() => { setTab(tabKey); setError(''); setMessage(''); setShowResend(false); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    tab === tabKey ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {tabKey === 'login' ? t('auth.login') : t('auth.signup')}
                </button>
              ))}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-700 rounded-xl p-3 text-sm mb-4">
                {error}
                {showResend && (
                  <button onClick={handleResend} className="block mt-1 underline font-medium">
                    {t('auth.resendVerification')}
                  </button>
                )}
              </div>
            )}
            {message && (
              <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl p-3 text-sm mb-4">
                {message}
              </div>
            )}

            {tab === 'signup' && !inviteToken ? (
              waitlistDone ? (
                <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl p-4 text-sm text-center">
                  {t('waitlist.success')}
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-1">{t('waitlist.title')}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('waitlist.subtitle')}</p>
                  </div>
                  {waitlistError && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-700 rounded-xl p-3 text-sm mb-3">
                      {waitlistError}
                    </div>
                  )}
                  <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                    <input
                      type="email"
                      required
                      placeholder={t('auth.email')}
                      value={waitlistEmail}
                      onChange={e => setWaitlistEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-[16px] dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    {/* Honeypot — hidden from humans, bots auto-fill */}
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={e => setHoneypot(e.target.value)}
                      style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', opacity: 0 }}
                      aria-hidden="true"
                    />
                    <Turnstile onToken={setTurnstileToken} />
                    <button
                      type="submit"
                      disabled={waitlistLoading}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
                    >
                      {waitlistLoading ? t('auth.pleaseWait') : t('waitlist.cta')}
                    </button>
                  </form>
                </>
              )
            ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {tab === 'signup' && (
                <input
                  type="text"
                  placeholder={t('auth.displayName')}
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-[16px] dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              )}
              <input
                type="email"
                placeholder={t('auth.email')}
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-[16px] dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="password"
                placeholder={t('auth.password')}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-[16px] dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {tab === 'login' && (
                <div className="text-right -mt-1">
                  <button type="button" onClick={() => { setView('forgot'); setForgotEmail(email); setError(''); setMessage(''); }} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                {loading ? t('auth.pleaseWait') : tab === 'login' ? t('auth.login') : t('auth.createAccount')}
              </button>
            </form>
            )}

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-950 px-2">{t('auth.or')}</div>
            </div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError(t('auth.googleFailed'))}
                width={340}
                shape="rectangular"
                text="continue_with"
                theme="filled_black"
              />
            </div>

            {(Capacitor.getPlatform() === 'ios' || (Capacitor.getPlatform() === 'web' && import.meta.env.VITE_APPLE_SERVICE_ID)) && (
              <button
                type="button"
                onClick={handleAppleSignIn}
                disabled={loading}
                className="mt-3 w-full flex items-center justify-center gap-3 bg-black hover:bg-gray-900 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                <svg className="w-5 h-5 fill-current flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                {t('auth.continueWithApple')}
              </button>
            )}
          </>
        )}
      </div>
      <p className="mt-10 text-xs text-gray-500 dark:text-gray-500">
        <a href="/about" className="hover:text-gray-700 dark:hover:text-gray-300">About</a>
      </p>
    </div>
  );
}
