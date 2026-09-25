import { useQuery, type QueryClient } from '@tanstack/react-query';
import { statusApi, friendsApi, notesApi, nudgesApi, invitesApi, goingApi } from './api';

// Every server-state cache key in one place. Screens use the hooks below instead of
// spelling keys out, so a refetch after a change can't miss a screen because of a typo.
export const queryKeys = {
  myStatus: ['myStatus'],
  friendStatuses: ['friendStatuses'],
  upcomingSessions: ['upcomingSessions'],
  friends: ['friends'],
  notes: ['notes'],
  nudges: ['nudges'],
  everReceived: ['everReceived'],
  pendingInvites: ['pending-invites'],
  incomingInvites: ['incoming-invites'],
  openLinks: ['open-links'],
  friendSuggestions: ['friend-suggestions'],
} as const;

// Options a screen may tune: how often it polls, how long a cached value is fresh, or
// whether to fetch at all.
interface Freshness { refetchInterval?: number; staleTime?: number; enabled?: boolean }

export const useMyStatus = (opts: Freshness = {}) =>
  useQuery({ queryKey: queryKeys.myStatus, queryFn: statusApi.get, ...opts });

export const useFriendStatuses = (opts: Freshness = {}) =>
  useQuery({ queryKey: queryKeys.friendStatuses, queryFn: statusApi.getFriends, ...opts });

export const useUpcomingSessions = (opts: Freshness = {}) =>
  useQuery({ queryKey: queryKeys.upcomingSessions, queryFn: statusApi.getUpcoming, ...opts });

export const useFriends = () => useQuery({ queryKey: queryKeys.friends, queryFn: friendsApi.list });
export const useSavedNotes = () => useQuery({ queryKey: queryKeys.notes, queryFn: notesApi.list });
export const useNudges = () => useQuery({ queryKey: queryKeys.nudges, queryFn: nudgesApi.list });
export const useEverReceived = () => useQuery({ queryKey: queryKeys.everReceived, queryFn: goingApi.everReceived });
export const usePendingInvites = () => useQuery({ queryKey: queryKeys.pendingInvites, queryFn: invitesApi.listPending });
export const useIncomingInvites = () => useQuery({ queryKey: queryKeys.incomingInvites, queryFn: invitesApi.listIncoming });
export const useOpenLinks = () => useQuery({ queryKey: queryKeys.openLinks, queryFn: invitesApi.listOpenLinks });
export const useFriendSuggestions = () => useQuery({ queryKey: queryKeys.friendSuggestions, queryFn: friendsApi.suggestions });

// Mark cached data stale after a change, by name: invalidate(qc, 'myStatus', 'friends').
export function invalidate(qc: QueryClient, ...keys: Array<keyof typeof queryKeys>) {
  for (const k of keys) qc.invalidateQueries({ queryKey: queryKeys[k] });
}
