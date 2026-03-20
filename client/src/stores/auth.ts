import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  display_name: string;
  timezone: string | null;
  auto_nudge_enabled: boolean;
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
    set({ user, token });
  },
  setUser: user => set({ user }),
  clearAuth: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },
  setLoading: v => set({ isLoading: v }),
}));
