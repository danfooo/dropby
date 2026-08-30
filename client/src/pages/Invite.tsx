import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useAuthStore } from '../stores/auth';
import { invitesApi, goingApi } from '../api';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { copyText } from '../utils/clipboard';
import DeniedNotifModal from '../components/DeniedNotifModal';
import { useDeniedNotifModal } from '../hooks/useDeniedNotifModal';
import { LinkifiedText } from '../utils/linkify';

function formatScheduledTime(startsAt: number, endsAt?: number | null): string {
  const start = format(new Date(startsAt * 1000), 'EEE, MMM d · h:mm a');
  if (endsAt) return `${start} – ${format(new Date(endsAt * 1000), 'h:mm a')}`;
  return start;
}

export default function Invite() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'INVALID' | 'EXPIRED' | null>(null);
  const [expiredAgo, setExpiredAgo] = useState(0);
  const [expiredInviter, setExpiredInviter] = useState<{ display_name: string; avatar_url?: string | null } | null>(null);
  const [inviteBackCopied, setInviteBackCopied] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptedName, setAcceptedName] = useState('');
  const [accepting, setAccepting] = useState(false);
  // Everyone else who opened this link, pre-checked: connecting with the whole group is
  // the default, unchecking is how you connect with fewer.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [alsoDone, setAlsoDone] = useState(false);
  const deniedNotif = useDeniedNotifModal();
  const [showGoingForm, setShowGoingForm] = useState(false);
  const [guestRsvp, setGuestRsvp] = useState<{ signalId: string } | null>(null);
  const [guestNote, setGuestNote] = useState('');
  const [guestNoteSaving, setGuestNoteSaving] = useState(false);
  const [guestNoteSaved, setGuestNoteSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    invitesApi.get(token)
      .then(data => { setInfo(data); setLoading(false); })
      .catch(err => {
        setLoading(false);
        const code = err.response?.data?.error;
        if (code === 'EXPIRED') {
          setError('EXPIRED');
          setExpiredAgo(err.response.data.expired_ago_seconds || 0);
          setExpiredInviter(err.response.data.inviter || null);
        } else {
          setError('INVALID');
        }
      });
  }, [token]);

  // Store invite token and restore guest RSVP from localStorage
  useEffect(() => {
    if (!token || !info) return;
    localStorage.setItem('dropby_invite_token', token);
    if (info.status) {
      const raw = localStorage.getItem('dropby_guest_rsvp');
      if (raw) {
        try {
          const stored = JSON.parse(raw);
          if (stored.statusId === info.status.id) setGuestRsvp({ signalId: stored.signalId });
        } catch {}
      }
    }
  }, [token, info]);

  // Nothing is accepted on the user's behalf: own links and existing friendships resolve
  // straight away, but a new connection always waits for an explicit tap.
  useEffect(() => {
    if (!info || !user || accepted) return;
    if (info.isSelf || info.alreadyFriends) setAccepted(true);
  }, [info, user]);

  const candidates: Array<{ id: string; display_name: string; avatar_url: string | null }> = info?.candidates ?? [];
  const checked = picked ?? candidates.map(c => c.id);
  const toggle = (id: string) =>
    setPicked(checked.includes(id) ? checked.filter(c => c !== id) : [...checked, id]);

  const candidateList = () => (
    <div data-testid="invite-candidates" className="mb-6 text-left">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
        {info.link_name ? t('invite.alsoHereNamed', { name: info.link_name }) : t('invite.alsoHereTitle')}
      </p>
      <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
        {candidates.map((c, i) => (
          <label
            key={c.id}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}
          >
            <Avatar name={c.display_name} url={c.avatar_url} size="sm" />
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-50">{c.display_name}</span>
            <input
              type="checkbox"
              checked={checked.includes(c.id)}
              onChange={() => toggle(c.id)}
              className="w-5 h-5 accent-emerald-500"
            />
          </label>
        ))}
      </div>
    </div>
  );

  // Used on the already-friends and own-link screens: the host is settled, but a re-opened
  // link is how you catch the people who joined after you last looked.
  const connectOnly = () => {
    if (accepting) return;
    setAccepting(true);
    invitesApi.accept(token!, checked)
      .then(() => setAlsoDone(true))
      .catch(() => {})
      .finally(() => setAccepting(false));
  };

  const catchUpBlock = () => {
    if (alsoDone) {
      return <p data-testid="invite-also-done" className="text-sm text-emerald-600 dark:text-emerald-400 mb-6">{t('invite.alsoConnected')}</p>;
    }
    if (!candidates.length) return null;
    return (
      <div className="w-full max-w-xs mb-6">
        {candidateList()}
        <button
          data-testid="invite-also-connect"
          onClick={connectOnly}
          disabled={accepting || checked.length === 0}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold"
        >
          {t('invite.alsoConnectCta', { count: checked.length })}
        </button>
      </div>
    );
  };

  const handleAccept = () => {
    if (accepting) return;
    setAccepting(true);
    invitesApi.accept(token!, checked)
      .then(res => {
        setAccepted(true);
        setAcceptedName(res.inviterName || info.inviter?.display_name || '');
      })
      .catch(() => setError('INVALID'))
      .finally(() => setAccepting(false));
  };

  // After friendship forms, nudge the user to enable notifications if they've denied them
  useEffect(() => {
    if (accepted && user) deniedNotif.check();
  }, [accepted, user]);

  // Redirect not-logged-in users only when there's no status at all (not even scheduled)
  useEffect(() => {
    if (!user && !loading && (error === 'EXPIRED' || (info && !info.status))) {
      navigate(`/auth?redirect=/invite/${token}`, { replace: true });
    }
  }, [info, user, error, loading]);

  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error === 'EXPIRED') {
    // Not logged in: redirect to auth is pending, show spinner
    if (!user) {
      return (
        <div className="flex h-full min-h-screen items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    // Logged in: show expired screen with invite-back CTA
    const agoText = expiredAgo >= 3600
      ? `${Math.floor(expiredAgo / 3600)} hour${Math.floor(expiredAgo / 3600) === 1 ? '' : 's'} ago`
      : `${Math.floor(expiredAgo / 60)} minutes ago`;
    const inviterName = expiredInviter?.display_name || '';
    const handleInviteBack = () => {
      copyText(invitesApi.generate().then((data: any) => `${t('home.friendshipCopyText')}\n${data.url}`));
      setInviteBackCopied(true);
      setTimeout(() => setInviteBackCopied(false), 3000);
    };
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white dark:bg-gray-950">
        <p className="text-5xl mb-4">⏰</p>
        <h1 className="text-xl font-bold mb-2">{t('invite.expiredTitle')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">{t('invite.expiredDesc', { ago: agoText })}</p>
        <button
          onClick={handleInviteBack}
          className="w-full max-w-xs bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-semibold mb-3"
        >
          {inviteBackCopied ? t('invite.inviteBackCopied') : t('invite.inviteBackCta', { name: inviterName })}
        </button>
        <Link to="/home" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
          {t('invite.goHome')}
        </Link>
      </div>
    );
  }

  if (error === 'INVALID' || !info) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white dark:bg-gray-950">
        <p className="text-5xl mb-4">🤔</p>
        <h1 className="text-xl font-bold mb-2">{t('invite.invalidTitle')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">{t('invite.invalidDesc')}</p>
        <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
          {t('invite.goHome')}
        </Link>
      </div>
    );
  }

  // Logged-in: show accepted state
  if (user && accepted) {
    if (info.isSelf) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white dark:bg-gray-950">
          <p className="text-5xl mb-4">😄</p>
          <h1 className="text-xl font-bold mb-2">{t('invite.ownLinkTitle')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">{t('invite.ownLinkDesc')}</p>
          {catchUpBlock()}
          <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
            {t('invite.goHome')}
          </Link>
        </div>
      );
    }

    if (info.alreadyFriends) {
      return (
        <div data-testid="invite-already-friends" className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white dark:bg-gray-950">
          <p className="text-5xl mb-4">👋</p>
          <h1 className="text-xl font-bold mb-2">{t('invite.alreadyFriendsTitle')}</h1>
          {catchUpBlock()}
          {info.status ? (
            <>
              <div className="mb-6">
                <p className="text-gray-600 dark:text-gray-400">
                  {info.status.note
                    ? t('invite.doorOpenWithNote', { name: info.inviter.display_name, note: info.status.note })
                    : t('invite.doorOpen', { name: info.inviter.display_name })}
                </p>
                {info.status.location && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    📍 <LinkifiedText text={info.status.location} />
                  </p>
                )}
              </div>
              <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
                {t('invite.doorOpenCta')}
              </Link>
            </>
          ) : (
            <Link to="/home" className="mt-6 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
              {t('invite.goHome')}
            </Link>
          )}
        </div>
      );
    }

    return (
      <div data-testid="invite-accepted" className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white dark:bg-gray-950">
        <p className="text-5xl mb-4">🎉</p>
        <h1 className="text-xl font-bold mb-2">{t('invite.friendsNowTitle')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{t('invite.friendsNowDesc', { name: acceptedName })}</p>
        {info.status && (
          <div className="w-full max-w-xs bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800 rounded-2xl p-4 mb-6 text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t('invite.doorOpen', { name: acceptedName })}</span>
            </div>
            {info.status.note && (
              <p data-testid="invite-door-note" className="text-sm text-emerald-700 dark:text-emerald-400 ml-4">{info.status.note}</p>
            )}
            {info.status.location && (
              <p className="text-sm text-emerald-600 dark:text-emerald-500 ml-4 mt-0.5">
                📍 <LinkifiedText text={info.status.location} />
              </p>
            )}
          </div>
        )}
        <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
          {info.status ? t('invite.doorOpenCta') : t('invite.hurray')}
        </Link>
        <DeniedNotifModal open={deniedNotif.open} onDismiss={deniedNotif.dismiss} onSnooze={deniedNotif.snooze} onOpenSettings={deniedNotif.goToSettings} />
      </div>
    );
  }

  // Logged in, not connected yet: ask before creating anything.
  // Closing leaves it pending in Friends; the sender is never told it was opened.
  if (user && !accepted) {
    const isScheduled = info.status?.starts_at && info.status.starts_at > Math.floor(Date.now() / 1000);
    return (
      <div data-testid="invite-confirm" className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm text-center">
          {info.link_name && (
            <p data-testid="invite-link-name" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
              {info.link_name}
            </p>
          )}
          <Avatar name={info.inviter.display_name} url={info.inviter.avatar_url} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">
            {t('invite.confirmTitle', { name: info.inviter.display_name })}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{t('invite.confirmDesc')}</p>

          {info.status && (
            <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800 rounded-2xl p-4 mb-6 text-left">
              <div className="flex items-center gap-2">
                {isScheduled ? (
                  <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                    🕐 {formatScheduledTime(info.status.starts_at, info.status.ends_at)}
                  </span>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      {t('invite.doorOpen', { name: info.inviter.display_name })}
                    </span>
                  </>
                )}
              </div>
              {info.status.note && (
                <p data-testid="invite-door-note" className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">{info.status.note}</p>
              )}
              {info.status.location && (
                <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-0.5">
                  📍 <LinkifiedText text={info.status.location} />
                </p>
              )}
            </div>
          )}

          {candidates.length > 0 && candidateList()}

          <button
            data-testid="invite-accept"
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-4 rounded-2xl font-semibold text-base mb-3"
          >
            {checked.length > 0
              ? t('invite.confirmAcceptMany', { count: checked.length + 1 })
              : t('invite.confirmAccept')}
          </button>
          <button
            data-testid="invite-close"
            onClick={() => navigate('/friends')}
            className="w-full py-3 text-gray-500 dark:text-gray-400 font-medium"
          >
            {t('invite.confirmClose')}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('invite.confirmLater')}</p>
        </div>
      </div>
    );
  }

  // Not logged in, door open or scheduled: show door card
  if (!user && info.status) {
    const isScheduled = info.status.starts_at && info.status.starts_at > Math.floor(Date.now() / 1000);

    const handleUpdateGuestNote = async () => {
      if (!guestRsvp || !guestNote.trim()) return;
      setGuestNoteSaving(true);
      try {
        await goingApi.patchGuest(guestRsvp.signalId, guestNote.trim());
        setGuestNoteSaved(true);
        setTimeout(() => setGuestNoteSaved(false), 2000);
      } catch {} finally {
        setGuestNoteSaving(false);
      }
    };

    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm text-center">
          <Avatar name={info.inviter.display_name} url={info.inviter.avatar_url} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{info.inviter.display_name}</h1>
          {isScheduled ? (
            <p className="text-violet-600 dark:text-violet-400 font-semibold mb-1 mt-1">
              🕐 {formatScheduledTime(info.status.starts_at, info.status.ends_at)}
            </p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 mb-1">{t('invite.hasTheirDoorOpen')}</p>
          )}
          <div className="mb-4">
            {info.status.note && (
              <p className="text-lg font-medium text-gray-800 dark:text-gray-200">"{info.status.note}"</p>
            )}
            {info.status.location && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                📍 <LinkifiedText text={info.status.location} />
              </p>
            )}
          </div>

          {isScheduled && (
            <a
              href={`/api/invites/${token}/calendar.ics`}
              download
              className="block text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 font-medium mb-4"
            >
              {t('invite.addToCalendar')}
            </a>
          )}

          {guestRsvp ? (
            <div className="mb-4 text-left">
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 text-center mb-3">{t('invite.rsvpGoing')} ✅ — {t('invite.yourRsvp')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guestNote}
                  onChange={e => setGuestNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdateGuestNote(); }}
                  placeholder={t('invite.notePlaceholder')}
                  className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  onClick={handleUpdateGuestNote}
                  disabled={!guestNote.trim() || guestNoteSaving}
                  className="px-3 py-2.5 bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold"
                >
                  {guestNoteSaved ? '✓' : t('common.send')}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('invite.noteDisclaimer', { name: info.inviter.display_name })}</p>
            </div>
          ) : (
            <div className="mb-4">
              <button
                onClick={() => setShowGoingForm(true)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-semibold text-base"
              >
                {t('invite.rsvpGoing')}
              </button>
            </div>
          )}

          <Link to={`/auth?redirect=/invite/${token}`} className="text-sm text-gray-500 dark:text-gray-400 underline">
            {t('invite.signUpToJoin')}
          </Link>
        </div>

        <div className="pt-6 text-center">
          <Link to="/about" className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">About</Link>
        </div>

        <GuestGoingModal
          open={showGoingForm}
          onClose={() => setShowGoingForm(false)}
          statusId={info.status.id}
          hostName={info.inviter.display_name}
          onSuccess={({ signalId, note }) => {
            const data = { signalId, statusId: info.status!.id };
            localStorage.setItem('dropby_guest_rsvp', JSON.stringify(data));
            setGuestRsvp({ signalId });
            if (note) setGuestNote(note);
            setShowGoingForm(false);
          }}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white dark:bg-gray-950">
      <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
        {t('invite.goHome')}
      </Link>
    </div>
  );
}

