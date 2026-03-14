import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { authApi } from '../api';

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform() as 'ios' | 'android';

    let removed = false;

    PushNotifications.requestPermissions().then(result => {
      if (removed) return;
      if (result.receive === 'granted') {
        PushNotifications.register();
      }
    });

    const registrationPromise = PushNotifications.addListener('registration', token => {
      authApi.registerPushToken(token.value, platform).catch(() => {});
    });

    return () => {
      removed = true;
      registrationPromise.then(l => l.remove());
    };
  }, [userId]);
}
