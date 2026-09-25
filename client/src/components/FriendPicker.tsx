import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';

// Local toggles, keyed by friend id, applied over each friend's server `selected` default.
export type RecipientOverrides = Record<string, boolean>;

export const isRecipientSelected = (f: any, overrides: RecipientOverrides): boolean =>
  overrides[f.id] ?? Boolean(f.selected);

// Non-hidden friends, checked-by-default first, then newest friendship first.
// Order comes only from the server record, never from live toggles, so checking a box
// never reorders the list under the user's finger.
export function useActiveFriends(friends: any[]) {
  return useMemo(() => {
    return friends
      .filter((f: any) => !f.hidden)
      .sort((a: any, b: any) => {
        if (a.selected !== b.selected) return a.selected ? -1 : 1;
        return (b.friendship_created_at ?? 0) - (a.friendship_created_at ?? 0);
      });
  }, [friends]);
}

export function selectedRecipientIds(activeFriends: any[], overrides: RecipientOverrides): string[] {
  return activeFriends.filter(f => isRecipientSelected(f, overrides)).map((f: any) => f.id);
}

// "Open door to" checkbox list, shared by the Now view and the schedule form.
export default function FriendPicker({ activeFriends, overrides, onChange }: {
  activeFriends: any[];
  overrides: RecipientOverrides;
  onChange: (overrides: RecipientOverrides) => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scroll, setScroll] = useState({ canScroll: false, atBottom: false });
  const measure = () => {
    const el = listRef.current;
    if (!el) return;
    setScroll({
      canScroll: el.scrollHeight > el.clientHeight + 1,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    });
  };
  // Re-measure when the list grows (e.g. a friend joins) so the fade matches reality.
  useLayoutEffect(() => { measure(); }, [activeFriends.length]);

  if (activeFriends.length === 0) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-gray-700">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t('home.openDoorTo')}</h2>
      <div className="relative">
        <div
          className="divide-y divide-gray-50 dark:divide-gray-800 overflow-x-hidden rounded-xl max-h-[192px] overflow-y-auto"
          ref={listRef}
          onScroll={measure}
        >
          {activeFriends.map((f: any) => (
            <label key={f.id} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-3 px-3 transition-colors">
              <input type="checkbox" checked={isRecipientSelected(f, overrides)}
                onChange={e => onChange({ ...overrides, [f.id]: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 shrink-0" />
              <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{f.display_name}</span>
            </label>
          ))}
        </div>
        {scroll.canScroll && !scroll.atBottom && (
          <div className="absolute bottom-0 left-0 right-0 h-14 bg-linear-to-t from-white dark:from-gray-900 to-transparent pointer-events-none rounded-b-xl" />
        )}
      </div>
    </div>
  );
}
