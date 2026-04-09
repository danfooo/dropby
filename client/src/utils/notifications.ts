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
    // 'tap' is the default action (user tapped the notification body, not a button)
    if (actionId === 'tap') return;
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
