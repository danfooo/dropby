import { useState, useCallback } from 'react';
import { shouldShowDeniedPrompt, snoozeDeniedPrompt, openNotificationSettings } from '../utils/notifications';

export function useDeniedNotifModal() {
  const [open, setOpen] = useState(false);

  // Call after a key action completes. Never blocks the action — just nudges,
  // delayed so the user notices the action's result before the modal appears.
  const check = useCallback(() => {
    void (async () => {
      if (await shouldShowDeniedPrompt()) {
        setTimeout(() => setOpen(true), 500);
      }
    })();
  }, []);

  const dismiss = useCallback(() => setOpen(false), []);

  const snooze = useCallback(() => {
    snoozeDeniedPrompt();
    setOpen(false);
  }, []);

  const goToSettings = useCallback(async () => {
    openNotificationSettings();
    setOpen(false);
  }, []);

  return { open, check, dismiss, snooze, goToSettings };
}
