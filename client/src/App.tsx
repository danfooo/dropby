import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { authApi } from './api';
import { useSSE } from './hooks/useSSE';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Friends from './pages/Friends';
import Invite from './pages/Invite';
import Profile from './pages/Profile';
import Layout from './components/Layout';

function AppRoutes() {
  const { user, token, isLoading, setAuth, clearAuth, setLoading } = useAuthStore();
  useSSE();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then(u => {
        setAuth(u, token);
        setLoading(false);
      })
      .catch(() => {
        clearAuth();
        setLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/home" /> : <Landing />} />
      <Route path="/auth" element={user ? <Navigate to="/home" /> : <Auth />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route element={user ? <Layout /> : <Navigate to="/auth" />}>
        <Route path="/home" element={<Home />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
