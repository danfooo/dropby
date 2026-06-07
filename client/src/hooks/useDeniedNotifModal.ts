import { useState, useCallback, useEffect, useRef } from 'react';
import { shouldShowDeniedPrompt, snoozeDeniedPrompt, openNotificationSettings } from '../utils/notifications';

export function useDeniedNotifModal() {
  const [open, setOpen] = useState(false);
  const showTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(showTimeout.current), []);

  // Call after a key action (or state change) completes. Never blocks the
  // action — just nudges, delayed so the user notices the result first.
  // Use for actions that are valuable on their own (door open, going, friendship).
  const check = useCallback(async () => {
    if (await shouldShowDeniedPrompt()) {
      clearTimeout(showTimeout.current);
      showTimeout.current = setTimeout(() => setOpen(true), 500);
    }
  }, []);

  // Gate: shows the modal immediately and returns true if it was shown, so the
  // caller can skip its action. Use for actions that are pointless without
  // notification permission (e.g. setting up a reminder), where proceeding
  // would also stack a second modal on top of this one.
  const checkBeforeAction = useCallback(async (): Promise<boolean> => {
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
    openNotificationSettings();
    setOpen(false);
  }, []);

  return { open, check, checkBeforeAction, dismiss, snooze, goToSettings };
}
