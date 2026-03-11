import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { useAuthStore } from '../stores/auth';
import { statusApi, notesApi, invitesApi, goingApi } from '../api';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';

type HomeView = 'closed' | 'open' | 'edit';

// Friend status card (door open)
function FriendStatusCard({ status, onGoing }: { status: any; onGoing: (id: string) => void }) {
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
          <p className="text-xs text-gray-400 mt-0.5">Open for {closesIn > 0 ? `${closesIn} min` : 'closing soon'}</p>
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
          {going ? 'Going ✅' : 'Going ✅'}
        </button>
      </div>
    </div>
  );
}

// Recipient row in door-open view
function RecipientRow({ recipient, onRemove }: { recipient: any; onRemove: () => void }) {
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
          Undo ({countdown}s)
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

export default function Home() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [view, setView] = useState<HomeView>('closed');
  const [selectedNote, setSelectedNote] = useState('');
  const [customNote, setCustomNote] = useState('');
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
    queryFn: async () => {
      const { friendsApi } = await import('../api');
      return friendsApi.list();
    },
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggestions'],
    queryFn: notesApi.suggestions,
  });

  const { data: savedNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: notesApi.list,
  });

  // Compute chip list: suggestions first, then non-hidden saved notes, max 7
  const visibleSaved = (savedNotes as any[]).filter((n: any) => !n.hidden);
  const chips = [
    ...suggestions.slice(0, 7),
    ...visibleSaved.map((n: any) => n.text),
  ].slice(0, 7);

  // Initialize recipient selection from server
  useEffect(() => {
    if (!lastSelection || !friends.length) return;
    const friendIds = (friends as any[]).map((f: any) => f.id);
    const mutedIds = (friends as any[]).filter((f: any) => f.muted).map((f: any) => f.id);

    if (lastSelection.first_time || !lastSelection.selected_ids) {
      // First time: all non-muted
      setSelectedRecipients(friendIds.filter((id: string) => !mutedIds.includes(id)));
    } else {
      // Restore previous, exclude removed friends, uncheck muted
      const prev: string[] = lastSelection.selected_ids;
      setSelectedRecipients(
        prev.filter((id: string) => friendIds.includes(id) && !mutedIds.includes(id))
      );
    }
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
    const note = customNote.trim() || selectedNote || undefined;
    if (customNote.trim()) {
      await notesApi.save(customNote.trim());
      qc.invalidateQueries({ queryKey: ['notes'] });
    }
    createStatus.mutate({ note, recipient_ids: selectedRecipients });
  };

  const handleSaveEdit = () => {
    updateStatus.mutate({ note: editNote || undefined, recipient_ids: editRecipients });
  };

  const copyInviteLink = async () => {
    try {
      const data = await invitesApi.generate(myStatus?.id);
      await navigator.clipboard.writeText(data.url);
      alert('Invite link copied!');
    } catch {
      alert('Could not copy link');
    }
  };

  const hasFriends = (friends as any[]).length > 0;
  const activeFriends = (friends as any[]).filter((f: any) => !f.muted);
  const mutedFriends = (friends as any[]).filter((f: any) => f.muted);

  // --- DOOR CLOSED VIEW ---
  if (view === 'closed') {
    return (
      <div className="min-h-full bg-gray-50 px-4 pt-8 pb-24">
        {/* Friend doors open */}
        {(friendStatuses as any[]).length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Friends available</h2>
            <div className="space-y-3">
              {(friendStatuses as any[]).map((s: any) => (
                <FriendStatusCard key={s.id} status={s} onGoing={sendGoing} />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Hey, {user?.display_name?.split(' ')[0]} 👋
          </h1>
          <Link to="/profile" className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex items-center justify-center text-sm">
            {user?.display_name?.charAt(0).toUpperCase()}
          </Link>
        </div>

        {/* Note chips */}
        {chips.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {chips.map((chip: string) => (
                <button
                  key={chip}
                  onClick={() => { setSelectedNote(chip); setCustomNote(''); }}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                    selectedNote === chip && !customNote
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

        {/* Custom note input */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Or type a custom note… (optional)"
            maxLength={60}
            value={customNote}
            onChange={e => { setCustomNote(e.target.value); if (e.target.value) setSelectedNote(''); }}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {customNote && <p className="text-xs text-gray-400 mt-1 text-right">{customNote.length}/60</p>}
        </div>

        {/* Recipient selection */}
        {hasFriends && (
          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Notify friends</h2>
            <div className="space-y-1">
              {activeFriends.map((f: any) => (
                <label key={f.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRecipients.includes(f.id)}
                    onChange={e => {
                      setSelectedRecipients(prev =>
                        e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                      );
                    }}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <Avatar name={f.display_name} size="sm" />
                  <span className="text-sm text-gray-900">{f.display_name}</span>
                </label>
              ))}
              {mutedFriends.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 pt-2 pb-1 font-medium">Muted</p>
                  {mutedFriends.map((f: any) => (
                    <label key={f.id} className="flex items-center gap-3 py-2 cursor-pointer opacity-60">
                      <input
                        type="checkbox"
                        checked={selectedRecipients.includes(f.id)}
                        onChange={e => {
                          setSelectedRecipients(prev =>
                            e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                          );
                        }}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <Avatar name={f.display_name} size="sm" />
                      <span className="text-sm text-gray-700">{f.display_name}</span>
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
          {createStatus.isPending ? 'Opening…' : 'Open for 30 min 🚪'}
        </button>

        {/* Invite friends card */}
        {!hasFriends && (
          <div className="mt-4 bg-white rounded-2xl p-4 border border-dashed border-gray-200">
            <p className="text-sm text-gray-600 mb-3">
              Share a link so friends can add you on Drop By — like other apps you already use.
            </p>
            <button
              onClick={async () => {
                const data = await invitesApi.generate();
                await navigator.clipboard.writeText(data.url);
                alert('Invite link copied!');
              }}
              className="text-sm font-semibold text-emerald-600"
            >
              Copy invite link →
            </button>
          </div>
        )}

        {/* Nudge card — shown only if no nudge schedules */}
        <NudgeCard />
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
          <span className="text-sm font-medium">Your door is open — tap to return</span>
        </button>

        <div className="px-4 pt-6">
          <h1 className="text-xl font-bold mb-4">Edit</h1>
          <input
            type="text"
            placeholder="Note (optional)"
            maxLength={60}
            defaultValue={initNote}
            onChange={e => setEditNote(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-4"
          />

          <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
            <h2 className="text-sm font-semibold mb-3">Recipients</h2>
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
            Save changes
          </button>
        </div>
      </div>
    );
  }

  // --- DOOR OPEN VIEW ---
  return (
    <div className="min-h-full bg-gray-50 px-4 pt-8 pb-24">
      {/* Friend doors also open */}
      {(friendStatuses as any[]).length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Also available</h2>
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
          You're open!
        </div>
        {myStatus?.note && (
          <p className="text-lg font-medium text-gray-900">"{myStatus.note}"</p>
        )}
        <p className="text-sm text-gray-500 mt-2">
          {minutesLeft > 0 ? `Closes in ${minutesLeft} min` : 'Closing soon'}
        </p>
        {minutesLeft <= 20 && (
          <button
            onClick={() => prolongStatus.mutate()}
            disabled={prolongStatus.isPending}
            className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            Keep it open +30 min
          </button>
        )}
      </div>

      {/* Recipients */}
      {myStatus?.recipients.length > 0 && (
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Notified</h2>
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
          <h2 className="text-sm font-semibold text-emerald-800 mb-2">On their way</h2>
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
          <p className="text-sm font-medium text-gray-900">Anyone with link</p>
          <p className="text-xs text-gray-500">Tap to copy invite link</p>
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
        Add more people / Edit
      </button>

      <button
        onClick={() => closeStatus.mutate()}
        disabled={closeStatus.isPending}
        className="w-full text-gray-500 py-2 text-sm hover:text-gray-700 disabled:opacity-50"
      >
        Close now
      </button>
    </div>
  );
}

function NudgeCard() {
  const { data: nudges = [] } = useQuery({ queryKey: ['nudges'], queryFn: async () => { const { nudgesApi } = await import('../api'); return nudgesApi.list(); } });

  const DAY_ABBR: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

  if ((nudges as any[]).length > 0) {
    const summary = (nudges as any[]).slice(0, 3).map((n: any) => `${DAY_ABBR[n.day_of_week]} ${n.hour}:00`).join(' · ');
    return (
      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>Reminders: {summary}{(nudges as any[]).length > 3 ? ' …' : ''}</span>
        <Link to="/profile" className="text-emerald-600 font-medium">Edit</Link>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-white rounded-2xl p-4 border border-gray-100">
      <p className="text-sm font-semibold text-gray-900 mb-1">Set a reminder</p>
      <p className="text-sm text-gray-500 mb-3">
        A regular nudge helps you remember to open up. It won't bother your friends — it's just for you.
      </p>
      <Link to="/profile" className="text-sm font-semibold text-emerald-600">
        Set your reminder →
      </Link>
    </div>
  );
}
