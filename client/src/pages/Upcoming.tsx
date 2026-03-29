import { useState, useEffect, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { statusApi, notesApi, goingApi, friendsApi } from '../api';
import { shouldShowNotifPrompt, requestNotificationPermission } from '../utils/notifications';
import { useAuthStore } from '../stores/auth';
import {
  bigEmojiClass, formatTime, formatTimeShort,
  todayStr, defaultStartTime, addHours, toUnix,
  getScheduleGroup, groupScheduledDoors, REMINDER_OPTIONS,
} from '../utils/schedule';
import Avatar from '../components/Avatar';
import FriendStatusCard from '../components/FriendStatusCard';
import Modal from '../components/Modal';
import { useToast } from '../contexts/toast';
import { getSuggestions } from '../i18n/suggestions';

// --- ScheduledSessionCard ---

function ScheduledSessionCard({ session, friends = [], me, onCancel, onSave }: {
  session: any;
  friends?: any[];
  me?: { display_name: string; avatar_url?: string | null } | null;
  onCancel: () => void;
  onSave?: (data: { note?: string; starts_at?: number; ends_at?: number; recipient_ids?: string[] }) => void;
}) {
  const { t } = useTranslation();
  const bigNote = session.note ? bigEmojiClass(session.note) : null;
  const icsKey = `dropby_ics_${session.id}`;
  const [editing, setEditing] = useState(false);
  const sessionDate = format(new Date(session.starts_at * 1000), 'yyyy-MM-dd');
  const [editDate, setEditDate] = useState(sessionDate);
  const [editStart, setEditStart] = useState(format(new Date(session.starts_at * 1000), 'HH:mm'));
  const [hasEditEnd, setHasEditEnd] = useState(!!session.ends_at);
  const [editEnd, setEditEnd] = useState(session.ends_at ? format(new Date(session.ends_at * 1000), 'HH:mm') : addHours(sessionDate, format(new Date(session.starts_at * 1000), 'HH:mm'), 2));
  const [editNote, setEditNote] = useState(session.note || '');
  const [editRecipients, setEditRecipients] = useState<string[]>((session.recipients || []).map((r: any) => r.id));

  const activeFriends = friends.filter((f: any) => !f.muted);
  const [friendsAtBottom, setFriendsAtBottom] = useState(false);

  if (editing) {
    return (
      <div className="bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 space-y-3">
        <div className="flex border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
          <div className="flex-[2] px-3 py-2 border-r border-violet-200 dark:border-violet-800">
            <label className="text-xs text-violet-400 dark:text-violet-500 block mb-0.5">Date</label>
            <input type="date" value={editDate} min={format(new Date(), 'yyyy-MM-dd')} onChange={e => setEditDate(e.target.value)}
              className="w-full text-base bg-transparent outline-none dark:text-gray-50" />
          </div>
          <div className={`flex-1 px-3 py-2 ${hasEditEnd ? 'border-r border-violet-200 dark:border-violet-800' : ''}`}>
            <label className="text-xs text-violet-400 dark:text-violet-500 block mb-0.5">{t('home.scheduleStartTime')}</label>
            <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
              className="w-full text-base bg-transparent outline-none dark:text-gray-50" />
          </div>
          {hasEditEnd && (
            <div className="flex-1 px-3 py-2 relative">
              <label className="text-xs text-violet-400 dark:text-violet-500 block mb-0.5">{t('home.scheduleEndTime')}</label>
              <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                className="w-full text-base bg-transparent outline-none dark:text-gray-50 pr-5" />
              <button onClick={() => setHasEditEnd(false)} className="absolute top-2 right-2 text-violet-300 dark:text-violet-700 hover:text-violet-500 text-xs leading-none">✕</button>
            </div>
          )}
        </div>
        {!hasEditEnd && (
          <button onClick={() => setHasEditEnd(true)} className="text-xs text-violet-500 dark:text-violet-400 self-start">
            + end time
          </button>
        )}
        <div className="relative">
          <input
            type="text"
            placeholder={t('home.notePlaceholder')}
            value={editNote}
            maxLength={160}
            onChange={e => setEditNote(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-800 rounded-xl text-base dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {editNote.length >= 130 && (
            <span className={`absolute right-3 bottom-2.5 text-xs pointer-events-none ${editNote.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
              {160 - editNote.length}
            </span>
          )}
        </div>
        {friends.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-violet-500 dark:text-violet-400 font-medium">{t('home.openDoorTo')}</p>
              {activeFriends.length >= 5 && (
                <span className="text-xs text-violet-400 dark:text-violet-500">
                  {activeFriends.filter((f: any) => editRecipients.includes(f.id)).length} / {activeFriends.length}
                </span>
              )}
            </div>
            <div className="relative -mx-4">
              <div
                className={`divide-y divide-violet-100 dark:divide-violet-900${activeFriends.length >= 5 ? ' h-[176px] overflow-y-auto' : ''}`}
                onScroll={e => { const el = e.currentTarget; setFriendsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1); }}
              >
                {activeFriends.map((f: any) => (
                  <label key={f.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900 px-4">
                    <input type="checkbox" checked={editRecipients.includes(f.id)}
                      onChange={e => setEditRecipients(prev => e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id))}
                      className="w-4 h-4 accent-violet-600 flex-shrink-0" />
                    <Avatar name={f.display_name} size="sm" />
                    <span className="text-sm font-medium text-violet-900 dark:text-violet-100">{f.display_name}</span>
                  </label>
                ))}
              </div>
              {activeFriends.length >= 5 && !friendsAtBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-violet-50 dark:from-violet-950 to-transparent pointer-events-none" />
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              onSave?.({
                note: editNote || undefined,
                starts_at: toUnix(editDate, editStart),
                ends_at: hasEditEnd ? toUnix(editDate, editEnd) : undefined,
                recipient_ids: editRecipients,
              });
              setEditing(false);
            }}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-xl text-sm font-semibold"
          >
            {t('home.saveChanges')}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 font-medium"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-2xl p-4">
      {me && (
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={me.display_name} url={me.avatar_url} size="md" />
          <p className="font-semibold text-violet-900 dark:text-violet-100">{me.display_name}</p>
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <svg className="w-3.5 h-3.5 text-violet-400 dark:text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-violet-700 dark:text-violet-300 font-medium">
          {formatTime(session.starts_at)}{session.ends_at ? ` – ${formatTimeShort(session.ends_at)}` : ''}
        </p>
      </div>
      {session.note && (
        <p className={bigNote ? `${bigNote} leading-none mb-2` : 'text-sm text-violet-600 dark:text-violet-400 mb-2'}>
          {session.note}
        </p>
      )}
      {session.recipients?.length > 0 && (
        <p className="text-xs text-violet-500 dark:text-violet-400 mb-2 truncate">
          {session.recipients.map((r: any) => r.display_name).join(', ')}…
        </p>
      )}
      {session.going_signals?.length > 0 && (
        <p className="text-xs text-violet-500 dark:text-violet-400 mb-2">
          {session.going_signals.map((g: any) => g.name).join(', ')} {session.going_signals.length === 1 ? 'is' : 'are'} coming
        </p>
      )}
      <div className="mt-3 pt-3 border-t border-violet-100 dark:border-violet-900 flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-sm text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900 rounded-lg font-medium transition-colors"
          >
            {t('home.edit')}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-violet-500 dark:text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900 rounded-lg transition-colors"
          >
            {t('home.scheduleCancelSession')}
          </button>
        </div>
        <a
          href={`${Capacitor.isNativePlatform() ? 'https://drop-by.fly.dev' : ''}/api/status/${session.id}/calendar.ics`}
          download
          onClick={() => localStorage.setItem(icsKey, '1')}
          className="flex items-center gap-1 text-xs text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
          </svg>
          {t('home.addToCalendar')}
        </a>
      </div>
    </div>
  );
}

// --- UpcomingScheduleForm (always in schedule mode) ---

function UpcomingScheduleForm({ friends, isPending, onSubmit, onCancel }: {
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

// --- Upcoming page ---

export default function Upcoming() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [notifSheet, setNotifSheet] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const setToast = useToast();

  const { data: upcomingSessions = [] } = useQuery({
    queryKey: ['upcomingSessions'],
    queryFn: statusApi.getUpcoming,
    refetchInterval: 30000,
  });

  const { data: friendStatuses = [] } = useQuery({
    queryKey: ['friendStatuses'],
    queryFn: statusApi.getFriends,
    refetchInterval: 30000,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: friendsApi.list,
  });

  const nowTs = Math.floor(Date.now() / 1000);
  const scheduledFriendGroups = groupScheduledDoors(
    (friendStatuses as any[]).filter((s: any) => s.starts_at && s.starts_at > nowTs)
  );

  const createStatus = useMutation({
    mutationFn: (data: Parameters<typeof statusApi.create>[0]) => statusApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upcomingSessions'] });
      setShowForm(false);
    },
  });

  const cancelScheduled = useMutation({
    mutationFn: (id: string) => statusApi.cancelScheduledById(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['upcomingSessions'] });
      setToast({ message: t('home.removeFromCalendar'), linkText: t('home.downloadIcs'), linkHref: `/api/status/${id}/calendar.ics?cancel=1`, download: true });
    },
  });

  const updateScheduled = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof statusApi.updateById>[1] }) =>
      statusApi.updateById(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['upcomingSessions'] });
      if (localStorage.getItem(`dropby_ics_${id}`)) {
        setToast({ message: t('home.updateCalendar'), linkText: t('home.downloadIcs'), linkHref: `/api/status/${id}/calendar.ics`, download: true });
      }
    },
  });

  const sendGoing = async (statusId: string, rsvp: 'going' | null = 'going') => {
    if (rsvp !== null && await shouldShowNotifPrompt()) {
      pendingAction.current = () => sendGoing(statusId, rsvp);
      setNotifSheet(true);
      return;
    }
    if (rsvp === null) {
      await goingApi.remove(statusId);
    } else {
      await goingApi.send(statusId);
    }
    qc.invalidateQueries({ queryKey: ['friendStatuses'] });
  };

  const updateGoingNote = async (statusId: string, note: string) => {
    await goingApi.updateNote(statusId, note);
    qc.invalidateQueries({ queryKey: ['friendStatuses'] });
  };

  const handleNotifOk = () => {
    setNotifSheet(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    requestNotificationPermission();
    if (action) action();
  };

  const handleNotifSkip = () => {
    setNotifSheet(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) action();
  };

  const handleScheduleSubmit = async (data: { note?: string; recipient_ids: string[]; starts_at: number; ends_at?: number; reminder_minutes: number }) => {
    if (data.note) {
      await notesApi.save(data.note);
      qc.invalidateQueries({ queryKey: ['notes'] });
    }
    createStatus.mutate(data);
  };

  const groupLabel = (key: string) => key === 'tomorrow' ? t('home.scheduledGroupTomorrow')
    : key === 'this_week' ? t('home.scheduledGroupThisWeek')
    : key === 'next_week' ? t('home.scheduledGroupNextWeek')
    : key === 'soon' ? t('home.scheduledGroupSoon')
    : t('home.scheduledGroupLater');

  const keyOrder = ['tomorrow', 'this_week', 'next_week', 'soon', 'later'];
  const ownByKey = new Map<string, any[]>();
  for (const s of upcomingSessions as any[]) {
    const k = getScheduleGroup(s.starts_at);
    if (!ownByKey.has(k)) ownByKey.set(k, []);
    ownByKey.get(k)!.push(s);
  }
  const friendByKey = new Map(scheduledFriendGroups.map(g => [g.key, g.doors]));
  const allKeys = keyOrder.filter(k => ownByKey.has(k) || friendByKey.has(k));
  const hasAnything = allKeys.length > 0;

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 px-4 pb-24 safe-top">
      {/* Plan something CTA */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-2xl font-semibold text-sm transition-colors mb-6"
        >
          {t('upcoming.planSomething')}
        </button>
      ) : (
        <div className="mb-6">
          <UpcomingScheduleForm
            friends={friends as any[]}
            isPending={createStatus.isPending}
            onSubmit={handleScheduleSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Grouped sessions */}
      {hasAnything ? (
        <div>
          {allKeys.map(key => (
            <div key={key} className="mb-6">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{groupLabel(key)}</h2>
              <div className="space-y-3">
                {(ownByKey.get(key) ?? []).map((session: any) => (
                  <ScheduledSessionCard
                    key={session.id}
                    session={session}
                    friends={friends as any[]}
                    me={user}
                    onCancel={() => cancelScheduled.mutate(session.id)}
                    onSave={data => updateScheduled.mutate({ id: session.id, data })}
                  />
                ))}
                {(friendByKey.get(key) ?? []).map((s: any) => (
                  <FriendStatusCard key={s.id} status={s} onGoing={sendGoing} onNoteUpdate={updateGoingNote} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <div className="text-center py-12">
          <p className="text-base font-medium text-gray-500 dark:text-gray-400">{t('upcoming.emptyTitle')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('upcoming.emptyDesc')}</p>
        </div>
      ) : null}

      <Modal open={notifSheet} onClose={handleNotifSkip}>
        <p className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-2">
          {t('home.notifGoingTitle')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('home.notifDesc')}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNotifOk}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-semibold text-sm transition-colors"
          >
            {t('home.notifAllow')}
          </button>
          <button
            onClick={handleNotifSkip}
            className="w-full text-gray-500 dark:text-gray-400 py-2 text-sm"
          >
            {t('home.notifSkip')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
