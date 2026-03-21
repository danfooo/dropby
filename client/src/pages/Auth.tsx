import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { authApi, invitesApi, associatePendingGuest } from '../api';
import { useAuthStore } from '../stores/auth';
import Avatar from '../components/Avatar';

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

  const inviteToken = redirect.match(/^\/invite\/([^/?]+)/)?.[1] ?? null;

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
        await authApi.signup(email, password, displayName, i18n.language, redirect !== '/home' ? redirect : undefined);
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

  const handleResend = async () => {
    try {
      await authApi.resendVerification(email, redirect !== '/home' ? redirect : undefined);
      setMessage(t('auth.verificationResent'));
      setShowResend(false);
    } catch {
      setError(t('auth.couldNotResend'));
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) { setError(t('auth.googleFailed')); return; }
    setLoading(true);
    try {
      const data = await authApi.google(credentialResponse.credential);
      handleSuccess(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.googleFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 bg-white dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="dropby" className="h-16 mx-auto" />
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
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="password"
                placeholder={t('auth.password')}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
              />
            </div>
          </>
        )}
      </div>
      <p className="mt-10 text-xs text-gray-500 dark:text-gray-500">
        <a href="/about" className="hover:text-gray-700 dark:hover:text-gray-300">About</a>
      </p>
    </div>
  );
}
