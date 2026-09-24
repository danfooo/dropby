import { useTranslation } from 'react-i18next';
import type { FriendStatus } from '@dropby/shared';
import FriendStatusCard from './FriendStatusCard';

// "Doors open to you now" — friends' open doors, shown above your own door either way.
export default function FriendDoorsNow({ doors, onGoing, onNoteUpdate }: {
  doors: FriendStatus[];
  onGoing: (statusId: string, rsvp?: 'going' | null, note?: string) => void;
  onNoteUpdate: (statusId: string, note: string) => void;
}) {
  const { t } = useTranslation();
  if (doors.length === 0) return null;
  return (
    <div data-testid="friends-available" className="mb-6">
      <h2 className="text-2xl font-bold text-fuchsia-900 dark:text-fuchsia-100 mb-3">
        {t('home.friendsAvailable')}
      </h2>
      <div className="space-y-3">
        {doors.map(s => (
          <FriendStatusCard key={s.id} status={s} onGoing={onGoing} onNoteUpdate={onNoteUpdate} />
        ))}
      </div>
    </div>
  );
}
