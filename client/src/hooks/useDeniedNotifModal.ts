import { useState, useCallback } from 'react';
import { shouldShowDeniedPrompt, snoozeDeniedPrompt, openNotificationSettings } from '../utils/notifications';

export function useDeniedNotifModal() {
  const [open, setOpen] = useState(false);

  // Call at a key moment. Returns true if the modal was shown (caller should abort its action).
  const check = useCallback(async (): Promise<boolean> => {
    const denied = await shouldShowDeniedPrompt();
    if (denied) setOpen(true);
    return denied;
  }, []);

  const dismiss = useCallback(() => setOpen(false), []);

  const snooze = useCallback(() => {
    snoozeDeniedPrompt();
    setOpen(false);
  }, []);

  const goToSettings = useCallback(async () => {
    await openNotificationSettings();
    setOpen(false);
  }, []);

  return { open, check, dismiss, snooze, goToSettings };
}
