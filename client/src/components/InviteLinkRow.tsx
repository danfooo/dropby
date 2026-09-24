import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function relativeTime(unixTs: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixTs;
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// A door's shareable link, with a 3-second undo before it is revoked.
export default function InviteLinkRow({ token, createdAt, onRevoke }: { token: string; createdAt: number; onRevoke: () => void }) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRemove = () => {
    setRemoving(true);
    setCountdown(3);
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          onRevoke();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const undo = () => {
    setRemoving(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <div className={`flex-1 ${removing ? 'opacity-40' : ''}`}>
        <p className="text-sm text-gray-900 dark:text-gray-50">{t('home.anyoneWithLink')}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(createdAt)}</p>
      </div>
      {removing ? (
        <button onClick={undo} className="text-xs text-emerald-600 font-medium px-2">
          {t('home.undo', { seconds: countdown })}
        </button>
      ) : (
        <button onClick={startRemove} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
