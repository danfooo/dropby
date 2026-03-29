import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notesApi } from '../api';
import { todayStr, defaultStartTime, addHours, toUnix, REMINDER_OPTIONS } from '../utils/schedule';
import Avatar from './Avatar';
import { getSuggestions } from '../i18n/suggestions';

export function UpcomingScheduleForm({ friends, isPending, onSubmit, onCancel }: {
  friends: any[];
  isPending?: boolean;
  onSubmit: (data: { note?: string; recipient_ids: string[]; starts_at: number; ends_at?: number; reminder_minutes: number }) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [selectedChip, setSelectedChip] = useState('');
  const [previousNote, setPreviousNote] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<string[]>(friends.filter((f: any) => !f.muted).map((f: any) => f.id));
  const [date, setDate] = useState(todayStr);
  const [start, setStart] = useState(defaultStartTime);
  const [end, setEnd] = useState(() => addHours(todayStr(), defaultStartTime(), 2));
  const [reminder, setReminder] = useState(30);
  const [showReminder, setShowReminder] = useState(false);
  const [hasEndTime, setHasEndTime] = useState(false);
  const [friendsAtBottom, setFriendsAtBottom] = useState(false);

  const { data: savedNotes = [] } = useQuery({ queryKey: ['notes'], queryFn: notesApi.list });
  const hideNote = useMutation({
    mutationFn: (id: string) => notesApi.setHidden(id, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
  const suggestions = useMemo(() => getSuggestions(i18n.language), [i18n.language]);
  const visibleSaved = (savedNotes as any[]).filter((n: any) => !n.hidden).slice(0, 2);
  const chips = suggestions.slice(0, 7);

  const pickChip = (text: string) => {
    if (selectedChip === text) {
      setNote(previousNote ?? '');
      setSelectedChip('');
      setPreviousNote(null);
    } else {
      setPreviousNote(selectedChip === '' ? note : null);
      setNote(text);
      setSelectedChip(text);
    }
  };

  useEffect(() => {
    setEnd(addHours(date, start, 2));
  }, [date, start]);

  const activeFriends = friends.filter((f: any) => !f.muted);
  const trimmedNote = note.trim() || undefined;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
      {/* Note chips */}
      {(visibleSaved.length > 0 || chips.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {visibleSaved.map((n: any) => (
            <div
              key={n.id}
              className={`flex-shrink-0 flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedChip === n.text
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}
            >
              <button onClick={() => pickChip(n.text)}>{n.text}</button>
              <button
                onClick={() => hideNote.mutate(n.id)}
                className={`ml-1 rounded-full p-0.5 transition-colors ${selectedChip === n.text ? 'hover:bg-emerald-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                aria-label="Remove"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {chips.map((chip: string) => (
            <button
              key={chip}
              onClick={() => pickChip(chip)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                selectedChip === chip
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-300'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Note input */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('home.customNotePlaceholder')}
          value={note}
          maxLength={160}
          onChange={e => {
            setNote(e.target.value);
            if (selectedChip && e.target.value !== selectedChip) {
              setSelectedChip('');
              setPreviousNote(null);
            }
          }}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        {note.length >= 130 && (
          <span className={`absolute right-3 bottom-2.5 text-xs pointer-events-none ${note.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
            {160 - note.length}
          </span>
        )}
      </div>

      {/* Date / time pickers */}
      <div className="flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800">
        <div className="flex-[2] px-3 py-2 border-r border-gray-200 dark:border-gray-700">
          <label className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">Date</label>
          <input type="date" value={date} min={todayStr()} onChange={e => setDate(e.target.value)}
            className="w-full text-base bg-transparent outline-none dark:text-gray-50" />
        </div>
        <div className={`flex-1 px-3 py-2 ${hasEndTime ? 'border-r border-gray-200 dark:border-gray-700' : ''}`}>
          <label className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">{t('home.scheduleStartTime')}</label>
          <input type="time" value={start} onChange={e => setStart(e.target.value)}
            className="w-full text-base bg-transparent outline-none dark:text-gray-50" />
        </div>
        {hasEndTime && (
          <div className="flex-1 px-3 py-2 relative">
            <label className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">{t('home.scheduleEndTime')}</label>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
              className="w-full text-base bg-transparent outline-none dark:text-gray-50 pr-5" />
            <button onClick={() => setHasEndTime(false)} className="absolute top-2 right-2 text-gray-300 dark:text-gray-600 hover:text-gray-500 text-xs leading-none">✕</button>
          </div>
        )}
      </div>
      {!hasEndTime && (
        <button onClick={() => setHasEndTime(true)} className="text-xs text-violet-500 dark:text-violet-400 self-start">
          + end time
        </button>
      )}
      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-400 dark:text-gray-500 flex-1">{t('home.scheduleReminderText', { minutes: reminder })}</p>
        <button onClick={() => setShowReminder(v => !v)} className="text-xs text-violet-600 font-medium">
          {t('home.scheduleReminderChange')}
        </button>
      </div>
      {showReminder && (
        <div className="flex gap-2 flex-wrap">
          {REMINDER_OPTIONS.map(m => (
            <button key={m} onClick={() => { setReminder(m); setShowReminder(false); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                reminder === m ? 'bg-violet-500 text-white border-violet-500' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}>
              {m === 60 ? '1h' : `${m} min`}
            </button>
          ))}
        </div>
      )}

      {/* Recipient selection */}
      {friends.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('home.openDoorTo')}</p>
            {activeFriends.length >= 5 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {activeFriends.filter((f: any) => recipients.includes(f.id)).length} / {activeFriends.length}
              </span>
            )}
          </div>
          <div className="relative -mx-4">
            <div
              className={`divide-y divide-gray-50 dark:divide-gray-800${activeFriends.length >= 5 ? ' h-[176px] overflow-y-auto' : ''}`}
              onScroll={e => { const el = e.currentTarget; setFriendsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1); }}
            >
              {activeFriends.map((f: any) => (
                <label key={f.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 px-4">
                  <input type="checkbox" checked={recipients.includes(f.id)}
                    onChange={e => setRecipients(prev => e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id))}
                    className="w-4 h-4 accent-emerald-500 flex-shrink-0" />
                  <Avatar name={f.display_name} size="sm" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{f.display_name}</span>
                </label>
              ))}
            </div>
            {activeFriends.length >= 5 && !friendsAtBottom && (
              <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none" />
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ note: trimmedNote, recipient_ids: recipients, starts_at: toUnix(date, start), ends_at: hasEndTime ? toUnix(date, end) : undefined, reminder_minutes: reminder })}
          disabled={isPending}
          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-2xl font-semibold text-sm disabled:opacity-50 transition-colors"
        >
          {t('home.scheduleToggle')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-2xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