function GuestGoingModal({ open, onClose, statusId, hostName, onSuccess }: { open: boolean; onClose: () => void; statusId: string; hostName: string; onSuccess: (data: { signalId: string; note?: string }) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('invite.nameRequired')); return; }
    setLoading(true);
    try {
      const result = await goingApi.sendGuest(statusId, {
        name: name.trim(),
        contact: contact.trim() || undefined,
        marketing_consent: consent,
        note: note.trim() || undefined,
      });
      onSuccess({ signalId: result.signal_id, note: note.trim() || undefined });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('invite.goingModalTitle')}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder={t('invite.firstName')}
          required
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
        />
        <input
          type="text"
          placeholder={t('invite.emailOrPhoneOptional')}
          value={contact}
          onChange={e => { setContact(e.target.value); if (!e.target.value) setConsent(false); }}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
        />
        {contact && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('invite.sendMeAppLink')}</span>
          </label>
        )}
        <input
          type="text"
          placeholder={t('invite.notePlaceholder')}
          value={note}
          onChange={e => setNote(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base dark:text-gray-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-400"
        />
        {note.trim() && (
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('invite.noteDisclaimer', { name: hostName })}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {loading ? t('invite.sending') : t('invite.onMyWay')}
        </button>
      </form>
    </Modal>
  );
}
