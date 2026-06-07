import { Capacitor } from '@capacitor/core';
import { authApi, friendsApi, goingApi, statusApi } from '../api';

let listenersSetup = false;
let lastToken: string | null = null;

// Persist auth token so native iOS code can access it for background notification actions
export function syncAuthTokenToNative() {
  if (!Capacitor.isNativePlatform()) return;
  const token = localStorage.getItem('token');
  try {
    import('@capacitor/preferences').then(({ Preferences }) => {
      if (token) Preferences.set({ key: 'auth_token', value: token });
      else Preferences.remove({ key: 'auth_token' });
    });
  } catch {}
}

async function handleNotificationAction(actionId: string, data: Record<string, string>) {
  const type = data?.type;

  if (actionId === 'open_now' && (type === 'nudge' || type === 'auto_nudge')) {
    // Actually open the door with last selection, then show /home
    try { await statusApi.quickOpen(); }
    catch (e) { console.warn('[Push] Failed to quick-open', e); }
    window.location.href = '/home';
    return;
  }

  if (actionId === 'going' && type === 'door_open' && data.statusId) {
    try { await goingApi.send(data.statusId); }
    catch (e) { console.warn('[Push] Failed to mark as going', e); }
    return;
  }

  if (actionId === 'mute_3d' && type === 'door_open' && data.openerUserId) {
    try { await friendsApi.hide(data.openerUserId, 3); }
    catch (e) { console.warn('[Push] Failed to mute friend', e); }
    return;
  }

  if (actionId === 'mute_forever' && type === 'door_open' && data.openerUserId) {
    try { await friendsApi.hide(data.openerUserId); }
    catch (e) { console.warn('[Push] Failed to mute friend', e); }
    return;
  }
}

async function setupListeners() {
  if (listenersSetup) return;
  listenersSetup = true;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  PushNotifications.addListener('registration', async ({ value: token }) => {
    lastToken = token;
    try { await authApi.registerPushToken(token, Capacitor.getPlatform() as 'ios' | 'android'); }
    catch (e) { console.warn('[Push] Failed to register token', e); }
  });
  PushNotifications.addListener('registrationError', (err) => {
    console.warn('[Push] Registration error', err);
  });
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    const actionId = notification.actionId;
    const data = notification.notification?.data ?? {};
    if (actionId === 'tap') {
      if (data.type === 'friend_joined') window.location.href = '/friends';
      return;
    }
    handleNotificationAction(actionId, data);
  });
}

export async function deregisterPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await authApi.deregisterPushToken(lastToken ?? undefined);
    lastToken = null;
  } catch (e) {
    console.warn('[Push] Failed to deregister token', e);
  }
}

const DENIED_SNOOZE_KEY = 'dropby_notif_denied_snooze';
const SNOOZE_DAYS = [5, 7, 13];

// Returns true if the denied-notifications modal should be shown
export async function shouldShowDeniedPrompt(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { receive } = await PushNotifications.checkPermissions();
    if (receive !== 'denied') return false;
    const stored = localStorage.getItem(DENIED_SNOOZE_KEY);
    if (!stored) return true;
    const { until } = JSON.parse(stored) as { level: number; until: number };
    return Math.floor(Date.now() / 1000) >= until;
  } catch {
    return false;
  }
}

// Records a "don't show this" tap, applying the increasing snooze schedule
export function snoozeDeniedPrompt(): void {
  const stored = localStorage.getItem(DENIED_SNOOZE_KEY);
  const current: { level: number; until: number } = stored
    ? JSON.parse(stored)
    : { level: 0, until: 0 };
  const days = SNOOZE_DAYS[current.level];
  const until = Math.floor(Date.now() / 1000) + days * 86400;
  const newLevel = Math.min(current.level + 1, SNOOZE_DAYS.length - 1);
  localStorage.setItem(DENIED_SNOOZE_KEY, JSON.stringify({ level: newLevel, until }));
}

// Opens the iOS system settings page for this app
export function openNotificationSettings(): void {
  if (!Capacitor.isNativePlatform()) return;
  window.open('app-settings:', '_system');
}

// Returns true if the interstitial should be shown (permission not yet decided)
export async function shouldShowNotifPrompt(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { receive } = await PushNotifications.checkPermissions();
    return receive === 'prompt' || receive === 'prompt-with-rationale';
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await setupListeners();
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;
    await PushNotifications.register();
  } catch (e) {
    console.warn('[Push] Setup error', e);
  }
}

// For existing users logging in on a new device: request permission immediately if they have friends
export async function requestPermissionIfHasFriends(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const shouldPrompt = await shouldShowNotifPrompt();
  if (!shouldPrompt) return;
  try {
    const friends = await friendsApi.list();
    if ((friends as any[]).length > 0) await requestNotificationPermission();
  } catch {}
}

export async function reRegisterIfPermitted(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') return;
    await setupListeners();
    await PushNotifications.register();
  } catch (e) {
    console.warn('[Push] Re-registration error', e);
  }
}
