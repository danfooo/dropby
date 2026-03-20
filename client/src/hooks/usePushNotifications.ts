import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { authApi } from '../api';

export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;

    let cancelled = false;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== 'granted') return;

        await PushNotifications.register();

        PushNotifications.addListener('registration', async ({ value: token }) => {
          if (cancelled) return;
          try {
            await authApi.registerPushToken(token, 'android');
          } catch (e) {
            console.warn('[Push] Failed to register token', e);
          }
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.warn('[Push] Registration error', err);
        });
      } catch (e) {
        console.warn('[Push] Setup error', e);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);
}
