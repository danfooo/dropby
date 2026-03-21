import { useEffect, useState } from 'react';
import { api } from '../api';

interface WeekSlice {
  signups: number;
  active_users: number;
  door_opens: number;
  doors_with_going: number;
  push_fails: number;
}

interface Metrics {
  weekly: { this_week: WeekSlice; last_week: WeekSlice };
  funnel: {
    window_days: number;
    auth_page_views: number;
    signups: number;
    verifies: number;
    first_door: number;
    got_going: number;
  };
  invite_funnel: {
    window_days: number;
    views: number;
    views_with_live_door: number;
    guest_goings: number;
    accepted: number;
  };
  push_effectiveness: {
    nudge:          { sent: number; opened_door: number };
    auto_nudge:     { sent: number; opened_door: number };
    door_open_push: { sent: number; going_sent: number };
  };
  push_alarms: {
    fails_24h: number;
    recent: Array<{ ts: number; type: string; platform: string; error: string }>;
  };
}

function pct(n: number, of: number) {
  if (!of) return '—';
  return `${Math.round((n / of) * 100)}%`;
}

function delta(now: number, prev: number) {
  if (prev === 0) return now > 0 ? <span className="text-emerald-600 text-xs ml-1">new</span> : null;
  const d = now - prev;
  if (d === 0) return null;
  return (
    <span className={`text-xs ml-1 ${d > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {d > 0 ? '+' : ''}{d}
    </span>
  );
}

function MetricCard({ label, value, prev }: { label: string; value: number; prev: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">
        {value}
        {delta(value, prev)}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{prev} last week</div>
    </div>
  );
}

function FunnelStep({ label, count, prevCount, note }: { label: string; count: number; prevCount: number | null; note?: string }) {
  const drop = prevCount !== null && prevCount > 0
    ? Math.round(((prevCount - count) / prevCount) * 100)
    : null;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1">
        <span className="text-sm text-gray-800">{label}</span>
        {note && <span className="text-xs text-gray-400 ml-1">({note})</span>}
      </div>
      <div className="text-sm font-medium text-gray-900 w-12 text-right">{count}</div>
      {drop !== null && (
        <div className={`text-xs w-16 text-right ${drop > 50 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {drop > 0 ? `−${drop}% drop` : 'no drop'}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<'forbidden' | 'error' | null>(null);

  useEffect(() => {
    api.get('/admin/metrics')
      .then(r => setMetrics(r.data))
      .catch(err => {
        setError(err.response?.status === 403 ? 'forbidden' : 'error');
      });
  }, []);

  if (error === 'forbidden') {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 text-sm">
        Access denied.
      </div>
    );
  }

  if (error === 'error') {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 text-sm">
        Failed to load metrics.
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { weekly, funnel, invite_funnel: inv, push_effectiveness: pe, push_alarms } = metrics;
  const tw = weekly.this_week;
  const lw = weekly.last_week;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>

      {/* Weekly pulse */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          This week vs last week
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard label="Signups" value={tw.signups} prev={lw.signups} />
          <MetricCard label="Active users" value={tw.active_users} prev={lw.active_users} />
          <MetricCard label="Door opens" value={tw.door_opens} prev={lw.door_opens} />
          <MetricCard label="Doors with going" value={tw.doors_with_going} prev={lw.doors_with_going} />
          {(tw.push_fails > 0 || lw.push_fails > 0) && (
            <MetricCard label="Push failures" value={tw.push_fails} prev={lw.push_fails} />
          )}
        </div>
        {tw.door_opens > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {pct(tw.doors_with_going, tw.door_opens)} of doors got a going signal this week
          </p>
        )}
      </section>

      {/* Signup funnel */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Signup funnel — last {funnel.window_days} days
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          From first contact to realising value. Each row shows drop-off from the step above.
        </p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 px-4">
          <FunnelStep label="Auth page viewed with signup intent" count={funnel.auth_page_views} prevCount={null} />
          <FunnelStep label="Signup submitted" count={funnel.signups} prevCount={funnel.auth_page_views} />
          <FunnelStep label="Email verified" count={funnel.verifies} prevCount={funnel.signups} />
          <FunnelStep label="First door opened" count={funnel.first_door} prevCount={funnel.verifies} note="from signup cohort" />
          <FunnelStep label="Received a going signal" count={funnel.got_going} prevCount={funnel.first_door} note="from signup cohort" />
        </div>
      </section>

      {/* Invite funnel */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Invite funnel — last {inv.window_days} days
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          Views with a live door convert much better — that split tells you whether the invite timing problem is real.
        </p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50 px-4">
          <FunnelStep label="Invite link viewed" count={inv.views} prevCount={null} />
          <FunnelStep label="↳ with host door open" count={inv.views_with_live_door} prevCount={inv.views} />
          <FunnelStep label="Guest going signal sent" count={inv.guest_goings} prevCount={inv.views_with_live_door} note="no account needed" />
          <FunnelStep label="Friendship accepted" count={inv.accepted} prevCount={inv.views} />
        </div>
      </section>

      {/* Notification effectiveness */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Notification effectiveness — last {funnel.window_days} days
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          Only tracked for notifications where a follow-on action proves the push worked.
        </p>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {[
            {
              label: 'Nudge → door opened within 4h',
              sent: pe.nudge.sent,
              converted: pe.nudge.opened_door,
            },
            {
              label: 'Auto-nudge → door opened within 4h',
              sent: pe.auto_nudge.sent,
              converted: pe.auto_nudge.opened_door,
            },
            {
              label: 'Door-open push → going sent within 2h',
              sent: pe.door_open_push.sent,
              converted: pe.door_open_push.going_sent,
            },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 text-sm text-gray-800">{row.label}</div>
              <div className="text-xs text-gray-400">{row.sent} sent</div>
              <div className={`text-sm font-medium w-10 text-right ${
                row.sent > 0 && row.converted / row.sent < 0.1 ? 'text-red-500' : 'text-gray-900'
              }`}>
                {pct(row.converted, row.sent)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Push alarms */}
      {push_alarms.fails_24h > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">
            Push failures — last 24h ({push_alarms.fails_24h})
          </h2>
          <div className="bg-white rounded-xl border border-red-100 shadow-sm divide-y divide-red-50">
            {push_alarms.recent.map((f, i) => (
              <div key={i} className="px-4 py-2 text-xs text-gray-600">
                <span className="text-gray-400 mr-2">{new Date(f.ts * 1000).toLocaleTimeString()}</span>
                <span className="font-medium mr-2">{f.type}</span>
                <span className="text-gray-400 mr-2">{f.platform}</span>
                <span className="text-red-500">{f.error}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
