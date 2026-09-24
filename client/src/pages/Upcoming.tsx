import { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { statusApi, notesApi, goingApi, baseURL } from '../api';
import { shouldShowNotifPrompt, requestNotificationPermission } from '../utils/notifications';
import DeniedNotifModal from '../components/DeniedNotifModal';
import { useDeniedNotifModal } from '../hooks/useDeniedNotifModal';
import { useAuthStore } from '../stores/auth';
import { getScheduleGroup, groupScheduledDoors } from '../utils/schedule';
import ScheduledSessionCard from '../components/ScheduledSessionCard';
import FriendStatusCard from '../components/FriendStatusCard';
import Modal from '../components/Modal';
import { UpcomingScheduleForm, clearScheduleDraft, SCHEDULE_DRAFT_KEY } from '../components/UpcomingScheduleForm';
import { useToast } from '../contexts/toast';
import { invalidate, useFriendStatuses, useFriends, useUpcomingSessions } from '../queries';

export default function Upcoming() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(() => {
    if (searchParams.get('plan') === '1') return true;
    try { return !!sessionStorage.getItem(SCHEDULE_DRAFT_KEY); } catch { return false; }
  });
  const [notifSheet, setNotifSheet] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const deniedNotif = useDeniedNotifModal();
  const setToast = useToast();

  const { data: upcomingSessions = [] } = useUpcomingSessions({ refetchInterval: 30000 });

  const { data: friendStatuses = [] } = useFriendStatuses({ refetchInterval: 30000 });

  const { data: friends = [] } = useFriends();

  const nowTs = Math.floor(Date.now() / 1000);
  const scheduledFriendGroups = groupScheduledDoors(
    (friendStatuses as any[]).filter((s: any) => s.starts_at && s.starts_at > nowTs)
  );

  const createStatus = useMutation({
    mutationFn: (data: Parameters<typeof statusApi.create>[0]) => statusApi.create(data),
    onSuccess: () => {
      clearScheduleDraft();
      invalidate(qc, 'upcomingSessions');
      setShowForm(false);
    },
  });

  const cancelScheduled = useMutation({
    mutationFn: (id: string) => statusApi.cancelScheduledById(id),
    onSuccess: (_data, id) => {
      invalidate(qc, 'upcomingSessions');
      setToast({ message: t('home.removeFromCalendar'), linkText: t('home.downloadIcs'), linkHref: `${baseURL}/status/${id}/calendar.ics?cancel=1`, download: true });
    },
  });

  const updateScheduled = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof statusApi.updateById>[1] }) =>
      statusApi.updateById(id, data),
    onSuccess: (_data, { id }) => {
      invalidate(qc, 'upcomingSessions');
      if (localStorage.getItem(`dropby_ics_${id}`)) {
        setToast({ message: t('home.updateCalendar'), linkText: t('home.downloadIcs'), linkHref: `${baseURL}/status/${id}/calendar.ics`, download: true });
      }
    },
  });

  const sendGoing = async (statusId: string, rsvp: 'going' | null = 'going', note?: string) => {
    if (rsvp !== null && await shouldShowNotifPrompt()) {
      pendingAction.current = () => sendGoing(statusId, rsvp, note);
      setNotifSheet(true);
      return;
    }
    if (rsvp === null) {
      await goingApi.remove(statusId);
    } else {
      await goingApi.send(statusId, note);
    }
    invalidate(qc, 'friendStatuses');
    if (rsvp !== null) deniedNotif.check();
  };

  const updateGoingNote = async (statusId: string, note: string) => {
    await goingApi.updateNote(statusId, note);
    invalidate(qc, 'friendStatuses');
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

  const handleScheduleSubmit = async (data: { note?: string; location?: string; recipient_ids: string[]; starts_at: number; ends_at?: number; reminder_minutes: number }) => {
    if (data.note) {
      await notesApi.save(data.note);
      invalidate(qc, 'notes');
    }
    createStatus.mutate(data);
  };

  const groupLabel = (key: string) => key === 'today' ? t('home.scheduledGroupToday')
    : key === 'tomorrow' ? t('home.scheduledGroupTomorrow')
    : key === 'this_week' ? t('home.scheduledGroupThisWeek')
    : key === 'next_week' ? t('home.scheduledGroupNextWeek')
    : key === 'soon' ? t('home.scheduledGroupSoon')
    : t('home.scheduledGroupLater');

  const keyOrder = ['today', 'tomorrow', 'this_week', 'next_week', 'soon', 'later'];
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
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 px-4 safe-top">
      <PageHeader />
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
            onCancel={() => { clearScheduleDraft(); setShowForm(false); }}
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

      <DeniedNotifModal open={deniedNotif.open} onDismiss={deniedNotif.dismiss} onSnooze={deniedNotif.snooze} onOpenSettings={deniedNotif.goToSettings} />
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
