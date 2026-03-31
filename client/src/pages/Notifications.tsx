import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi, nudgesApi } from '../api';
import { requestNotificationPermission } from '../utils/notifications';
import { useAuthStore } from '../stores/auth';
import Modal from '../components/Modal';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof DAY_KEYS[number];

function suggestNextNudge(existing: Array<{ day_of_week: string; hour: number }>): { day: string; hour: number } {
  if (!existing.length) return { day: 'sat', hour: 11 };
  const last = existing[existing.length - 1];
  if (last.day_of_week === 'sat' && last.hour < 15) return { day: 'sat', hour: 15 };
  if (last.day_of_week === 'sat') return { day: 'sun', hour: 19 };
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const nextDay = days[(days.indexOf(last.day_of_week) + 1) % 7];
  return { day: nextDay, hour: 19 };
}

function AddNudgeModal({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: any[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const suggestion = suggestNextNudge(existing);
  const [day, setDay] = useState(suggestion.day);
  const [time, setTime] = useState(`${String(suggestion.hour).padStart(2, '0')}:00`);
  const hour = parseInt(time.split(':')[0], 10);

  const addNudge = useMutation({
    mutationFn: ({ d, h }: { d: string; h: number }) => nudgesApi.add(d, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nudges'] }); onClose(); },
  });

  return (
    <Modal open={open} onClose={onClose} title={t('profile.addReminderTitle')}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('profile.day')}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {DAY_KEYS.map(d => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  day === d ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t(`profile.daysShort.${d}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t('profile.time', { time: '' }).trim()}</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value || time)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50"
          />
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950 rounded-xl p-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{t('profile.suggested')}</p>
          <p className="text-sm text-emerald-900 dark:text-emerald-200">
            {t(`profile.days.${suggestion.day}`)} {String(suggestion.hour).padStart(2, '0')}:00
          </p>
          <button
            onClick={() => addNudge.mutate({ d: suggestion.day, h: suggestion.hour })}
            className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 underline"
          >
            {t('profile.useSuggestion')}
          </button>
        </div>
        <button
          onClick={() => addNudge.mutate({ d: day, h: hour })}
          disabled={addNudge.isPending}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {t('profile.addReminderButton')}
        </button>
      </div>
    </Modal>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuthStore();
  const qc = useQueryClient();
  const [showAddNudge, setShowAddNudge] = useState(false);

  const use24h = ['de', 'es', 'fr'].includes((i18n.language ?? '').split('-')[0]);
  const formatHour = (h: number) => {
    if (use24h) return `${h}:00`;
    const ampm = h < 12 ? 'am' : 'pm';
    const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${disp}${ampm}`;
  };

  const { data: nudges = [] } = useQuery({ queryKey: ['nudges'], queryFn: nudgesApi.list });

  const updateMe = useMutation({
    mutationFn: (data: { auto_nudge_enabled?: boolean; notif_door_closed?: boolean; going_reminder_1?: string; going_reminder_2?: string }) => authApi.updateMe(data),
    onSuccess: updated => setUser(updated),
  });

  const REMINDER_OPTIONS = ['none', 'day', '120m', '60m', '30m', '15m'] as const;

  const removeNudge = useMutation({
    mutationFn: (id: string) => nudgesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nudges'] }),
  });

  const addNudgeInline = useMutation({
    mutationFn: ({ d, h }: { d: string; h: number }) => nudgesApi.add(d, h),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nudges'] }),
  });

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pt-10 pb-4 safe-top">
        <div className="flex items-center">
          <Link to="/profile" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold flex-1 text-center">{t('notifications.title')}</h1>
          <div className="w-5" />
        </div>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Scheduled reminders */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900 dark:text-gray-50">{t('notifications.remindersTitle')}</h2>
            <button
              onClick={() => { requestNotificationPermission(); setShowAddNudge(true); }}
              className="text-sm text-emerald-600 dark:text-emerald-400 font-medium"
            >
              {t('notifications.addReminder')}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t('notifications.remindersDesc')}</p>

          {(nudges as any[]).length === 0 ? (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t(`profile.days.${suggestNextNudge([]).day}`)} {formatHour(suggestNextNudge([]).hour)}
              </span>
              <button
                onClick={() => { requestNotificationPermission(); addNudgeInline.mutate({ d: suggestNextNudge([]).day, h: suggestNextNudge([]).hour }); }}
                disabled={addNudgeInline.isPending}
                className="text-sm text-emerald-600 dark:text-emerald-400 font-medium px-3 py-1 bg-emerald-50 dark:bg-emerald-950 rounded-lg disabled:opacity-50"
              >
                {t('notifications.addReminder')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {(nudges as any[]).map((n: any) => (
                <div key={n.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-900 dark:text-gray-50">
                    {t(`profile.days.${n.day_of_week}`)} {formatHour(n.hour)}
                  </span>
                  <button data-testid="nudge-remove" onClick={() => removeNudge.mutate(n.id)} className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-nudge */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <p className="font-medium text-gray-900 dark:text-gray-50 text-sm flex-1 pr-4">{t('notifications.autoNudgeTitle')}</p>
            <Toggle
              on={!!user?.auto_nudge_enabled}
              onToggle={() => {
                requestNotificationPermission();
                updateMe.mutate({ auto_nudge_enabled: !user?.auto_nudge_enabled });
              }}
            />
          </div>
        </div>

        {/* Session reminders */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-50">{t('notifications.sessionRemindersTitle')}</h2>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700 dark:text-gray-300">{t('notifications.reminder1Label')}</label>
            <select
              value={user?.going_reminder_1 ?? 'day'}
              onChange={e => updateMe.mutate({ going_reminder_1: e.target.value })}
              className="text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none"
            >
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{t(`notifications.reminderOptions.${opt}`)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700 dark:text-gray-300">{t('notifications.reminder2Label')}</label>
            <select
              value={user?.going_reminder_2 ?? '30m'}
              onChange={e => updateMe.mutate({ going_reminder_2: e.target.value })}
              className="text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none"
            >
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{t(`notifications.reminderOptions.${opt}`)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Door closed confirmation */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-gray-50 text-sm">{t('notifications.doorClosedTitle')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('notifications.doorClosedDesc')}</p>
            </div>
            <Toggle
              on={user?.notif_door_closed !== false}
              onToggle={() => updateMe.mutate({ notif_door_closed: !user?.notif_door_closed })}
            />
          </div>
        </div>
      </div>

      <AddNudgeModal open={showAddNudge} onClose={() => setShowAddNudge(false)} existing={nudges as any[]} />
    </div>
  );
}
