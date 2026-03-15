import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useAuthStore } from '../stores/auth';
import { invitesApi, goingApi } from '../api';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { copyText } from '../utils/clipboard';

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
  const [expiredInviter, setExpiredInviter] = useState<{ display_name: string } | null>(null);
  const [inviteBackCopied, setInviteBackCopied] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptedName, setAcceptedName] = useState('');
  const [showGoingForm, setShowGoingForm] = useState(false);
  const [goingDone, setGoingDone] = useState(false);

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

  // Auto-accept for logged-in users
  useEffect(() => {
    if (!info || !user || accepted) return;

    if (info.isSelf) {
      setAccepted(true);
      return;
    }

    if (!info.alreadyFriends) {
      invitesApi.accept(token!)
        .then(res => {
          setAccepted(true);
          setAcceptedName(res.inviterName || info.inviter?.display_name || '');
        })
        .catch(() => setError('INVALID'));
    } else {
      setAccepted(true);
    }
  }, [info, user]);

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
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <p className="text-5xl mb-4">⏰</p>
        <h1 className="text-xl font-bold mb-2">{t('invite.expiredTitle')}</h1>
        <p className="text-gray-500 mb-8">{t('invite.expiredDesc', { ago: agoText })}</p>
        <button
          onClick={handleInviteBack}
          className="w-full max-w-xs bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-semibold mb-3"
        >
          {inviteBackCopied ? t('invite.inviteBackCopied') : t('invite.inviteBackCta', { name: inviterName })}
        </button>
        <Link to="/home" className="text-sm text-gray-500 hover:text-gray-700">
          {t('invite.goHome')}
        </Link>
      </div>
    );
  }

  if (error === 'INVALID' || !info) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <p className="text-5xl mb-4">🤔</p>
        <h1 className="text-xl font-bold mb-2">{t('invite.invalidTitle')}</h1>
        <p className="text-gray-500 mb-8">{t('invite.invalidDesc')}</p>
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
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
          <p className="text-5xl mb-4">😄</p>
          <h1 className="text-xl font-bold mb-2">{t('invite.ownLinkTitle')}</h1>
          <p className="text-gray-500 mb-8">{t('invite.ownLinkDesc')}</p>
          <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
            {t('invite.goHome')}
          </Link>
        </div>
      );
    }

    if (info.alreadyFriends) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
          <p className="text-5xl mb-4">👋</p>
          <h1 className="text-xl font-bold mb-2">{t('invite.alreadyFriendsTitle')}</h1>
          {info.status ? (
            <>
              <p className="text-gray-600 mb-6">
                {info.status.note
                  ? t('invite.doorOpenWithNote', { name: info.inviter.display_name, note: info.status.note })
                  : t('invite.doorOpen', { name: info.inviter.display_name })}
              </p>
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
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <p className="text-5xl mb-4">🎉</p>
        <h1 className="text-xl font-bold mb-2">{t('invite.friendsNowTitle')}</h1>
        <p className="text-gray-500 mb-6">{t('invite.friendsNowDesc', { name: acceptedName })}</p>
        {info.status && (
          <div className="w-full max-w-xs bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6 text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-emerald-800">{t('invite.doorOpen', { name: acceptedName })}</span>
            </div>
            {info.status.note && (
              <p className="text-sm text-emerald-700 ml-4">{info.status.note}</p>
            )}
          </div>
        )}
        <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
          {info.status ? t('invite.doorOpenCta') : t('invite.hurray')}
        </Link>
      </div>
    );
  }

  // Not logged in, door open or scheduled: show door card
  if (!user && info.status) {
    const isScheduled = info.status.starts_at && info.status.starts_at > Math.floor(Date.now() / 1000);
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm text-center">
          <Avatar name={info.inviter.display_name} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">{info.inviter.display_name}</h1>
          {isScheduled ? (
            <p className="text-violet-600 font-semibold mb-1 mt-1">
              🕐 {formatScheduledTime(info.status.starts_at, info.status.ends_at)}
            </p>
          ) : (
            <p className="text-gray-500 mb-1">{t('invite.hasTheirDoorOpen')}</p>
          )}
          {info.status.note && (
            <p className="text-lg font-medium text-gray-800 mb-4">"{info.status.note}"</p>
          )}

          {goingDone ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-6">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-emerald-800">{t('invite.theyKnowYoureComing')}</p>
              <p className="text-sm text-emerald-600 mt-1">{t('invite.weNotifiedThem', { name: info.inviter.display_name })}</p>
            </div>
          ) : (
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setShowGoingForm(true)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-semibold text-base"
              >
                {t('invite.rsvpGoing')}
              </button>
              <button
                onClick={() => setShowGoingForm(true)}
                className="flex-1 bg-amber-400 hover:bg-amber-500 text-white py-4 rounded-2xl font-semibold text-base"
                data-rsvp="maybe"
              >
                {t('invite.rsvpMaybe')}
              </button>
            </div>
          )}

          <Link to={`/auth?redirect=/invite/${token}`} className="text-sm text-gray-500 underline">
            {t('invite.signUpToJoin')}
          </Link>
        </div>

        <GuestGoingModal
          open={showGoingForm}
          onClose={() => setShowGoingForm(false)}
          statusId={info.status.id}
          isScheduled={!!isScheduled}
          onSuccess={() => { setGoingDone(true); setShowGoingForm(false); }}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
      <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">
        {t('invite.goHome')}
      </Link>
    </div>
  );
}

function GuestGoingModal({ open, onClose, statusId, isScheduled, onSuccess }: { open: boolean; onClose: () => void; statusId: string; isScheduled: boolean; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [rsvp, setRsvp] = useState<'going' | 'maybe'>('going');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('invite.nameRequired')); return; }
    setLoading(true);
    try {
      await goingApi.sendGuest(statusId, {
        name: name.trim(),
        contact: contact.trim() || undefined,
        marketing_consent: consent,
        rsvp,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isScheduled ? t('invite.rsvpModalTitle') : t('invite.goingModalTitle')}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        {isScheduled && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRsvp('going')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                rsvp === 'going' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {t('invite.rsvpGoing')}
            </button>
            <button
              type="button"
              onClick={() => setRsvp('maybe')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                rsvp === 'maybe' ? 'bg-amber-400 text-white border-amber-400' : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {t('invite.rsvpMaybe')}
            </button>
          </div>
        )}
        <input
          type="text"
          placeholder={t('invite.firstName')}
          required
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <input
          type="text"
          placeholder={t('invite.emailOrPhoneOptional')}
          value={contact}
          onChange={e => { setContact(e.target.value); if (!e.target.value) setConsent(false); }}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        {contact && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <span className="text-sm text-gray-600">{t('invite.sendMeAppLink')}</span>
          </label>
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
