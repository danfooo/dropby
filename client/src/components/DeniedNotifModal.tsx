import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface Props {
  open: boolean;
  onDismiss: () => void;
  onSnooze: () => void;
  onOpenSettings: () => Promise<void>;
}

export default function DeniedNotifModal({ open, onDismiss, onSnooze, onOpenSettings }: Props) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onDismiss}>
      <p className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-2">
        {t('notif.deniedTitle')}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t('notif.deniedDesc')}
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={onOpenSettings}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-2xl font-semibold text-sm transition-colors"
        >
          {t('notif.deniedOpenSettings')}
        </button>
        <button
          onClick={onDismiss}
          className="w-full text-gray-500 dark:text-gray-400 py-2 text-sm"
        >
          {t('notif.deniedDismiss')}
        </button>
        <button
          onClick={onSnooze}
          className="w-full text-gray-400 dark:text-gray-500 py-1 text-xs"
        >
          {t('notif.deniedSnooze')}
        </button>
      </div>
    </Modal>
  );
}
