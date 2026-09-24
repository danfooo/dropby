import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { invitesApi } from '../api';
import { useAuthStore } from '../stores/auth';
import FeedbackModal from './FeedbackModal';
import { useToast } from '../contexts/toast';
import { copyText } from '../utils/clipboard';
import { useEverReceived, useFriends } from '../queries';

function usePermanentDismiss(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1');
  const dismiss = () => { localStorage.setItem(key, '1'); setDismissed(true); };
  return [dismissed, dismiss];
}

// The one tip shown under the closed door: get the app, invite friends, send feedback,
// or buy us a coffee — whichever applies first. Each is dismissed for good.
export default function HomeTips() {
  const { t } = useTranslation();
  const setToast = useToast();
  const { user } = useAuthStore();
  const [appBannerDismissed, dismissAppBanner] = usePermanentDismiss('app_banner_dismissed');
  const [inviteDismissed, dismissInvite] = usePermanentDismiss('tip_invite_dismissed');
  const [feedbackDismissed, dismissFeedback] = usePermanentDismiss('tip_feedback_dismissed');
  const [coffeeDismissed, dismissCoffee] = usePermanentDismiss('tip_coffee_dismissed');
  const [showFeedback, setShowFeedback] = useState(false);

  const { data: everReceived } = useEverReceived();
  const { data: friends = [] } = useFriends();

  const isFirstDay = user ? new Date(user.created_at * 1000).toDateString() === new Date().toDateString() : false;
  const recentFeedbackTs = Number(localStorage.getItem('feedback_last_submitted') ?? 0);
  const submittedFeedbackRecently = recentFeedbackTs > 0 && Date.now() - recentFeedbackTs < 30 * 24 * 60 * 60 * 1000;

  const showAppBanner = !Capacitor.isNativePlatform() && !appBannerDismissed;
  const showInviteTip = !inviteDismissed && !showAppBanner && (friends as any[]).length < 3;
  const showFeedbackTip = !feedbackDismissed && !showInviteTip && !showAppBanner && !isFirstDay && !submittedFeedbackRecently;

  const tipContent = showAppBanner ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('common.appBannerText')}</p>
        <button onClick={dismissAppBanner} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <Link to="/get" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {t('common.appBannerCta')}
      </Link>
    </div>
  ) : showInviteTip ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('home.inviteFriendsText')}</p>
        <button onClick={dismissInvite} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        onClick={async () => {
          try {
            await copyText(invitesApi.generate().then(data => `${t('home.friendshipCopyText')}\n${data.url}`));
            alert(t('home.inviteLinkCopied'));
          } catch {
            alert(t('home.couldNotCopy'));
          }
        }}
        className="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
      >
        {t('home.copyInviteLink')}
      </button>
    </div>
  ) : showFeedbackTip ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('home.feedbackTipText')}</p>
        <button onClick={() => { dismissFeedback(); setToast({ message: t('home.feedbackTipDismissed'), linkText: t('profile.title'), linkTo: '/profile' }); }} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button onClick={() => setShowFeedback(true)} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {t('home.feedbackTipLink')}
      </button>
    </div>
  ) : !coffeeDismissed && everReceived?.received ? (
    <div className="bg-white dark:bg-gray-900 px-4 py-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{t('home.coffeeTipText')}</p>
        <button onClick={dismissCoffee} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 -mt-0.5 -mr-0.5 p-1 ml-2 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <a href="https://www.buymeacoffee.com/dropby" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        {t('home.coffeeTipLink')}
      </a>
    </div>
  ) : null;

  return (
    <>
      {tipContent && (
        <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <p className="px-4 pt-3 pb-0 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('home.tipsSectionTitle')}</p>
          {tipContent}
        </div>
      )}
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </>
  );
}
