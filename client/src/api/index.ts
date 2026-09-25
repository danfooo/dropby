import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import type {
  AuthResult, User, Friend, Status, FriendStatus, SavedNote, NudgeSchedule, Suggestion,
  IncomingInvite, OpenLink, PendingEmailInvite, CreatedInvite,
  CreateStatusBody, UpdateStatusBody, UpdateStatusByIdBody, UpdateMeBody, GuestGoingBody, FeedbackBody,
} from '@dropby/shared';

// On native the page runs at capacitor://localhost (iOS) or https://localhost (Android),
// so server paths have to be absolute. On web they stay relative to the same origin.
// Native apps use our own domain rather than the Fly hostname, so moving hosts never
// needs an app release. (Builds before this used drop-by.fly.dev, which keeps working.)
export const serverOrigin = Capacitor.isNativePlatform() ? 'https://dropby.cc' : '';
export const baseURL = `${serverOrigin}/api`;

export const api = axios.create({ baseURL });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) config.headers['x-timezone'] = tz;
  return config;
});

// The server swaps an old sign-in token for a new one by sending it back in this
// header (server/src/middleware/auth.ts). Whoever owns the auth state listens here.
let sessionTokenListener: ((token: string) => void) | null = null;
export function onSessionToken(listener: (token: string) => void) {
  sessionTokenListener = listener;
}

