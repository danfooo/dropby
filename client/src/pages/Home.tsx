import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInSeconds, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { statusApi, notesApi, invitesApi, goingApi, friendsApi } from '../api';
import { shouldShowNotifPrompt, requestNotificationPermission } from '../utils/notifications';
import { useAuthStore } from '../stores/auth';
import { bigEmojiClass, formatTimeShort } from '../utils/schedule';
import Avatar from '../components/Avatar';
import FriendStatusCard from '../components/FriendStatusCard';
import UserMenu from '../components/UserMenu';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { UpcomingScheduleForm } from '../components/UpcomingScheduleForm';
import FeedbackModal from '../components/FeedbackModal';
import { useToast } from '../contexts/toast';
import { getSuggestions } from '../i18n/suggestions';
import { copyText } from '../utils/clipboard';

type HomeView = 'closed' | 'open' | 'edit';

// Recipient row in door-open view
function RecipientRow({ recipient, onRemove }: { recipient: any; onRemove: () => void }) {
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
          onRemove();
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
      <Avatar name={recipient.display_name} size="sm" />
      <span className={`flex-1 text-sm ${removing ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-50'}`}>
        {recipient.display_name}
      </span>
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

function relativeTime(unixTs: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixTs;
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function InviteLinkRow({ token, createdAt, onRevoke }: { token: string; createdAt: number; onRevoke: () => void }) {
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

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return t('home.greetingMorning');
  if (hour >= 12 && hour < 18) return t('home.greetingAfternoon');
  return t('home.greetingEvening');
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [view, setView] = useState<HomeView>('closed');
  const [note, setNote] = useState('');
  const [selectedChip, setSelectedChip] = useState('');
  const [previousNote, setPreviousNote] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [editNote, setEditNote] = useState('');
  const [editRecipients, setEditRecipients] = useState<string[]>([]);
  const [editEndsAt, setEditEndsAt] = useState('');
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<number>(60);
  const [notifSheet, setNotifSheet] = useState<'open' | 'going' | null>(null);
  const setToast = useToast();
  const pendingAction = useRef<(() => void) | null>(null);

  const [friendsAtBottom, setFriendsAtBottom] = useState(false);
  const [showLaterForm, setShowLaterForm] = useState(false);

  const { data: myStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['myStatus'],
    queryFn: statusApi.get,
    refetchInterval: 30000,
  });

  const { data: friendStatuses = [] } = useQuery({
    queryKey: ['friendStatuses'],
    queryFn: statusApi.getFriends,
    refetchInterval: 30000,
  });

  const { data: lastSelection } = useQuery({
    queryKey: ['lastSelection'],
    queryFn: statusApi.getLastSelection,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: friendsApi.list,
  });

  const { data: savedNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: notesApi.list,
  });

  // Get locale-aware suggestions
  const suggestions = useMemo(() => getSuggestions(i18n.language), [i18n.language]);

  const visibleSaved = (savedNotes as any[]).filter((n: any) => !n.hidden).slice(0, 2);
  const chips = suggestions.slice(0, 7);

  // Initialize recipient selection from server
  useEffect(() => {
    if (!lastSelection || !friends.length) return;
    const unselected: string[] = lastSelection.unselected_ids ?? [];
    const mutedIds = (friends as any[]).filter((f: any) => f.muted).map((f: any) => f.id);
    setSelectedRecipients(
      (friends as any[])
        .map((f: any) => f.id)
        .filter((id: string) => !unselected.includes(id) && !mutedIds.includes(id))
    );
  }, [lastSelection, friends]);

  // Sync view with status
  useEffect(() => {
    if (!statusLoading) {
      setView(myStatus ? 'open' : 'closed');
    }
  }, [myStatus, statusLoading]);

  // Countdown timer
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!myStatus) return;
    const tick = () => setSecondsLeft(Math.max(0, differenceInSeconds(new Date(myStatus.closes_at * 1000), new Date())));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [myStatus?.closes_at]);

  const minutesLeft = Math.floor(secondsLeft / 60);

  const createStatus = useMutation({
    mutationFn: (data: Parameters<typeof statusApi.create>[0]) => statusApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myStatus'] });
      setView('open');
    },
  });

  const hideNote = useMutation({
    mutationFn: (id: string) => notesApi.setHidden(id, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  const createScheduled = useMutation({
    mutationFn: (data: Parameters<typeof statusApi.create>[0]) => statusApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upcomingSessions'] });
      setShowLaterForm(false);
    },
  });

  const handleScheduleSubmit = async (data: { note?: string; recipient_ids: string[]; starts_at: number; ends_at?: number; reminder_minutes: number }) => {
    if (data.note) {
      await notesApi.save(data.note);
      qc.invalidateQueries({ queryKey: ['notes'] });
    }
    createScheduled.mutate(data);
  };

  const closeStatus = useMutation({
    mutationFn: statusApi.close,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myStatus'] }); setView('closed'); },
  });

  const setDuration = useMutation({
    mutationFn: (minutes: number) => statusApi.setDuration(minutes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myStatus'] }),
  });

  const updateStatus = useMutation({
    mutationFn: (data: Parameters<typeof statusApi.update>[0]) => statusApi.update(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myStatus'] }); setView('open'); },
  });

  const removeRecipient = useMutation({
    mutationFn: (id: string) => statusApi.removeRecipient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myStatus'] }),
  });

  const revokeInvite = useMutation({
    mutationFn: (token: string) => invitesApi.revoke(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myStatus'] }),
  });

  const sendGoing = async (statusId: string, rsvp: 'going' | null = 'going') => {
    if (rsvp !== null && await shouldShowNotifPrompt()) {
      pendingAction.current = () => sendGoing(statusId, rsvp);
      setNotifSheet('going');
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

  const doOpen = async () => {
    const trimmedNote = note.trim() || undefined;
    if (trimmedNote && !selectedChip) {
      await notesApi.save(trimmedNote);
      qc.invalidateQueries({ queryKey: ['notes'] });
    }
    createStatus.mutate({ note: trimmedNote, recipient_ids: selectedRecipients });
  };

  const handleOpen = async () => {
    if (await shouldShowNotifPrompt()) {
      pendingAction.current = doOpen;
      setNotifSheet('open');
      return;
    }
    await doOpen();
  };

  const handleNotifOk = async () => {
    setNotifSheet(null);
    const action = pendingAction.current;
    pendingAction.current = null;
    requestNotificationPermission();
    if (action) action();
  };

  const handleNotifSkip = async () => {
    setNotifSheet(null);
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) action();
  };

  const handleSaveEdit = () => {
    let ends_at: number | undefined;
    if (editEndsAt && myStatus?.ends_at) {
      const dateStr = format(new Date(myStatus.ends_at * 1000), 'yyyy-MM-dd');
      ends_at = Math.floor(new Date(`${dateStr}T${editEndsAt}`).getTime() / 1000);
    }
    updateStatus.mutate({ note: editNote || undefined, recipient_ids: editRecipients, ends_at });
  };

  const copyInviteLink = async () => {
    try {
      const note = myStatus?.note;
      await copyText(
        invitesApi.generate(myStatus?.id).then(data =>
          note
            ? `${t('home.doorOpenCopyText')} — "${note}"\n${data.url}`
            : `${t('home.doorOpenCopyText')}\n${data.url}`
        )
      );
      alert(t('home.inviteLinkCopied'));
    } catch {
      alert(t('home.couldNotCopy'));
    }
  };

  const hasFriends = (friends as any[]).length > 0;
  const activeFriends = useMemo(() => {
    return (friends as any[])
      .filter((f: any) => !f.muted)
      .sort((a: any, b: any) => {
        const aChecked = selectedRecipients.includes(a.id);
        const bChecked = selectedRecipients.includes(b.id);
        if (aChecked !== bChecked) return aChecked ? -1 : 1;
        return (b.friendship_created_at ?? 0) - (a.friendship_created_at ?? 0);
      });
  }, [friends, selectedRecipients]);
  const nowTs = Math.floor(Date.now() / 1000);
  const openFriendDoors = (friendStatuses as any[]).filter((s: any) => !s.starts_at || s.starts_at <= nowTs);

  // --- DOOR CLOSED VIEW ---
  if (view === 'closed') {
    return (
      <div className="min-h-full bg-gray-50 dark:bg-gray-950 px-4 safe-top flex flex-col">
        <PageHeader />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">{getGreeting(t)}</h1>

        {/* Friend doors open now */}
        {openFriendDoors.length > 0 && (
          <div data-testid="friends-available" className="mb-6 -mx-4 px-4 py-5 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-100 dark:from-violet-950 dark:via-fuchsia-950 dark:to-amber-950 border-y border-fuchsia-200/60 dark:border-fuchsia-900/60">
            <h2 className="text-base font-bold text-fuchsia-900 dark:text-fuchsia-100 mb-3">
              {t('home.friendsAvailable')} ✨
            </h2>
            <div className="space-y-3">
              {openFriendDoors.map((s: any) => (
                <FriendStatusCard key={s.id} status={s} onGoing={sendGoing} onNoteUpdate={updateGoingNote} />
              ))}
            </div>
          </div>
        )}

        {/* Note chips: saved notes first (max 2), then suggestions */}
        {(visibleSaved.length > 0 || chips.length > 0) && (
          <div className="mb-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {visibleSaved.map((n: any) => (
                <div
                  key={n.id}
                  className={`flex-shrink-0 flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedChip === n.text
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <button
                    onClick={() => {
                      if (selectedChip === n.text) {
                        setNote(previousNote ?? '');
                        setSelectedChip('');
                        setPreviousNote(null);
                      } else {
                        setPreviousNote(selectedChip === '' ? note : null);
                        setNote(n.text);
                        setSelectedChip(n.text);
                      }
                    }}
                  >
                    {n.text}
                  </button>
                  <button
                    onClick={() => hideNote.mutate(n.id)}
                    className={`ml-1 rounded-full p-0.5 transition-colors ${
                      selectedChip === n.text ? 'hover:bg-emerald-400' : 'hover:bg-gray-100'
                    }`}
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
                  onClick={() => {
                    if (selectedChip === chip) {
                      setNote(previousNote ?? '');
                      setSelectedChip('');
                      setPreviousNote(null);
                    } else {
                      setPreviousNote(selectedChip === '' ? note : null);
                      setNote(chip);
                      setSelectedChip(chip);
                    }
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    selectedChip === chip
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-emerald-300'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note input */}
        <div className="mb-3 relative">
          <input
            type="text"
            placeholder={t('home.customNotePlaceholder')}
            maxLength={160}
            value={note}
            onChange={e => {
              setNote(e.target.value);
              if (selectedChip && e.target.value !== selectedChip) {
                setSelectedChip('');
                setPreviousNote(null);
              }
            }}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {note.length >= 130 && (
            <span className={`absolute right-3 bottom-3 text-xs pointer-events-none ${note.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
              {160 - note.length}
            </span>
          )}
        </div>

        {/* Recipient selection */}
        {hasFriends && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 mb-3 shadow-sm border border-gray-100 dark:border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t('home.openDoorTo')}</h2>
            <div className="relative">
              <div
                className={`divide-y divide-gray-50 dark:divide-gray-800 overflow-x-hidden${activeFriends.length >= 5 ? ' h-[192px] overflow-y-auto' : ''}`}
                onScroll={e => { const el = e.currentTarget; setFriendsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1); }}
              >
                {activeFriends.map((f: any) => (
                  <label key={f.id} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-3 px-3 transition-colors">
                    <input type="checkbox" checked={selectedRecipients.includes(f.id)}
                      onChange={e => setSelectedRecipients(prev => e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id))}
                      className="w-4 h-4 accent-emerald-500 flex-shrink-0" />
                    <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{f.display_name}</span>
                  </label>
                ))}
              </div>
              {activeFriends.length >= 5 && !friendsAtBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none rounded-b-xl" />
              )}
            </div>
          </div>
        )}

        {/* Open now / Open later */}
        {showLaterForm ? (
          <UpcomingScheduleForm
            friends={friends as any[]}
            isPending={createScheduled.isPending}
            onSubmit={handleScheduleSubmit}
            onCancel={() => setShowLaterForm(false)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleOpen}
              disabled={createStatus.isPending}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition-colors"
            >
              {createStatus.isPending ? t('home.opening') : t('home.openDoor')}
            </button>
            <button
              onClick={() => setShowLaterForm(true)}
              className="w-full text-violet-600 dark:text-violet-400 py-2 text-sm font-medium"
            >
              {t('home.openLater')}
            </button>
          </div>
        )}

        <div className="mt-auto pt-6 -mx-4">
          <TipsSection />
        </div>

        <Modal open={notifSheet !== null} onClose={handleNotifSkip}>
          <p className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-2">
            {notifSheet === 'going' ? t('home.notifGoingTitle') : t('home.notifOpenTitle')}
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

  // --- DOOR OPEN EDIT VIEW ---
  if (view === 'edit') {
    const initNote = myStatus?.note || '';
    const initRecipients = myStatus?.recipients.map((r: any) => r.id) || [];
    const initEndsAt = myStatus?.ends_at ? format(new Date(myStatus.ends_at * 1000), 'HH:mm') : '';

    return (
      <div className="min-h-full bg-gray-50 dark:bg-gray-950">
        {/* Sticky banner */}
        <button
          onClick={handleSaveEdit}
          className="w-full bg-emerald-500 text-white py-3 px-4 flex items-center gap-2 sticky top-0 z-10"
        >
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-sm font-medium">{t('home.yourDoorIsOpen')}</span>
        </button>

        <div className="px-4 pt-6">
          <h1 className="text-xl font-bold mb-4">{t('home.edit')}</h1>
          <div className="relative mb-4">
            <input
              type="text"
              placeholder={t('home.notePlaceholder')}
              maxLength={160}
              defaultValue={initNote}
              onChange={e => setEditNote(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {editNote.length >= 130 && (
              <span className={`absolute right-3 bottom-3.5 text-xs pointer-events-none ${editNote.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
                {160 - editNote.length}
              </span>
            )}
          </div>

          {initEndsAt && (
            <div className="mb-4">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{t('home.scheduleEndTime')}</label>
              <input
                type="time"
                defaultValue={initEndsAt}
                onChange={e => setEditEndsAt(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 mb-4">
            <h2 className="text-sm font-semibold mb-3">{t('home.recipients')}</h2>
            {(friends as any[]).filter((f: any) => !f.muted).map((f: any) => (
              <label key={f.id} className="flex items-center gap-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={initRecipients.includes(f.id)}
                  onChange={e => {
                    setEditRecipients(prev =>
                      e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                    );
                  }}
                  className="w-4 h-4 accent-emerald-500"
                />
                <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
                <span className="text-sm">{f.display_name}</span>
              </label>
            ))}
            {(friends as any[]).some((f: any) => f.muted) ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('home.mutedFriendsHidden')}{' '}
                <Link to="/friends" className="underline text-gray-500 dark:text-gray-400">{t('home.mutedFriendsChange')}</Link>
              </p>
            ) : (friends as any[]).filter((f: any) => !f.muted).length >= 5 && (friends as any[]).filter((f: any) => !f.muted).some((f: any) => !editRecipients.includes(f.id)) ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('home.muteFriendsHint')}{' '}
                <Link to="/friends" className="underline text-gray-500 dark:text-gray-400">{t('home.mutedFriendsChange')}</Link>
              </p>
            ) : null}
          </div>

          <button
            onClick={handleSaveEdit}
            disabled={updateStatus.isPending}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-semibold disabled:opacity-50"
          >
            {t('home.saveChanges')}
          </button>
        </div>
      </div>
    );
  }

  // --- DOOR OPEN VIEW ---
  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 px-4 safe-top">
      {/* Header */}
      <PageHeader />

      {/* Friend doors also open now */}
      {openFriendDoors.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            {t('home.alsoAvailable')}
          </h2>
          <div className="space-y-3">
            {openFriendDoors.map((s: any) => (
              <FriendStatusCard key={s.id} status={s} onGoing={sendGoing} onNoteUpdate={updateGoingNote} />
            ))}
          </div>
        </div>
      )}

      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-4 py-1.5 rounded-full text-sm font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          {t('home.youreOpen')}
        </div>
        {myStatus?.note && (() => {
          const big = bigEmojiClass(myStatus.note);
          return (
            <button
              onClick={() => {
                setEditNote(myStatus.note || '');
                setEditRecipients(myStatus.recipients.map((r: any) => r.id) || []);
                setEditEndsAt(myStatus.ends_at ? format(new Date(myStatus.ends_at * 1000), 'HH:mm') : '');
                setView('edit');
              }}
              className={big ? `${big} leading-none mt-2 block w-full` : 'text-sm text-gray-500 dark:text-gray-400 mt-2 block w-full'}
            >
              {myStatus.note}
            </button>
          );
        })()}
      </div>

      {/* Recipients + invite links */}
      {(myStatus?.recipients.length > 0 || myStatus?.invite_links?.length > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">{t('home.invited')}</h2>
          {myStatus.recipients.map((r: any) => (
            <RecipientRow
              key={r.id}
              recipient={r}
              onRemove={() => removeRecipient.mutate(r.id)}
            />
          ))}
          {myStatus.invite_links?.map((link: any) => (
            <InviteLinkRow
              key={link.token}
              token={link.token}
              createdAt={link.created_at}
              onRevoke={() => revokeInvite.mutate(link.token)}
            />
          ))}
        </div>
      )}

      {/* Going signals */}
      {myStatus?.going_signals?.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950 rounded-2xl p-4 mb-4 border border-emerald-100 dark:border-emerald-800">
          <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2">{t('home.onTheirWay')}</h2>
          {myStatus.going_signals.map((g: any) => (
            <div key={g.id} className="py-1">
              <div className="flex items-center gap-2">
                <span className="text-base">✅</span>
                <span className="text-sm text-emerald-900 dark:text-emerald-200 font-medium">{g.name}</span>
              </div>
              {g.note && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 ml-7 mt-0.5 italic">"{g.note}"</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite link row */}
      <button
        onClick={copyInviteLink}
        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-center gap-3 mb-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="w-9 h-9 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{t('home.anyoneWithLink')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('home.tapToCopyLink')}</p>
        </div>
      </button>

      {/* Actions */}
      <button
        onClick={() => {
          setEditNote(myStatus?.note || '');
          setEditRecipients(myStatus?.recipients.map((r: any) => r.id) || []);
          setEditEndsAt(myStatus?.ends_at ? format(new Date(myStatus.ends_at * 1000), 'HH:mm') : '');
          setView('edit');
        }}
        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-50 py-3 rounded-2xl font-medium text-sm mb-3 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        {t('home.addMoreEdit')}
      </button>

      {/* Duration row */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {myStatus?.ends_at
            ? t('home.closesAt', { time: formatTimeShort(myStatus.ends_at) })
            : minutesLeft > 0
              ? t('home.closesIn', { minutes: minutesLeft })
              : t('home.closingSoon')}
          {' · '}
          <button
            data-testid="change-duration"
            onClick={() => {
              setSelectedDurationMinutes(user?.default_door_minutes ?? 60);
              setShowDurationPicker(true);
            }}
            className="text-gray-700 dark:text-gray-300 font-medium hover:underline underline-offset-2"
          >
            {t('home.changeDuration')}
          </button>
        </span>
        <button
          onClick={() => closeStatus.mutate()}
          disabled={closeStatus.isPending}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
        >
          {t('home.closeNow')}
        </button>
      </div>

      {/* Duration picker overlay */}
      <Modal open={showDurationPicker} onClose={() => setShowDurationPicker(false)} title={t('home.changeDurationTitle')}>
        <div className="space-y-4">
          <div className="flex gap-2">
            {([30, 60, 120, 240] as const).map(min => {
              const nowSec = Math.floor(Date.now() / 1000);
              const wouldClosesAt = (myStatus?.created_at ?? 0) + min * 60;
              const disabled = wouldClosesAt < nowSec + 60;
              const isActive = selectedDurationMinutes === min;
              return (
                <button
                  key={min}
                  onClick={() => {
                    setSelectedDurationMinutes(min);
                    setDuration.mutate(min);
                  }}
                  disabled={disabled || setDuration.isPending}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    isActive
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {min === 30 ? '30 min' : `${min / 60}h`}
                </button>
              );
            })}
          </div>
          {(() => {
            const nowSec = Math.floor(Date.now() / 1000);
            const closesAt = Math.max((myStatus?.created_at ?? nowSec) + selectedDurationMinutes * 60, nowSec + 60);
            const minsLeft = Math.ceil((closesAt - nowSec) / 60);
            return (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('home.doorDurationClosePreview', { time: formatTimeShort(closesAt), minutes: minsLeft })}
              </p>
            );
          })()}
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('home.doorDurationExplainer')}</p>
          <button
            onClick={() => setShowDurationPicker(false)}
            className="w-full bg-emerald-500 text-white py-3 rounded-2xl font-semibold"
          >
            {t('common.done')}
          </button>
        </div>
      </Modal>

    </div>
  );
}

function usePermanentDismiss(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1');
  const dismiss = () => { localStorage.setItem(key, '1'); setDismissed(true); };
  return [dismissed, dismiss];
}

function TipsSection() {
  const { t } = useTranslation();
  const setToast = useToast();
  const [appBannerDismissed, dismissAppBanner] = usePermanentDismiss('app_banner_dismissed');
  const [inviteDismissed, dismissInvite] = usePermanentDismiss('tip_invite_dismissed');
  const [feedbackDismissed, dismissFeedback] = usePermanentDismiss('tip_feedback_dismissed');
  const [coffeeDismissed, dismissCoffee] = usePermanentDismiss('tip_coffee_dismissed');
  const [showFeedback, setShowFeedback] = useState(false);

  const { data: everReceived } = useQuery({ queryKey: ['everReceived'], queryFn: async () => { const { goingApi } = await import('../api'); return goingApi.everReceived(); } });

  const showAppBanner = !Capacitor.isNativePlatform() && !appBannerDismissed;
  const showInviteTip = !inviteDismissed && !showAppBanner;
  const showFeedbackTip = !feedbackDismissed && !showInviteTip && !showAppBanner;

  const tipContent = showAppBanner ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('common.appBannerText')}</p>
        <button onClick={dismissAppBanner} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <Link to="/get" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {t('common.appBannerCta')}
      </Link>
    </div>
  ) : showInviteTip ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('home.inviteFriendsText')}</p>
        <button onClick={dismissInvite} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        onClick={async () => {
          try {
            await copyText(invitesApi.generate().then(data => `${t('home.friendshipCopyText')}\n${data.url}`));
            alert(t('home.inviteLinkCopied'));
          } catch {
            alert(t('home.couldNotCopy'));
          }
        }}
        className="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
      >
        {t('home.copyInviteLink')}
      </button>
    </div>
  ) : showFeedbackTip ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('home.feedbackTipText')}</p>
        <button onClick={() => { dismissFeedback(); setToast({ message: t('home.feedbackTipDismissed'), linkText: t('profile.title'), linkTo: '/profile' }); }} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button onClick={() => setShowFeedback(true)} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {t('home.feedbackTipLink')}
      </button>
    </div>
  ) : !coffeeDismissed && everReceived?.received ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('home.coffeeTipText')}</p>
        <button onClick={dismissCoffee} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <a href="https://www.buymeacoffee.com/dropby" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {t('home.coffeeTipLink')}
      </a>
    </div>
  ) : null;

  return (
    <>
      {tipContent && (
        <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <p className="px-4 pt-3 pb-0 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('home.tipsSectionTitle')}</p>
          {tipContent}
        </div>
      )}
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </>
  );
}
