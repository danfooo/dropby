import { create } from 'zustand';
import { syncAuthTokenToNative } from '../utils/notifications';

export interface User {
  id: string;
  email: string;
  display_name: string;
  timezone: string | null;
  auto_nudge_enabled: boolean;
  notif_door_closed: boolean;
  going_reminder_1: string;
  going_reminder_2: string;
  avatar_url: string | null;
  default_door_minutes: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: true,
  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    syncAuthTokenToNative();
    set({ user, token });
  },
  setUser: user => set({ user }),
  clearAuth: () => {
    localStorage.removeItem('token');
    syncAuthTokenToNative();
    set({ user: null, token: null });
  },
  setLoading: v => set({ isLoading: v }),
}));