api.interceptors.response.use(
  r => {
    const replacement = r.headers?.['x-session-token'];
    if (typeof replacement === 'string' && replacement) {
      localStorage.setItem('token', replacement);
      sessionTokenListener?.(replacement);
    }
    return r;
  },
  err => {
    const url: string = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.startsWith('/auth')) {
      localStorage.removeItem('token');
      window.location.href = '/auth';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  me: () => api.get<User>('/auth/me').then(r => r.data),
  signup: (email: string, password: string, display_name?: string, locale?: string, redirect_url?: string, invite_token?: string | null) =>
    api.post('/auth/signup', { email, password, display_name, locale, redirect_url, invite_token }).then(r => r.data),
  login: (email: string, password: string) =>
    api.post<AuthResult>('/auth/login', { email, password }).then(r => r.data),
  google: (credential: string, invite_token?: string | null) =>
    api.post<AuthResult>('/auth/google', { credential, invite_token }).then(r => r.data),
  apple: (identityToken: string, fullName?: { givenName?: string; familyName?: string }, invite_token?: string | null) =>
    api.post<AuthResult>('/auth/apple', { identityToken, fullName, invite_token }).then(r => r.data),
  verifyEmail: (token: string) => api.post<AuthResult>('/auth/verify-email', { token }).then(r => r.data),
  resendVerification: (email: string, redirect_url?: string) => api.post('/auth/resend-verification', { email, redirect_url }).then(r => r.data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }).then(r => r.data),
  resetPassword: (token: string, password: string) => api.post<AuthResult>('/auth/reset-password', { token, password }).then(r => r.data),
  updateMe: (data: UpdateMeBody) => api.put<User>('/auth/me', data).then(r => r.data),
  deleteMe: () => api.delete('/auth/me').then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  // door_live: this Android build draws the open-door notification itself
  // (android/.../DoorNotification.java), so the server sends it door updates.
  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    api.post('/auth/push-token', { token, platform, ...(platform === 'android' && { door_live: true }) }).then(r => r.data),
  deregisterPushToken: (token?: string) =>
    api.delete('/auth/push-token', { data: token ? { token } : undefined }).then(r => r.data),
  uploadAvatar: (blob: Blob) => {
    const form = new FormData();
    form.append('avatar', blob, 'avatar.jpg');
    return api.put<{ avatar_url: string }>('/auth/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  removeAvatar: () => api.delete<User>('/auth/avatar').then(r => r.data),
};

// Friends
export const friendsApi = {
  suggestions: () => api.get<Suggestion[]>('/friends/suggestions').then(r => r.data),
  dismissSuggestions: (userIds: string[]) => api.post('/friends/suggestions/dismiss', { user_ids: userIds }).then(r => r.data),
  connect: (userIds: string[]) => api.post('/friends/connect', { user_ids: userIds }).then(r => r.data),
  list: () => api.get<Friend[]>('/friends').then(r => r.data),
  remove: (friendId: string) => api.delete(`/friends/${friendId}`).then(r => r.data),
  hide: (friendId: string, durationDays?: number) =>
    api.post(`/friends/${friendId}/hide`, durationDays ? { duration_days: durationDays } : {}).then(r => r.data),
  unhide: (friendId: string) => api.delete(`/friends/${friendId}/hide`).then(r => r.data),
  setNotifPref: (friendId: string, pref: 'none' | 'default' | 'all') =>
    api.post(`/friends/${friendId}/notif-pref`, { pref }).then(r => r.data),
};

// Status
export const statusApi = {
  get: () => api.get<Status | null>('/status').then(r => r.data),
  getScheduled: () => api.get<Status | null>('/status/scheduled').then(r => r.data),
  getFriends: () => api.get<FriendStatus[]>('/status/friends').then(r => r.data),
  create: (data: CreateStatusBody) => api.post<Status>('/status', data).then(r => r.data),
  update: (data: UpdateStatusBody) => api.put<Status>('/status', data).then(r => r.data),
  updateById: (id: string, data: UpdateStatusByIdBody) => api.put<Status>(`/status/${id}`, data).then(r => r.data),
  close: () => api.delete('/status').then(r => r.data),
  cancelScheduled: () => api.delete('/status/scheduled').then(r => r.data),
  cancelScheduledById: (id: string) => api.delete(`/status/scheduled/${id}`).then(r => r.data),
  getUpcoming: () => api.get<Status[]>('/status/upcoming').then(r => r.data),
  activate: (statusId: string) => api.post<Status>(`/status/${statusId}/activate`).then(r => r.data),
  prolong: () => api.post<{ closes_at: number }>('/status/prolong').then(r => r.data),
  quickOpen: () => api.post<Status>('/status/quick-open').then(r => r.data),
  setDuration: (minutes: number) => api.post<{ closes_at: number }>('/status/duration', { minutes }).then(r => r.data),
  removeRecipient: (recipientId: string) => api.delete(`/status/recipients/${recipientId}`).then(r => r.data),};

// Invites
export const invitesApi = {
  generate: (statusId?: string, name?: string) =>
    api.post<CreatedInvite>('/invites', { ...(statusId ? { status_id: statusId } : {}), ...(name ? { name } : {}) }).then(r => r.data),
  rename: (token: string, name: string) => api.post(`/invites/${token}/rename`, { name }).then(r => r.data),
  get: (token: string) => api.get(`/invites/${token}`).then(r => r.data),
  accept: (token: string, also?: string[]) => api.post(`/invites/${token}/accept`, also?.length ? { also } : {}).then(r => r.data),
  revoke: (token: string) => api.post(`/invites/${token}/revoke`).then(r => r.data),
  sendByEmail: (email: string) => api.post('/invites/email', { email }).then(r => r.data),
  listPending: () => api.get<PendingEmailInvite[]>('/invites/pending').then(r => r.data),
  listIncoming: () => api.get<IncomingInvite[]>('/invites/incoming').then(r => r.data),
  dismiss: (fromUserIds: string[]) => api.post('/invites/pending/dismiss', { from_user_ids: fromUserIds }).then(r => r.data),
  acceptPending: (fromUserIds: string[]) => api.post('/invites/pending/accept', { from_user_ids: fromUserIds }).then(r => r.data),
  listOpenLinks: () => api.get<OpenLink[]>('/invites/open-links').then(r => r.data),
};

// Going
export const goingApi = {
  everReceived: () => api.get<{ received: boolean }>('/going/ever-received').then(r => r.data),
  send: (statusId: string, note?: string) => api.post(`/going/${statusId}`, { note }).then(r => r.data),
  updateNote: (statusId: string, note: string) => api.patch(`/going/${statusId}`, { note }).then(r => r.data),
  sendGuest: (statusId: string, data: GuestGoingBody) =>
    api.post<{ ok: true; signal_id: string; status_id: string }>(`/going/${statusId}/guest`, data).then(r => r.data),
  patchGuest: (signalId: string, note: string) => api.patch(`/going/guest/${signalId}`, { note }).then(r => r.data),
  remove: (statusId: string) => api.delete(`/going/${statusId}`).then(r => r.data),
  claim: (signalId: string) => api.post('/going/claim', { signal_id: signalId }).then(r => r.data),
};

export async function associatePendingGuest() {
  const inviteToken = localStorage.getItem('dropby_invite_token');
  if (inviteToken) {
    // Fetching the invite records it as pending — accepting is always an explicit choice,
    // so logging in through a link never connects you to anyone on its own.
    try { await invitesApi.get(inviteToken); } catch {}
    localStorage.removeItem('dropby_invite_token');
  }
  const raw = localStorage.getItem('dropby_guest_rsvp');
  if (raw) {
    try { await goingApi.claim(JSON.parse(raw).signalId); } catch {}
    localStorage.removeItem('dropby_guest_rsvp');
  }
}

// Notes
export const notesApi = {
  list: () => api.get<SavedNote[]>('/notes').then(r => r.data),
  save: (text: string) => api.post('/notes', { text }).then(r => r.data),
  setHidden: (id: string, hidden: boolean) => api.put(`/notes/${id}`, { hidden }).then(r => r.data),
  delete: (id: string) => api.delete(`/notes/${id}`).then(r => r.data),
};

// Nudges
export const nudgesApi = {
  list: () => api.get<NudgeSchedule[]>('/nudges').then(r => r.data),
  add: (day_of_week: string, hour: number) => api.post('/nudges', { day_of_week, hour }).then(r => r.data),
  remove: (id: string) => api.delete(`/nudges/${id}`).then(r => r.data),
};

// Feedback
export const feedbackApi = {
  submit: (data: FeedbackBody) => api.post<{ id: string }>('/feedback', data).then(r => r.data),
};

// Waitlist
export const waitlistApi = {
  join: (email: string, locale: string, turnstile_token: string, website: string) =>
    api.post('/waitlist', { email, locale, turnstile_token, website }).then(r => r.data),
};

export const trackApi = {
  chipSelected: (data: { chip: 'im_home' | 'suggestion'; index: number }) =>
    api.post('/track', { event: 'chip.selected', data }).catch(() => {}),
  event: (event: string, data?: Record<string, unknown>) =>
    api.post('/track', { event, data }).catch(() => {}),
};

// Live updates
export const eventsApi = {
  ticket: (): Promise<{ ticket: string }> => api.post('/events/ticket').then(r => r.data),
};
