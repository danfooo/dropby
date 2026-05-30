import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { reRegisterIfPermitted, requestPermissionIfHasFriends } from '../utils/notifications';

export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    reRegisterIfPermitted();
    // Existing user on a new device: prompt if permission not yet decided and they have friends
    requestPermissionIfHasFriends();

    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | undefined;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) reRegisterIfPermitted();
      }).then(handle => {
        cleanup = () => handle.remove();
      });
    });
    return () => { cleanup?.(); };
  }, [enabled]);
}
