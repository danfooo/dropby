import { useEffect, useRef } from 'react';
import { useMyStatus } from '../queries';
import { endLiveActivity, listenForLiveActivityTokens, liveActivitySupported, syncLiveActivity } from '../utils/liveActivity';

// Keeps the iOS Live Activity in step with the user's own door while the app is open.
export function useLiveActivity(signedIn: boolean) {
  const on = signedIn && liveActivitySupported();
  const { data: status, isSuccess } = useMyStatus({ enabled: on });
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!on) return;
    return listenForLiveActivityTokens();
  }, [on]);

  useEffect(() => {
    // Signing out clears it. (Not a cold start: the user just isn't loaded yet.)
    if (!signedIn && wasSignedIn.current) endLiveActivity();
    wasSignedIn.current = signedIn;
  }, [signedIn]);

  useEffect(() => {
    if (on && isSuccess) syncLiveActivity(status ?? null);
  }, [on, isSuccess, status]);
}
