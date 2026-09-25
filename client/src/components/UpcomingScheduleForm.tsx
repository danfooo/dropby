import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notesApi } from '../api';
import { todayStr, defaultStartTime, addHours, toUnix, REMINDER_OPTIONS } from '../utils/schedule';
import FriendPicker, { useActiveFriends, selectedRecipientIds, type RecipientOverrides } from './FriendPicker';
import { getSuggestions } from '../i18n/suggestions';
import { invalidate, useSavedNotes } from '../queries';

export const SCHEDULE_DRAFT_KEY = 'dropby_schedule_draft';

export function clearScheduleDraft() {
  try { sessionStorage.removeItem(SCHEDULE_DRAFT_KEY); } catch {}
}

export function UpcomingScheduleForm({ friends, isPending, onSubmit, onCancel }: {
  friends: any[];
  isPending?: boolean;
  onSubmit: (data: { note?: string; location?: string; recipient_ids: string[]; starts_at: number; ends_at?: number; reminder_minutes: number }) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const draft = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(SCHEDULE_DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Record<string, any>) : {};
    } catch { return {}; }
  }, []);
  const hasDraft = Object.keys(draft).length > 0;

  const [note, setNote] = useState<string>(draft.note ?? '');
  const [location, setLocation] = useState<string>(draft.location ?? '');
  const [selectedChip, setSelectedChip] = useState<string>(draft.selectedChip ?? '');
  const [previousNote, setPreviousNote] = useState<string | null>(null);
  // Same defaults as the Now view: each friend's server `selected` flag, plus local toggles
  const [recipientOverrides, setRecipientOverrides] = useState<RecipientOverrides>(
    () => (draft.recipientOverrides && typeof draft.recipientOverrides === 'object') ? draft.recipientOverrides : {}
  );
  const [date, setDate] = useState<string>(() => draft.date ?? todayStr());
  const [start, setStart] = useState<string>(() => draft.start ?? defaultStartTime());
  const [end, setEnd] = useState<string>(() => draft.end ?? addHours(todayStr(), defaultStartTime(), 2));
  const [reminder, setReminder] = useState<number>(draft.reminder ?? 30);
  const [showReminder, setShowReminder] = useState(false);
  const [hasEndTime, setHasEndTime] = useState<boolean>(draft.hasEndTime ?? false);
  const [hasEditedDateTime, setHasEditedDateTime] = useState<boolean>(draft.hasEditedDateTime ?? false);

  const { data: savedNotes = [] } = useSavedNotes();
  const hideNote = useMutation({
    mutationFn: (id: string) => notesApi.setHidden(id, true),
    onSuccess: () => invalidate(qc, 'notes'),
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

  // Skip end-time recalculation on first render when restoring a saved draft
  const skipEndEffect = useRef(hasDraft);
  useEffect(() => {
    if (skipEndEffect.current) { skipEndEffect.current = false; return; }
    setEnd(addHours(date, start, 2));
  }, [date, start]);

  // Persist draft to sessionStorage so tab switches don't discard in-progress state
  useEffect(() => {
    try {
      sessionStorage.setItem(SCHEDULE_DRAFT_KEY, JSON.stringify({
        note, location, selectedChip, date, start, end, hasEndTime, reminder, recipientOverrides, hasEditedDateTime,
      }));
    } catch {}
  }, [note, location, selectedChip, date, start, end, hasEndTime, reminder, recipientOverrides, hasEditedDateTime]);

  const activeFriends = useActiveFriends(friends);
  const recipients = selectedRecipientIds(activeFriends, recipientOverrides);
  const trimmedNote = note.trim() || undefined;
  const trimmedLocation = location.trim() || undefined;

  const startsMs = new Date(`${date}T${start}`).getTime();
  const isPast = startsMs < Date.now();
  const isSoon = !isPast && startsMs < Date.now() + 15 * 60 * 1000;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
      {/* Note chips */}
      {(visibleSaved.length > 0 || chips.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {visibleSaved.map((n: any) => (
            <div
              key={n.id}
              className={`shrink-0 flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium border transition-colors ${
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
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
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
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-400"
        />
        {note.length >= 130 && (
          <span className={`absolute right-3 bottom-2.5 text-xs pointer-events-none ${note.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
            {160 - note.length}
          </span>
        )}
      </div>

      {/* Location input */}
      <input
        type="text"
        placeholder={t('home.locationPlaceholder')}
        value={location}
        maxLength={200}
        onChange={e => setLocation(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-400"
      />

      {/* Date / time pickers */}
      <div className="flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800">
        <div className="flex-2 px-3 py-2 border-r border-gray-200 dark:border-gray-700">
          <label className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">Date</label>
          <input type="date" value={date} min={todayStr()} onChange={e => { setDate(e.target.value); setHasEditedDateTime(true); }}
            className="w-full text-base bg-transparent outline-hidden dark:text-gray-50" />
        </div>
        <div className={`flex-1 px-3 py-2 ${hasEndTime ? 'border-r border-gray-200 dark:border-gray-700' : ''}`}>
          <label className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">{t('home.scheduleStartTime')}</label>
          <input type="time" value={start} onChange={e => { setStart(e.target.value); setHasEditedDateTime(true); }}
            className="w-full text-base bg-transparent outline-hidden dark:text-gray-50" />
        </div>
        {hasEndTime && (
          <div className="flex-1 px-3 py-2 relative">
            <label className="text-xs text-gray-400 dark:text-gray-500 block mb-0.5">{t('home.scheduleEndTime')}</label>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
              className="w-full text-base bg-transparent outline-hidden dark:text-gray-50 pr-5" />
            <button onClick={() => setHasEndTime(false)} className="absolute top-2 right-2 text-gray-300 dark:text-gray-600 hover:text-gray-500 text-xs leading-none">✕</button>
          </div>
        )}
      </div>
      {isPast && (
        <p className="text-xs text-red-500 dark:text-red-400">{t('home.scheduleWarnPast')}</p>
      )}
      {!isPast && hasEditedDateTime && isSoon && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('home.scheduleWarnSoon')}</p>
      )}
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
      <FriendPicker activeFriends={activeFriends} overrides={recipientOverrides} onChange={setRecipientOverrides} />

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ note: trimmedNote, location: trimmedLocation, recipient_ids: recipients, starts_at: toUnix(date, start), ends_at: hasEndTime ? toUnix(date, end) : undefined, reminder_minutes: reminder })}
          disabled={isPending || isPast}
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
