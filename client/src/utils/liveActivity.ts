import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Status } from '@dropby/shared';

// The iOS Live Activity for the user's own open door (Lock Screen + Dynamic Island).
// Native side: ios/App/App/LiveActivityPlugin.swift. Native code sends its push tokens
// to the server itself (DoorActivityCenter.swift), so the server can keep it current
// while the app is closed — and, on iOS 17.2+, start it without the app.

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
  resendTokens(): Promise<void>;
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

// Native code signs its uploads with the token mirrored into Preferences; call once that
// is written, so tokens issued while signed out reach the server.
export function resendLiveActivityTokens() {
  if (!liveActivitySupported()) return;
  LiveActivity.resendTokens().catch(() => {});
}
