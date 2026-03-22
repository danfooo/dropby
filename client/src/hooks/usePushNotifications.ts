import { useEffect } from 'react';
import { reRegisterIfPermitted } from '../utils/notifications';

export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    reRegisterIfPermitted();
  }, [enabled]);
}
