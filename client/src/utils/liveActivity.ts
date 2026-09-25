import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Status } from '@dropby/shared';
import { statusApi } from '../api';

// The iOS Live Activity for the user's own open door (Lock Screen + Dynamic Island).
// Native side: ios/App/App/LiveActivityPlugin.swift. Once started, the server keeps it
// current through its push token, so it stays right while the app is closed.

interface LiveActivityPlugin {
  sync(door: {
    statusId: string;
    closesAt: number;
    note: string | null;
    location: string | null;
    going: string[];
    goingCount: number;
  }): Promise<{ active: boolean }>;
  endAll(): Promise<void>;
  addListener(event: 'pushToken', cb: (e: { statusId: string; token: string }) => void): Promise<PluginListenerHandle>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

// Names shown on the activity; matches the server (server/src/services/live-activity.ts).
const MAX_NAMES = 3;

export const liveActivitySupported = () => Capacitor.getPlatform() === 'ios';

// Show this door on the Lock Screen, or clear it when there is none. Builds from before
// the plugin existed reject every call, so failures are ignored.
export function syncLiveActivity(status: Status | null) {
  if (!liveActivitySupported()) return;
  const open = status && !status.closed_at && status.closes_at > Date.now() / 1000;
  if (!open) {
    LiveActivity.endAll().catch(() => {});
    return;
  }
  const names = status.going_signals.map(g => g.name);
  LiveActivity.sync({
    statusId: status.id,
    closesAt: status.closes_at,
    note: status.note,
    location: status.location,
    going: names.slice(0, MAX_NAMES),
    goingCount: names.length,
  }).catch(() => {});
}

export function endLiveActivity() {
  if (!liveActivitySupported()) return;
  LiveActivity.endAll().catch(() => {});
}

// Hand each activity's push token to the server as iOS issues it.
export function listenForLiveActivityTokens(): () => void {
  if (!liveActivitySupported()) return () => {};
  let handle: PluginListenerHandle | undefined;
  let removed = false;
  LiveActivity.addListener('pushToken', ({ statusId, token }) => {
    statusApi.liveActivityToken(statusId, token).catch(() => {});
  }).then(h => {
    if (removed) h.remove();
    else handle = h;
  }).catch(() => {});
  return () => {
    removed = true;
    handle?.remove();
  };
}
