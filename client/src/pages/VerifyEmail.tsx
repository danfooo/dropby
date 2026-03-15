import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api';
import { useAuthStore } from '../stores/auth';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const redirect = searchParams.get('redirect') || '/home';
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }

    authApi.verifyEmail(token)
      .then(({ token: jwt, user }) => {
        setAuth(user, jwt);
        setStatus('success');
        setTimeout(() => navigate(redirect), 1500);
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 bg-white">
      <div className="w-full max-w-sm text-center">
        <img src="/logo-icon.svg" alt="dropby" className="h-14 w-14 mx-auto mb-6" />

        {status === 'verifying' && (
          <>
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">{t('auth.verifying')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('auth.youreIn')}</h2>
            <p className="text-gray-500 text-sm">{t('auth.takingYouIn')}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('auth.linkExpiredTitle')}</h2>
            <p className="text-gray-500 text-sm mb-6">
              {t('auth.linkExpiredDesc')}
            </p>
            <Link
              to="/auth"
              className="block w-full bg-emerald-500 text-white py-3 rounded-xl font-semibold text-center"
            >
              {t('auth.backToSignIn')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
