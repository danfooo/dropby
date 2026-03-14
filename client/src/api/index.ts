import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) config.headers['x-timezone'] = tz;
  return config;
});

api.interceptors.response.use(
  r => r,
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
  me: () => api.get('/auth/me').then(r => r.data),
  signup: (email: string, password: string, display_name?: string, locale?: string, redirect_url?: string) =>
    api.post('/auth/signup', { email, password, display_name, locale, redirect_url }).then(r => r.data),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  google: (credential: string) => api.post('/auth/google', { credential }).then(r => r.data),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }).then(r => r.data),
  resendVerification: (email: string, redirect_url?: string) => api.post('/auth/resend-verification', { email, redirect_url }).then(r => r.data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }).then(r => r.data),
  resetPassword: (token: string, password: string) => api.post('/auth/reset-password', { token, password }).then(r => r.data),
  updateMe: (data: { display_name?: string; auto_nudge_enabled?: boolean }) =>
    api.put('/auth/me', data).then(r => r.data),
  deleteMe: () => api.delete('/auth/me').then(r => r.data),
  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    api.post('/auth/push-token', { token, platform }).then(r => r.data),
  uploadAvatar: (blob: Blob) => {
    const form = new FormData();
    form.append('avatar', blob, 'avatar.jpg');
    return api.put('/auth/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  removeAvatar: () => api.delete('/auth/avatar').then(r => r.data),
};

// Friends
export const friendsApi = {
  list: () => api.get('/friends').then(r => r.data),
  remove: (friendId: string) => api.delete(`/friends/${friendId}`).then(r => r.data),
  mute: (friendId: string) => api.post(`/friends/${friendId}/mute`).then(r => r.data),
  unmute: (friendId: string) => api.delete(`/friends/${friendId}/mute`).then(r => r.data),
};

// Status
export const statusApi = {
  get: () => api.get('/status').then(r => r.data),
  getFriends: () => api.get('/status/friends').then(r => r.data),
  getLastSelection: () => api.get('/status/last-selection').then(r => r.data),
  create: (data: { note?: string; recipient_ids: string[] }) =>
    api.post('/status', data).then(r => r.data),
  update: (data: { note?: string; recipient_ids?: string[] }) =>
    api.put('/status', data).then(r => r.data),
  close: () => api.delete('/status').then(r => r.data),
  prolong: () => api.post('/status/prolong').then(r => r.data),
  removeRecipient: (recipientId: string) => api.delete(`/status/recipients/${recipientId}`).then(r => r.data),
};

// Invites
export const invitesApi = {
  generate: (statusId?: string) => api.post('/invites', statusId ? { status_id: statusId } : {}).then(r => r.data),
  get: (token: string) => api.get(`/invites/${token}`).then(r => r.data),
  accept: (token: string) => api.post(`/invites/${token}/accept`).then(r => r.data),
  revoke: (token: string) => api.post(`/invites/${token}/revoke`).then(r => r.data),
  sendByEmail: (email: string) => api.post('/invites/email', { email }).then(r => r.data),
  listPending: () => api.get('/invites/pending').then(r => r.data),
};

// Going
export const goingApi = {
  everReceived: () => api.get('/going/ever-received').then(r => r.data),
  send: (statusId: string) => api.post(`/going/${statusId}`).then(r => r.data),
  sendGuest: (statusId: string, data: { name: string; contact?: string; marketing_consent?: boolean }) =>
    api.post(`/going/${statusId}/guest`, data).then(r => r.data),
};

// Notes
export const notesApi = {
  list: () => api.get('/notes').then(r => r.data),
  save: (text: string) => api.post('/notes', { text }).then(r => r.data),
  setHidden: (id: string, hidden: boolean) => api.put(`/notes/${id}`, { hidden }).then(r => r.data),
  delete: (id: string) => api.delete(`/notes/${id}`).then(r => r.data),
};

// Nudges
export const nudgesApi = {
  list: () => api.get('/nudges').then(r => r.data),
  add: (day_of_week: string, hour: number) => api.post('/nudges', { day_of_week, hour }).then(r => r.data),
  remove: (id: string) => api.delete(`/nudges/${id}`).then(r => r.data),
};

// Feedback
export const feedbackApi = {
  submit: (data: { type: string; message: string; reply_email?: string }) =>
    api.post('/feedback', data).then(r => r.data),
};
