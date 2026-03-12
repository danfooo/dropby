import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../stores/auth';

export default function VerifyEmail() {
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
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
          </svg>
        </div>

        {status === 'verifying' && (
          <>
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">You're in!</h2>
            <p className="text-gray-500 text-sm">Taking you to Drop By…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link expired or invalid</h2>
            <p className="text-gray-500 text-sm mb-6">
              This verification link has already been used or has expired.
            </p>
            <Link
              to="/auth"
              className="block w-full bg-emerald-500 text-white py-3 rounded-xl font-semibold text-center"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
