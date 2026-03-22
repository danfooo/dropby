import { Capacitor } from '@capacitor/core';
import { authApi } from '../api';

export const NOTIF_ASKED_KEY = 'dropby_notif_asked';

export function hasAskedNotifications(): boolean {
  return localStorage.getItem(NOTIF_ASKED_KEY) === '1';
}

let listenersSetup = false;

async function setupListeners() {
  if (listenersSetup) return;
  listenersSetup = true;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  PushNotifications.addListener('registration', async ({ value: token }) => {
    try { await authApi.registerPushToken(token, Capacitor.getPlatform() as 'ios' | 'android'); }
    catch (e) { console.warn('[Push] Failed to register token', e); }
  });
  PushNotifications.addListener('registrationError', (err) => {
    console.warn('[Push] Registration error', err);
  });
}

export async function requestNotificationPermission(): Promise<void> {
  localStorage.setItem(NOTIF_ASKED_KEY, '1');
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
  if (!Capacitor.isNativePlatform() || !hasAskedNotifications()) return;
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
