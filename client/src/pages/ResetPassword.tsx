import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api';
import { useAuthStore } from '../stores/auth';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setStatus('error');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    if (password.length < 8) { setError(t('auth.passwordTooShort')); return; }
    setStatus('loading');
    setError('');
    try {
      const data = await authApi.resetPassword(token!, password);
      setAuth(data.user, data.token);
      setStatus('success');
      setTimeout(() => navigate('/home'), 1500);
    } catch (err: any) {
      const code = err.response?.data?.error;
      setError(code === 'INVALID_OR_EXPIRED' ? t('auth.resetLinkExpired') : t('auth.somethingWentWrong'));
      setStatus('form');
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

        {status === 'error' && !token && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">{t('auth.resetLinkExpired')}</p>
            <Link to="/auth" className="text-emerald-600 font-medium">{t('auth.backToLogin')}</Link>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-900 font-medium">{t('auth.passwordUpdated')}</p>
          </div>
        )}

        {(status === 'form' || status === 'loading') && token && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('auth.setNewPassword')}</h2>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-3 text-sm mb-4">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                placeholder={t('auth.newPassword')}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="password"
                placeholder={t('auth.confirmPassword')}
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                {status === 'loading' ? t('auth.pleaseWait') : t('auth.setNewPassword')}
              </button>
            </form>
            <p className="text-center mt-4">
              <Link to="/auth" className="text-sm text-gray-500 hover:text-gray-700">{t('auth.backToLogin')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
