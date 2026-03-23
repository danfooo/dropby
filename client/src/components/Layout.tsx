import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import TabBar from './TabBar';
import Toast from './Toast';

const BANNER_KEY = 'app_banner_dismissed';

function AppBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(BANNER_KEY));

  if (Capacitor.isNativePlatform() || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(BANNER_KEY, '1');
    setDismissed(true);
  };

  return (
    <Toast
      message={t('common.appBannerText')}
      linkText={t('common.appBannerCta')}
      linkTo="/"
      onDismiss={dismiss}
      persistent
    />
  );
}

export default function Layout() {
  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <div id="tip-portal" />
      <AppBanner />
      <TabBar />
    </div>
  );
}
