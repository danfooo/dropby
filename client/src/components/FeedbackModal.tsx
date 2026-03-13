import { useState } from 'react';
import Modal from './Modal';
import { feedbackApi } from '../api';
import { useAuthStore } from '../stores/auth';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: Props) {
  const { user } = useAuthStore();
  const [type, setType] = useState<'thought' | 'bug'>('thought');
  const [message, setMessage] = useState('');
  const [wantsReply, setWantsReply] = useState(false);
  const [replyEmail, setReplyEmail] = useState(user?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    onClose();
    // Reset after close animation
    setTimeout(() => {
      setType('thought');
      setMessage('');
      setWantsReply(false);
      setReplyEmail(user?.email ?? '');
      setSubmitted(false);
    }, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    try {
      await feedbackApi.submit({
        type,
        message,
        reply_email: wantsReply ? replyEmail : undefined,
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      {submitted ? (
        <div className="text-center py-4">
          <div className="text-4xl mb-3">💌</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Thanks for sharing</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your feedback goes straight to the people building Drop By. It matters.
          </p>
          <button
            onClick={handleClose}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Share feedback</h2>

          {/* Type selector */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setType('thought')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                type === 'thought'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              How it's going
            </button>
            <button
              type="button"
              onClick={() => setType('bug')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                type === 'bug'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Report a bug
            </button>
          </div>

          {/* Message */}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={
              type === 'thought'
                ? "Is Drop By helping you make plans with people? What's working, what isn't?"
                : 'What happened? What were you trying to do?'
            }
            rows={4}
            maxLength={1000}
            required
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none mb-4"
          />

          {/* Follow-up opt-in */}
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wantsReply}
              onChange={e => {
                setWantsReply(e.target.checked);
                if (e.target.checked && !replyEmail) setReplyEmail(user?.email ?? '');
              }}
              className="mt-0.5 w-4 h-4 rounded accent-emerald-500"
            />
            <span className="text-sm text-gray-600">You can reach me for follow-up</span>
          </label>

          {wantsReply && (
            <input
              type="email"
              value={replyEmail}
              onChange={e => setReplyEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-4"
            />
          )}

          <button
            type="submit"
            disabled={loading || !message.trim()}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {loading ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      )}
    </Modal>
  );
}
