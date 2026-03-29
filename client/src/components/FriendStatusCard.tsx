import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';
import { bigEmojiClass, formatTime, formatTimeShort } from '../utils/schedule';

export default function FriendStatusCard({ status, onGoing, onNoteUpdate }: {
  status: any;
  onGoing: (id: string, rsvp: 'going' | null) => void;
  onNoteUpdate: (id: string, note: string) => void;
}) {
  const { t } = useTranslation();
  const isScheduled = status.starts_at && status.starts_at > Math.floor(Date.now() / 1000);
  const [myRsvp, setMyRsvp] = useState<'going' | null>(status.my_rsvp === 'going' ? 'going' : null);
  const [noteText, setNoteText] = useState(status.my_note || '');
  const lastSentNote = useRef(status.my_note || '');
  const bigNote = status.note ? bigEmojiClass(status.note) : null;

  const handleGoing = async () => {
    const next = myRsvp === 'going' ? null : 'going';
    setMyRsvp(next);
    if (next === null) { setNoteText(''); lastSentNote.current = ''; }
    await onGoing(status.id, next);
  };

  const handleNoteBlur = async () => {
    const trimmed = noteText.trim();
    if (trimmed === lastSentNote.current) return;
    lastSentNote.current = trimmed;
    await onNoteUpdate(status.id, trimmed);
  };

  return (
    <div className={`rounded-2xl p-4 shadow-sm border ${isScheduled ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={status.owner_name} size="md" />
        <p className="font-semibold text-gray-900 dark:text-gray-50">{status.owner_name}</p>
      </div>
      {status.note && (
        <p className={bigNote ? `${bigNote} leading-none mb-2` : 'text-sm text-gray-500 dark:text-gray-400 truncate mb-2'}>
          {status.note}
        </p>
      )}
      {isScheduled && (
        <p className="text-xs text-violet-500 dark:text-violet-400 mb-3">
          {t('home.opensAt', { time: formatTime(status.starts_at) })}
        </p>
      )}
      {!isScheduled && status.ends_at && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          {t('home.freeUntil', { time: formatTimeShort(status.ends_at) })}
        </p>
      )}

      {/* RSVP button */}
      <button
        onClick={handleGoing}
        className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
          myRsvp === 'going'
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
        }`}
      >
        {myRsvp === 'going' ? `${t('home.rsvpGoing')} ✅` : t('home.rsvpGoing')}
      </button>

      {/* Note field — shown after Going is confirmed */}
      {myRsvp === 'going' && (
        <div className="mt-3">
          <input
            type="text"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onBlur={handleNoteBlur}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder={t('home.rsvpNotePlaceholder')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{t('home.rsvpNoteHint')}</p>
        </div>
      )}
    </div>
  );
}
