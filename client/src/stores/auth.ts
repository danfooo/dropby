import { create } from 'zustand';
import type { User } from '@dropby/shared';
import { syncAuthTokenToNative } from '../utils/notifications';

export type { User };

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
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
  setToken: token => {
    localStorage.setItem('token', token);
    syncAuthTokenToNative();
    set({ token });
  },
  clearAuth: () => {
    localStorage.removeItem('token');
    syncAuthTokenToNative();
    set({ user: null, token: null });
  },
  setLoading: v => set({ isLoading: v }),
}));
