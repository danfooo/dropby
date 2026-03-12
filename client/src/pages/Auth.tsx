import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { authApi, invitesApi } from '../api';
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

  const handleSuccess = (data: { user: any; token: string }) => {
    setAuth(data.user, data.token);
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
      if (code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email before logging in.');
        setShowResend(true);
      } else {
        setError(err.response?.data?.error || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await authApi.resendVerification(email);
      setMessage('Verification email resent. Check your inbox.');
      setShowResend(false);
    } catch {
      setError('Could not resend. Please try again.');
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) { setError('Google sign-in failed'); return; }
    setLoading(true);
    try {
      const data = await authApi.google(credentialResponse.credential);
      handleSuccess(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 bg-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Drop By</h1>
        </div>

        {inviter && (
          <div className="text-center mb-6">
            <Avatar name={inviter.display_name} size="lg" className="mx-auto mb-3" />
            <p className="text-gray-700 font-medium">{t('auth.connectWithName', { name: inviter.display_name })}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {(['login', 'signup'] as Tab[]).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError(''); setMessage(''); setShowResend(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === tabKey ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {tabKey === 'login' ? t('auth.login') : t('auth.signup')}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-3 text-sm mb-4">
            {error}
            {showResend && (
              <button onClick={handleResend} className="block mt-1 underline font-medium">
                {t('auth.resendVerification')}
              </button>
            )}
          </div>
        )}
        {message && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl p-3 text-sm mb-4">
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
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          )}
          <input
            type="email"
            placeholder={t('auth.email')}
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <input
            type="password"
            placeholder={t('auth.password')}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
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
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">{t('auth.or')}</div>
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google sign-in failed')}
            width={340}
            shape="rectangular"
            text="continue_with"
          />
        </div>
      </div>
    </div>
  );
}
