import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

// Routes a tapped dropby.cc Universal Link to the matching in-app screen
export function useUniversalLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | undefined;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', ({ url }) => {
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        if (path.startsWith('/')) navigate(path);
      }).then(handle => {
        cleanup = () => handle.remove();
      });
    });
    return () => { cleanup?.(); };
  }, [navigate]);
}
