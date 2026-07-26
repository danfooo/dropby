import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import Avatar from './Avatar';
import { bigEmojiClass, formatTime, formatTimeShort } from '../utils/schedule';
import { LinkifiedText } from '../utils/linkify';

export default function FriendStatusCard({ status, onGoing, onNoteUpdate }: {
  status: any;
  onGoing: (id: string, rsvp: 'going' | null, note?: string) => void;
  onNoteUpdate: (id: string, note: string) => void;
}) {
  const { t } = useTranslation();
  const isScheduled = status.starts_at && status.starts_at > Math.floor(Date.now() / 1000);
  const [myRsvp, setMyRsvp] = useState<'going' | null>(status.my_rsvp === 'going' ? 'going' : null);
  const [noteText, setNoteText] = useState(status.my_note || '');
  const [savedNote, setSavedNote] = useState(status.my_note || '');
  const bigNote = status.note ? bigEmojiClass(status.note) : null;

  const hasPendingChanges = noteText.trim() !== savedNote;

  const handleGoing = async () => {
    const next = myRsvp === 'going' ? null : 'going';
    setMyRsvp(next);
    if (next === 'going') {
      const trimmed = noteText.trim();
      setSavedNote(trimmed);
      await onGoing(status.id, 'going', trimmed || undefined);
    } else {
      await onGoing(status.id, null);
    }
  };

  const handleSaveNote = async () => {
    const trimmed = noteText.trim();
    if (trimmed === savedNote) return;
    setSavedNote(trimmed);
    if (myRsvp === 'going') {
      await onNoteUpdate(status.id, trimmed);
    } else {
      setMyRsvp('going');
      await onGoing(status.id, 'going', trimmed || undefined);
    }
  };

  const handleNoteBlur = async () => {
    if (myRsvp !== 'going') return;
    const trimmed = noteText.trim();
    if (trimmed === savedNote) return;
    setSavedNote(trimmed);
    await onNoteUpdate(status.id, trimmed);
  };

  return (
    <div className="bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar name={status.owner_name} url={status.owner_avatar_url} size="sm" />
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">{status.owner_name}</p>
        </div>
        {isScheduled && (
          <p className="text-xl font-semibold text-violet-900 dark:text-violet-100 mb-1">
            {formatTime(status.starts_at)}{status.ends_at ? ` – ${formatTimeShort(status.ends_at)}` : ''}
          </p>
        )}
        {!isScheduled && status.ends_at && (
          <p className="text-sm text-violet-700 dark:text-violet-300 mb-1">
            {t('home.freeUntil', { time: formatTimeShort(status.ends_at) })}
          </p>
        )}
        {status.note && (
          <p className={bigNote ? `${bigNote} leading-none` : 'text-sm text-violet-600 dark:text-violet-400'}>
            {status.note}
          </p>
        )}
        {status.location && (
          <p className="text-sm text-violet-500 dark:text-violet-400 mt-0.5">
            📍 <LinkifiedText text={status.location} />
          </p>
        )}
      </div>

      <div className="px-4 pb-3 border-t border-violet-100 dark:border-violet-900 pt-3 space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={myRsvp === 'going'}
            onChange={handleGoing}
            className="w-5 h-5 rounded-sm accent-emerald-500 cursor-pointer"
          />
          <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">{t('home.rsvpGoing')}</span>
        </label>
        <input
          type="text"
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          onBlur={handleNoteBlur}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveNote(); (e.target as HTMLInputElement).blur(); } }}
          placeholder={t('home.rsvpNotePlaceholder')}
          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-800 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-400"
        />
        {hasPendingChanges && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveNote}
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 px-1"
            >
              {t('home.saveNote')}
            </button>
          </div>
        )}
      </div>

      {isScheduled && (
        <div className="px-4 py-3 border-t border-violet-100 dark:border-violet-900 flex justify-end">
          <a
            href={`${Capacitor.isNativePlatform() ? 'https://drop-by.fly.dev' : ''}/api/status/${status.id}/calendar.ics`}
            download
            className="flex items-center gap-1.5 text-xs text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
            {t('home.addToCalendar')}
          </a>
        </div>
      )}
    </div>
  );
}
