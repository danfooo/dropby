import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInSeconds, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { statusApi, notesApi, invitesApi, goingApi, trackApi } from '../api';
import { shouldShowNotifPrompt, requestNotificationPermission } from '../utils/notifications';
import DeniedNotifModal from '../components/DeniedNotifModal';
import { useDeniedNotifModal } from '../hooks/useDeniedNotifModal';
import { useAuthStore } from '../stores/auth';
import { bigEmojiClass, formatTimeShort } from '../utils/schedule';
import Avatar from '../components/Avatar';
import FriendDoorsNow from '../components/FriendDoorsNow';
import Glimmer from '../components/Glimmer';
import HomeTips from '../components/HomeTips';
import InviteLinkRow from '../components/InviteLinkRow';
import RecipientRow from '../components/RecipientRow';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useToast } from '../contexts/toast';
import { copyText } from '../utils/clipboard';
import { getSuggestions, IM_HOME_CHIP } from '../i18n/suggestions';
import { LinkifiedText } from '../utils/linkify';
import { invalidate, useFriendStatuses, useFriends, useMyStatus, useSavedNotes } from '../queries';

type HomeView = 'closed' | 'open' | 'edit';

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
  const [doorLocation, setDoorLocation] = useState('');
  const [selectedChip, setSelectedChip] = useState('');
  const [previousNote, setPreviousNote] = useState<string | null>(null);
  const [recipientOverrides, setRecipientOverrides] = useState<Record<string, boolean>>({});
  const [editNote, setEditNote] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editRecipients, setEditRecipients] = useState<string[]>([]);
  const [editEndsAt, setEditEndsAt] = useState('');
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<number>(60);
  const [notifSheet, setNotifSheet] = useState<'open' | 'going' | null>(null);
  const deniedNotif = useDeniedNotifModal();
  const setToast = useToast();
  const pendingAction = useRef<(() => void) | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const friendsListRef = useRef<HTMLDivElement | null>(null);
  const [friendsScroll, setFriendsScroll] = useState({ canScroll: false, atBottom: false });
  const measureFriendsList = () => {
    const el = friendsListRef.current;
    if (!el) return;
    setFriendsScroll({
      canScroll: el.scrollHeight > el.clientHeight + 1,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    });
  };

  const { data: myStatus, isLoading: statusLoading } = useMyStatus({ refetchInterval: 30000 });

  const { data: friendStatuses = [] } = useFriendStatuses({ refetchInterval: 30000 });

  const { data: friends = [] } = useFriends();

  const { data: savedNotes = [] } = useSavedNotes();

  const savedChips = savedNotes as any[];
  const suggestions = useMemo(() => getSuggestions(i18n.language), [i18n.language]);
  const suggestionChips = suggestions.slice(0, 7);

  // Sync view with status
  useEffect(() => {
    if (!statusLoading) {
      setView(myStatus ? 'open' : 'closed');
    }
  }, [myStatus, statusLoading]);

  // Exit edit when the Now tab is tapped while already on /home
  useEffect(() => {
    if (view === 'edit' && location.state?.exitEdit) {
      setView('open');
    }
  }, [location.state?.exitEdit]);

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
      invalidate(qc, 'myStatus');
      // The server now owns this selection; drop the local overrides so the friend
      // records stay the single source of truth.
      setRecipientOverrides({});
      invalidate(qc, 'friends');
      setView('open');
    },
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => invalidate(qc, 'notes'),
  });

  const closeStatus = useMutation({
    mutationFn: statusApi.close,
    onSuccess: () => { invalidate(qc, 'myStatus'); setView('closed'); },
  });

  const setDuration = useMutation({
    mutationFn: (minutes: number) => statusApi.setDuration(minutes),
    onSuccess: () => invalidate(qc, 'myStatus'),
  });

  const updateStatus = useMutation({
    mutationFn: (data: Parameters<typeof statusApi.update>[0]) => statusApi.update(data),
    onSuccess: () => { invalidate(qc, 'myStatus'); setView('open'); },
  });

  const removeRecipient = useMutation({
    mutationFn: (id: string) => statusApi.removeRecipient(id),
    onSuccess: () => invalidate(qc, 'myStatus'),
  });

  const revokeInvite = useMutation({
    mutationFn: (token: string) => invitesApi.revoke(token),
    onSuccess: () => invalidate(qc, 'myStatus'),
  });

  const sendGoing = async (statusId: string, rsvp: 'going' | null = 'going', note?: string) => {
    if (rsvp !== null && await shouldShowNotifPrompt()) {
      pendingAction.current = () => sendGoing(statusId, rsvp, note);
      setNotifSheet('going');
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

  const doOpen = async () => {
    const trimmedNote = note.trim() || undefined;
    const trimmedLocation = doorLocation.trim() || undefined;
    if (trimmedNote && !selectedChip) {
      await notesApi.save(trimmedNote);
      invalidate(qc, 'notes');
    }
    createStatus.mutate({ note: trimmedNote, location: trimmedLocation, recipient_ids: selectedRecipients });
  };

  const handleOpen = async () => {
    if (await shouldShowNotifPrompt()) {
      pendingAction.current = doOpen;
      setNotifSheet('open');
      return;
    }
    await doOpen();
    deniedNotif.check();
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

  // Enter the edit view with the open door's current values.
  const startEdit = () => {
    setEditNote(myStatus?.note || '');
    setEditLocation(myStatus?.location || '');
    setEditRecipients(myStatus?.recipients.map(r => r.id) || []);
    setEditEndsAt(myStatus?.ends_at ? format(new Date(myStatus.ends_at * 1000), 'HH:mm') : '');
    setView('edit');
  };

  const handleSaveEdit = () => {
    let ends_at: number | undefined;
    if (editEndsAt && myStatus?.ends_at) {
      const dateStr = format(new Date(myStatus.ends_at * 1000), 'yyyy-MM-dd');
      ends_at = Math.floor(new Date(`${dateStr}T${editEndsAt}`).getTime() / 1000);
    }
    updateStatus.mutate({ note: editNote || undefined, location: editLocation || undefined, recipient_ids: editRecipients, ends_at });
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
  // Order comes only from the server record, never from live toggles, so checking a box
  // never reorders the list under the user's finger.
  const activeFriends = useMemo(() => {
    return (friends as any[])
      .filter((f: any) => !f.hidden)
      .sort((a: any, b: any) => {
        if (a.selected !== b.selected) return a.selected ? -1 : 1;
        return (b.friendship_created_at ?? 0) - (a.friendship_created_at ?? 0);
      });
  }, [friends]);
  // A row's checked state is its own: the server default it carries, plus any override the
  // user made, keyed by friend id. Friends arriving or leaving never disturb the others.
  const isRecipientSelected = (f: any): boolean => recipientOverrides[f.id] ?? Boolean(f.selected);
  const selectedRecipients = useMemo(
    () => activeFriends.filter(isRecipientSelected).map((f: any) => f.id),
    [activeFriends, recipientOverrides],
  );
  // Re-measure when the list grows (e.g. a friend joins) so the fade matches reality.
  useLayoutEffect(() => { measureFriendsList(); }, [activeFriends.length, view]);
  const nowTs = Math.floor(Date.now() / 1000);
  const openFriendDoors = (friendStatuses as any[]).filter((s: any) => !s.starts_at || s.starts_at <= nowTs);

  // --- DOOR CLOSED VIEW ---
  if (view === 'closed') {
    return (
      <div className={`relative overflow-hidden min-h-full px-4 safe-top flex flex-col ${
        openFriendDoors.length > 0
          ? 'bg-linear-to-br from-violet-100 via-fuchsia-50 to-amber-50 dark:from-violet-950 dark:via-fuchsia-950 dark:to-amber-950'
          : 'bg-gray-200 dark:bg-gray-950'
      }`}>
        {openFriendDoors.length > 0 && <Glimmer />}
        <PageHeader />

        <FriendDoorsNow doors={openFriendDoors} onGoing={sendGoing} onNoteUpdate={updateGoingNote} />

        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 shadow-xs mb-4">
        <h2 className={`font-bold text-gray-900 dark:text-gray-50 mb-4 ${openFriendDoors.length > 0 ? 'text-lg' : 'text-2xl'}`}>
          {getGreeting(t)}
        </h2>

        {/* Note chips: saved first, then suggestions */}
        {(savedChips.length > 0 || suggestionChips.length > 0) && (
          <div className="mb-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {savedChips.map((n: any) => (
                <div
                  key={n.id}
                  className={`shrink-0 flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium border transition-colors ${
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
                    onClick={() => deleteNote.mutate(n.id)}
                    className={`ml-1 rounded-full p-0.5 transition-colors ${
                      selectedChip === n.text ? 'hover:bg-emerald-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Remove"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {suggestionChips.map((chip: string, i: number) => (
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
                      trackApi.chipSelected({ chip: chip === IM_HOME_CHIP ? 'im_home' : 'suggestion', index: i });
                    }
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
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
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
          />
          {note.length >= 130 && (
            <span className={`absolute right-3 bottom-3 text-xs pointer-events-none ${note.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
              {160 - note.length}
            </span>
          )}
        </div>

        {/* Location input */}
        <div className="mb-3">
          <input
            type="text"
            placeholder={t('home.locationPlaceholder')}
            maxLength={200}
            value={doorLocation}
            onChange={e => setDoorLocation(e.target.value)}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        {/* Recipient selection */}
        {activeFriends.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 mb-3 border border-gray-100 dark:border-gray-700">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t('home.openDoorTo')}</h2>
            <div className="relative">
              <div
                className="divide-y divide-gray-50 dark:divide-gray-800 overflow-x-hidden rounded-xl max-h-[192px] overflow-y-auto"
                ref={friendsListRef}
                onScroll={measureFriendsList}
              >
                {activeFriends.map((f: any) => (
                  <label key={f.id} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-3 px-3 transition-colors">
                    <input type="checkbox" checked={isRecipientSelected(f)}
                      onChange={e => setRecipientOverrides(prev => ({ ...prev, [f.id]: e.target.checked }))}
                      className="w-4 h-4 accent-emerald-500 shrink-0" />
                    <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{f.display_name}</span>
                  </label>
                ))}
              </div>
              {friendsScroll.canScroll && !friendsScroll.atBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-14 bg-linear-to-t from-white dark:from-gray-900 to-transparent pointer-events-none rounded-b-xl" />
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleOpen}
            disabled={createStatus.isPending}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition-colors"
          >
            {createStatus.isPending ? t('home.opening') : t('home.openDoor')}
          </button>
          <button
            onClick={() => navigate('/upcoming?plan=1')}
            className="w-full text-violet-600 dark:text-violet-400 py-2 text-sm font-medium"
          >
            {t('home.openLater')}
          </button>
        </div>
        </div>{/* end door card */}

        <div className="mt-auto pt-6 -mx-4">
          <HomeTips />
        </div>

        <DeniedNotifModal open={deniedNotif.open} onDismiss={deniedNotif.dismiss} onSnooze={deniedNotif.snooze} onOpenSettings={deniedNotif.goToSettings} />
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
    const initLocation = myStatus?.location || '';
    const initRecipients = myStatus?.recipients.map((r: any) => r.id) || [];
    const initEndsAt = myStatus?.ends_at ? format(new Date(myStatus.ends_at * 1000), 'HH:mm') : '';

    return (
      <div className="min-h-full bg-gray-200 dark:bg-gray-950">
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
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
            />
            {editNote.length >= 130 && (
              <span className={`absolute right-3 bottom-3.5 text-xs pointer-events-none ${editNote.length >= 150 ? 'text-red-400' : 'text-gray-400'}`}>
                {160 - editNote.length}
              </span>
            )}
          </div>

          <div className="mb-4">
            <input
              type="text"
              placeholder={t('home.locationPlaceholder')}
              maxLength={200}
              defaultValue={initLocation}
              onChange={e => setEditLocation(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {initEndsAt && (
            <div className="mb-4">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{t('home.scheduleEndTime')}</label>
              <input
                type="time"
                defaultValue={initEndsAt}
                onChange={e => setEditEndsAt(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          )}

          {activeFriends.length > 0 && <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 mb-4">
            <h2 className="text-sm font-semibold mb-3">{t('home.recipients')}</h2>
            {(friends as any[]).filter((f: any) => !f.hidden).map((f: any) => (
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
            {(friends as any[]).some((f: any) => f.hidden) ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('home.hiddenFriendsNote')}{' '}
                <Link to="/friends" className="underline text-gray-500 dark:text-gray-400">{t('home.mutedFriendsChange')}</Link>
              </p>
            ) : (friends as any[]).filter((f: any) => !f.hidden).length >= 5 && (friends as any[]).filter((f: any) => !f.hidden).some((f: any) => !editRecipients.includes(f.id)) ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('home.hideFriendsHint')}{' '}
                <Link to="/friends" className="underline text-gray-500 dark:text-gray-400">{t('home.mutedFriendsChange')}</Link>
              </p>
            ) : null}
          </div>}

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
    <div className="relative overflow-hidden min-h-full bg-linear-to-br from-violet-100 via-fuchsia-50 to-amber-50 dark:from-violet-950 dark:via-fuchsia-950 dark:to-amber-950 px-4 safe-top">
      <Glimmer />
      {/* Header */}
      <PageHeader />

      <FriendDoorsNow doors={openFriendDoors} onGoing={sendGoing} onNoteUpdate={updateGoingNote} />

      <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 shadow-xs">
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-4 py-1.5 rounded-full text-sm font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          {t('home.youreOpen')}
        </div>
        {myStatus?.note && (() => {
          const big = bigEmojiClass(myStatus.note);
          return (
            <button
              onClick={startEdit}
              className={big ? `${big} leading-none mt-2 block w-full` : 'text-sm text-gray-500 dark:text-gray-400 mt-2 block w-full'}
            >
              {myStatus.note}
            </button>
          );
        })()}
        {myStatus?.location && (
          <div
            role="button"
            tabIndex={0}
            onClick={startEdit}
            className="text-sm text-gray-500 dark:text-gray-400 mt-1 block w-full cursor-pointer"
          >
            📍 <LinkifiedText text={myStatus.location} />
          </div>
        )}
      </div>

      {/* Visible to */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">{t('home.invited')}</h2>
        {myStatus?.recipients.map((r: any) => (
          <RecipientRow key={r.id} recipient={r} />
        ))}
        {myStatus?.invite_links?.map((link: any) => (
          <InviteLinkRow
            key={link.token}
            token={link.token}
            createdAt={link.created_at}
            onRevoke={() => revokeInvite.mutate(link.token)}
          />
        ))}
        <button
          onClick={copyInviteLink}
          className="w-full flex items-center gap-3 pt-2 mt-1 border-t border-gray-100 dark:border-gray-700 hover:opacity-70 transition-opacity"
        >
          <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{t('home.anyoneWithLink')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('home.tapToCopyLink')}</p>
          </div>
        </button>
      </div>

      {/* Going signals */}
      {myStatus && myStatus.going_signals.length > 0 && (
        <div data-testid="going-signals" className="bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl p-4 mb-3 border border-emerald-100 dark:border-emerald-800/50">
          <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2">{t('home.onTheirWay')}</h2>
          {myStatus.going_signals.map((g: any) => (
            <div key={g.id} className="py-1">
              <div className="flex items-center gap-2">
                <span className="text-base">✅</span>
                <span className="text-sm text-emerald-900 dark:text-emerald-200 font-medium">{g.name}</span>
              </div>
              {g.note && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 ml-7 mt-0.5 italic">{g.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <button
        onClick={startEdit}
        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-50 py-3 rounded-2xl font-medium text-sm mb-3 hover:bg-gray-100 dark:hover:bg-gray-700"
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
      </div>{/* end door card */}

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
