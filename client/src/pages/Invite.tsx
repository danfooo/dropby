import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../stores/auth';
import { invitesApi, goingApi } from '../api';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'INVALID' | 'EXPIRED' | null>(null);
  const [expiredAgo, setExpiredAgo] = useState(0);
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

  // Redirect not-logged-in users when door is closed
  useEffect(() => {
    if (info && !user && !info.status) {
      navigate(`/auth?redirect=/invite/${token}`, { replace: true });
    }
  }, [info, user]);

  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error === 'EXPIRED') {
    const agoText = expiredAgo >= 3600
      ? `${Math.floor(expiredAgo / 3600)} hour${Math.floor(expiredAgo / 3600) === 1 ? '' : 's'} ago`
      : `${Math.floor(expiredAgo / 60)} minutes ago`;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <p className="text-5xl mb-4">⏰</p>
        <h1 className="text-xl font-bold mb-2">Invite expired</h1>
        <p className="text-gray-500 mb-8">This invite expired {agoText}.</p>
        <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">Go home</Link>
      </div>
    );
  }

  if (error === 'INVALID' || !info) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <p className="text-5xl mb-4">🤔</p>
        <h1 className="text-xl font-bold mb-2">Invalid invite</h1>
        <p className="text-gray-500 mb-8">This invite link is invalid.</p>
        <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">Go home</Link>
      </div>
    );
  }

  // Logged-in: show accepted state
  if (user && accepted) {
    if (info.isSelf) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
          <p className="text-5xl mb-4">😄</p>
          <h1 className="text-xl font-bold mb-2">That's your own link!</h1>
          <p className="text-gray-500 mb-8">Share it with friends to let them join Drop By.</p>
          <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">Go home</Link>
        </div>
      );
    }

    if (info.alreadyFriends) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
          <p className="text-5xl mb-4">👋</p>
          <h1 className="text-xl font-bold mb-2">Already friends!</h1>
          {info.status ? (
            <>
              <p className="text-gray-600 mb-6">{info.inviter.display_name} has their door open{info.status.note ? `: "${info.status.note}"` : '.'}</p>
              <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">See their status</Link>
            </>
          ) : (
            <Link to="/home" className="mt-6 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">Go home</Link>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <p className="text-5xl mb-4">🎉</p>
        <h1 className="text-xl font-bold mb-2">You're now friends!</h1>
        <p className="text-gray-500 mb-8">You and {acceptedName} are now friends on Drop By.</p>
        <Link to="/home" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">Go home</Link>
      </div>
    );
  }

  // Not logged in, door open: show door card
  if (!user && info.status) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm text-center">
          <Avatar name={info.inviter.display_name} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">{info.inviter.display_name}</h1>
          <p className="text-gray-500 mb-1">has their door open</p>
          {info.status.note && (
            <p className="text-lg font-medium text-gray-800 mb-4">"{info.status.note}"</p>
          )}

          {goingDone ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-6">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-emerald-800">They know you're coming!</p>
            </div>
          ) : (
            <button
              onClick={() => setShowGoingForm(true)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-semibold text-lg mb-4"
            >
              Going ✅
            </button>
          )}

          <Link to={`/auth?redirect=/invite/${token}`} className="text-sm text-gray-500 underline">
            Sign up / Log in to fully join Drop By
          </Link>
        </div>

        <GuestGoingModal
          open={showGoingForm}
          onClose={() => setShowGoingForm(false)}
          statusId={info.status.id}
          onSuccess={() => { setGoingDone(true); setShowGoingForm(false); }}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
      <Link to="/" className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold">Go home</Link>
    </div>
  );
}

function GuestGoingModal({ open, onClose, statusId, onSuccess }: { open: boolean; onClose: () => void; statusId: string; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    try {
      await goingApi.sendGuest(statusId, {
        name: name.trim(),
        contact: contact.trim() || undefined,
        marketing_consent: consent,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Say you're going">
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="First name *"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <input
          type="text"
          placeholder="Email or phone (optional)"
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
            <span className="text-sm text-gray-600">Send me a link to the app</span>
          </label>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {loading ? 'Sending…' : "I'm on my way! 🏃"}
        </button>
      </form>
    </Modal>
  );
}
