import { Capacitor } from '@capacitor/core';
import { authApi } from '../api';

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
