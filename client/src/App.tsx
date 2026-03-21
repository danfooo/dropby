import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from './stores/auth';
import { authApi } from './api';
import { useSSE } from './hooks/useSSE';
import { usePushNotifications } from './hooks/usePushNotifications';
import Landing from './pages/Landing';
import Get from './pages/Get';
import Auth from './pages/Auth';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import Friends from './pages/Friends';
import Invite from './pages/Invite';
import Profile from './pages/Profile';
import About from './pages/About';
import Privacy from './pages/Privacy';
import Admin from './pages/Admin';
import Layout from './components/Layout';

function AppRoutes() {
  const { user, token, isLoading, setAuth, clearAuth, setLoading } = useAuthStore();
  useSSE();
  usePushNotifications(!!user);

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
      <Route path="/" element={user ? <Navigate to="/home" /> : (Capacitor.isNativePlatform() ? <Landing /> : <Get />)} />
      <Route path="/auth" element={user ? <Navigate to="/home" /> : <Auth />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/about" element={<About />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route element={user ? <Layout /> : <Navigate to="/auth" />}>
        <Route path="/home" element={<Home />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
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
