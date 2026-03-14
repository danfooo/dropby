import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInMinutes, differenceInSeconds } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { statusApi, notesApi, invitesApi, goingApi, friendsApi } from '../api';
import Avatar from '../components/Avatar';
import UserMenu from '../components/UserMenu';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import FeedbackModal from '../components/FeedbackModal';
import { getSuggestions } from '../i18n/suggestions';

type HomeView = 'closed' | 'open' | 'edit';

// Friend status card (door open)
function FriendStatusCard({ status, onGoing }: { status: any; onGoing: (id: string) => void }) {
  const { t } = useTranslation();
  const [going, setGoing] = useState(status.my_going);
  const handleGoing = async () => {
    if (going) return;
    setGoing(true);
    await onGoing(status.id);
  };
  const closesIn = differenceInMinutes(new Date(status.closes_at * 1000), new Date());
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3">
        <Avatar name={status.owner_name} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{status.owner_name}</p>
          {status.note && <p className="text-sm text-gray-500 truncate">"{status.note}"</p>}
          <p className="text-xs text-gray-400 mt-0.5">
            {closesIn > 0
              ? t('home.openFor', { minutes: closesIn })
              : t('home.closingSoon')}
          </p>
        </div>
        <button
          onClick={handleGoing}
          disabled={going}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex-shrink-0 ${
            going
              ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : 'bg-emerald-500 hover:bg-emerald-600 text-white'
          }`}
        >
          {t('home.goingButton')}
        </button>
      </div>
    </div>
  );
}

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
      <span className={`flex-1 text-sm ${removing ? 'line-through text-gray-400' : 'text-gray-900'}`}>
        {recipient.display_name}
      </span>
      {removing ? (
        <button onClick={undo} className="text-xs text-emerald-600 font-medium px-2">
          {t('home.undo', { seconds: countdown })}
        </button>
      ) : (
        <button onClick={startRemove} className="text-gray-400 hover:text-gray-600 p-1">
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
  const [view, setView] = useState<HomeView>('closed');
  const [note, setNote] = useState('');
  const [selectedChip, setSelectedChip] = useState('');
  const [previousNote, setPreviousNote] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [editNote, setEditNote] = useState('');
  const [editRecipients, setEditRecipients] = useState<string[]>([]);
  const [showGoingModal, setShowGoingModal] = useState<string | null>(null);

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

  // Compute chip list: suggestions first, then non-hidden saved notes, max 7
  const visibleSaved = (savedNotes as any[]).filter((n: any) => !n.hidden);
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
    mutationFn: (data: { note?: string; recipient_ids: string[] }) => statusApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myStatus'] }); setView('open'); },
  });

  const hideNote = useMutation({
    mutationFn: (id: string) => notesApi.setHidden(id, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  const closeStatus = useMutation({
    mutationFn: statusApi.close,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myStatus'] }); setView('closed'); },
  });

  const prolongStatus = useMutation({
    mutationFn: statusApi.prolong,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myStatus'] }),
  });

  const updateStatus = useMutation({
    mutationFn: (data: { note?: string; recipient_ids?: string[] }) => statusApi.update(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myStatus'] }); setView('open'); },
  });

  const removeRecipient = useMutation({
    mutationFn: (id: string) => statusApi.removeRecipient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myStatus'] }),
  });

  const sendGoing = async (statusId: string) => {
    await goingApi.send(statusId);
    qc.invalidateQueries({ queryKey: ['friendStatuses'] });
  };

  const handleOpen = async () => {
    const trimmedNote = note.trim() || undefined;
    if (trimmedNote && !selectedChip) {
      await notesApi.save(trimmedNote);
      qc.invalidateQueries({ queryKey: ['notes'] });
    }
    createStatus.mutate({ note: trimmedNote, recipient_ids: selectedRecipients });
  };

  const handleSaveEdit = () => {
    updateStatus.mutate({ note: editNote || undefined, recipient_ids: editRecipients });
  };

  const copyInviteLink = async () => {
    try {
      const data = await invitesApi.generate(myStatus?.id);
      await navigator.clipboard.writeText(data.url);
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
  const mutedFriends = useMemo(() => {
    return (friends as any[])
      .filter((f: any) => f.muted)
      .sort((a: any, b: any) => (b.friendship_created_at ?? 0) - (a.friendship_created_at ?? 0));
  }, [friends]);

  // --- DOOR CLOSED VIEW ---
  if (view === 'closed') {
    return (
      <div className="min-h-full bg-gray-50 px-4 pt-8 pb-24">
        {/* Friend doors open */}
        {(friendStatuses as any[]).length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t('home.friendsAvailable')}
            </h2>
            <div className="space-y-3">
              {(friendStatuses as any[]).map((s: any) => (
                <FriendStatusCard key={s.id} status={s} onGoing={sendGoing} />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <img src="/logo.svg" alt="Drop By" className="h-8" />
          <UserMenu />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6 mt-5">{getGreeting(t)}</h1>

        {/* Suggestion chips */}
        {chips.length > 0 && (
          <div className="mb-2">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
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
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                    selectedChip === chip
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Saved note chips */}
        {visibleSaved.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {visibleSaved.map((n: any) => (
                <div
                  key={n.id}
                  className={`flex-shrink-0 flex items-center gap-1 pl-4 pr-2 py-2 rounded-full text-sm font-medium border transition-colors ${
                    selectedChip === n.text
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-gray-700 border-gray-200'
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
            </div>
          </div>
        )}

        {/* Note input */}
        <div className="mb-6 relative">
          <input
            type="text"
            placeholder={t('home.customNotePlaceholder')}
            maxLength={100}
            value={note}
            onChange={e => {
              setNote(e.target.value);
              if (selectedChip && e.target.value !== selectedChip) {
                setSelectedChip('');
                setPreviousNote(null);
              }
            }}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {note.length >= 80 && (
            <span className={`absolute right-3 bottom-3 text-xs pointer-events-none ${note.length >= 90 ? 'text-red-400' : 'text-gray-400'}`}>
              {100 - note.length}
            </span>
          )}
        </div>

        {/* Recipient selection */}
        {hasFriends && (
          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">{t('home.openDoorTo')}</h2>
            <div className="divide-y divide-gray-50">
              {activeFriends.map((f: any) => (
                <label key={f.id} className="flex items-center gap-3 py-3 cursor-pointer hover:bg-gray-50 -mx-4 px-4 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedRecipients.includes(f.id)}
                    onChange={e => {
                      setSelectedRecipients(prev =>
                        e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                      );
                    }}
                    className="w-5 h-5 accent-emerald-500 flex-shrink-0"
                  />
                  <Avatar name={f.display_name} size="md" />
                  <span className="text-base font-medium text-gray-900">{f.display_name}</span>
                </label>
              ))}
              {mutedFriends.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 pt-3 pb-1 font-medium">{t('home.muted')}</p>
                  {mutedFriends.map((f: any) => (
                    <label key={f.id} className="flex items-center gap-3 py-3 cursor-pointer opacity-50 hover:bg-gray-50 -mx-4 px-4 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedRecipients.includes(f.id)}
                        onChange={e => {
                          setSelectedRecipients(prev =>
                            e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                          );
                        }}
                        className="w-5 h-5 accent-emerald-500 flex-shrink-0"
                      />
                      <Avatar name={f.display_name} size="md" />
                      <span className="text-base font-medium text-gray-700">{f.display_name}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Open button */}
        <button
          onClick={handleOpen}
          disabled={createStatus.isPending}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-4 rounded-2xl font-semibold text-lg transition-colors shadow-md"
        >
          {createStatus.isPending ? t('home.opening') : t('home.openDoor')}
        </button>
        <p className="text-xs text-gray-400 text-center mt-2">{t('home.openDoorDesc')}</p>

        <TipsSection />
      </div>
    );
  }

  // --- DOOR OPEN EDIT VIEW ---
  if (view === 'edit') {
    const initNote = myStatus?.note || '';
    const initRecipients = myStatus?.recipients.map((r: any) => r.id) || [];

    return (
      <div className="min-h-full bg-gray-50 pb-24">
        {/* Sticky banner */}
        <button
          onClick={() => setView('open')}
          className="w-full bg-emerald-500 text-white py-3 px-4 flex items-center gap-2 sticky top-0 z-10"
        >
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-sm font-medium">{t('home.yourDoorIsOpen')}</span>
        </button>

        <div className="px-4 pt-6">
          <h1 className="text-xl font-bold mb-4">{t('home.edit')}</h1>
          <input
            type="text"
            placeholder={t('home.notePlaceholder')}
            maxLength={100}
            defaultValue={initNote}
            onChange={e => setEditNote(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-4"
          />

          <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
            <h2 className="text-sm font-semibold mb-3">{t('home.recipients')}</h2>
            {(friends as any[]).map((f: any) => (
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
                <Avatar name={f.display_name} size="sm" />
                <span className="text-sm">{f.display_name}</span>
              </label>
            ))}
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
    <div className="min-h-full bg-gray-50 px-4 pt-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <img src="/logo.svg" alt="Drop By" className="h-8" />
        <UserMenu />
      </div>

      {/* Friend doors also open */}
      {(friendStatuses as any[]).length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {t('home.alsoAvailable')}
          </h2>
          <div className="space-y-3">
            {(friendStatuses as any[]).map((s: any) => (
              <FriendStatusCard key={s.id} status={s} onGoing={sendGoing} />
            ))}
          </div>
        </div>
      )}

      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-sm font-medium mb-3">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          {t('home.youreOpen')}
        </div>
        {myStatus?.note && (
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 mt-1 mb-1">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {myStatus.note}
          </div>
        )}
        <p className="text-sm text-gray-500 mt-2">
          {minutesLeft > 0 ? t('home.closesIn', { minutes: minutesLeft }) : t('home.closingSoon')}
        </p>
        {minutesLeft <= 20 && (
          <button
            onClick={() => prolongStatus.mutate()}
            disabled={prolongStatus.isPending}
            className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {t('home.keepItOpen')}
          </button>
        )}
      </div>

      {/* Recipients */}
      {myStatus?.recipients.length > 0 && (
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">{t('home.invited')}</h2>
          {myStatus.recipients.map((r: any) => (
            <RecipientRow
              key={r.id}
              recipient={r}
              onRemove={() => removeRecipient.mutate(r.id)}
            />
          ))}
        </div>
      )}

      {/* Going signals */}
      {myStatus?.going_signals?.length > 0 && (
        <div className="bg-emerald-50 rounded-2xl p-4 mb-4 border border-emerald-100">
          <h2 className="text-sm font-semibold text-emerald-800 mb-2">{t('home.onTheirWay')}</h2>
          {myStatus.going_signals.map((g: any) => (
            <div key={g.id} className="flex items-center gap-2 py-1">
              <span className="text-base">✅</span>
              <span className="text-sm text-emerald-900 font-medium">{g.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invite link row */}
      <button
        onClick={copyInviteLink}
        className="w-full bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 mb-4 hover:bg-gray-50 transition-colors"
      >
        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900">{t('home.anyoneWithLink')}</p>
          <p className="text-xs text-gray-500">{t('home.tapToCopyLink')}</p>
        </div>
      </button>

      {/* Actions */}
      <button
        onClick={() => {
          setEditNote(myStatus?.note || '');
          setEditRecipients(myStatus?.recipients.map((r: any) => r.id) || []);
          setView('edit');
        }}
        className="w-full bg-white border border-gray-200 text-gray-900 py-3 rounded-2xl font-medium text-sm mb-3 hover:bg-gray-50"
      >
        {t('home.addMoreEdit')}
      </button>

      <button
        onClick={() => closeStatus.mutate()}
        disabled={closeStatus.isPending}
        className="w-full text-gray-500 py-2 text-sm hover:text-gray-700 disabled:opacity-50"
      >
        {t('home.closeNow')}
      </button>
    </div>
  );
}

function usePermanentDismiss(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1');
  const dismiss = () => { localStorage.setItem(key, '1'); setDismissed(true); };
  return [dismissed, dismiss];
}

function TipsSection() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [nudgeDismissed, dismissNudge] = usePermanentDismiss('tip_nudge_dismissed');
  const [inviteDismissed, dismissInvite] = usePermanentDismiss('tip_invite_dismissed');
  const [feedbackDismissed, dismissFeedback] = usePermanentDismiss('tip_feedback_dismissed');
  const [coffeeDismissed, dismissCoffee] = usePermanentDismiss('tip_coffee_dismissed');
  const [showFeedback, setShowFeedback] = useState(false);
  const [toast, setToast] = useState<{ message: string; linkText: string; linkTo: string } | null>(null);

  const { data: nudges = [] } = useQuery({ queryKey: ['nudges'], queryFn: async () => { const { nudgesApi } = await import('../api'); return nudgesApi.list(); } });
  const { data: everReceived } = useQuery({ queryKey: ['everReceived'], queryFn: async () => { const { goingApi } = await import('../api'); return goingApi.everReceived(); } });

  const addNudge = useMutation({
    mutationFn: async () => { const { nudgesApi } = await import('../api'); return nudgesApi.add('sat', 11); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nudges'] });
      setToast({ message: t('home.nudgeConfirmed'), linkText: t('home.nudgeConfirmedLink'), linkTo: '/profile' });
    },
  });

  const use24h = ['de', 'es', 'fr'].includes(i18n.language.split('-')[0]);
  const timeLabel = use24h ? '11:00' : '11am';
  const dayLabel = t('profile.days.sat');

  const showNudgeTip = !nudgeDismissed && (nudges as any[]).length === 0;
  const showInviteTip = !inviteDismissed && !showNudgeTip;
  const showFeedbackTip = !feedbackDismissed && !showInviteTip && !showNudgeTip;

  const tipContent = showNudgeTip ? (
    <div className="bg-white border-t border-gray-100 px-4 py-4">
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-gray-900">{t('home.nudgeQuestion')}</p>
        <button onClick={dismissNudge} className="text-gray-300 hover:text-gray-500 -mt-0.5 -mr-0.5 p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t('home.nudgeSuggestion', { day: dayLabel, time: timeLabel })}</p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => addNudge.mutate()}
          disabled={addNudge.isPending}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          {t('home.nudgeAccept')}
        </button>
        <Link to="/profile?addReminder=1" className="text-sm text-gray-500 hover:text-gray-700">
          {t('home.nudgePickOther')}
        </Link>
      </div>
    </div>
  ) : showInviteTip ? (
    <div className="bg-white border-t border-gray-100 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 flex-1">{t('home.inviteFriendsText')}</p>
        <button onClick={dismissInvite} className="text-gray-300 hover:text-gray-500 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        onClick={async () => {
          const { invitesApi } = await import('../api');
          const data = await invitesApi.generate();
          await navigator.clipboard.writeText(data.url);
          setToast({ message: t('home.inviteLinkCopied'), linkText: '', linkTo: '' });
        }}
        className="text-sm font-semibold text-emerald-600"
      >
        {t('home.copyInviteLink')}
      </button>
    </div>
  ) : showFeedbackTip ? (
    <div className="bg-white border-t border-gray-100 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 flex-1">{t('home.feedbackTipText')}</p>
        <button onClick={() => { dismissFeedback(); setToast({ message: t('home.feedbackTipDismissed'), linkText: t('profile.title'), linkTo: '/profile' }); }} className="text-gray-300 hover:text-gray-500 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button onClick={() => setShowFeedback(true)} className="text-sm font-semibold text-emerald-600">
        {t('home.feedbackTipLink')}
      </button>
    </div>
  ) : !coffeeDismissed && everReceived?.received ? (
    <div className="bg-white border-t border-gray-100 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 flex-1">{t('home.coffeeTipText')}</p>
        <button onClick={dismissCoffee} className="text-gray-300 hover:text-gray-500 -mt-0.5 -mr-0.5 p-1 ml-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <a href="https://www.buymeacoffee.com/dropby" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-600">
        {t('home.coffeeTipLink')}
      </a>
    </div>
  ) : null;

  const portal = document.getElementById('tip-portal');

  return (
    <>
      {portal && tipContent && createPortal(tipContent, portal)}
      {toast && <Toast message={toast.message} linkText={toast.linkText || undefined} linkTo={toast.linkTo || undefined} onDismiss={() => setToast(null)} />}
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </>
  );
}
