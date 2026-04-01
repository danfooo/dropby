import { useState, useEffect, useRef } from 'react';
import { copyText } from '../utils/clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { friendsApi, invitesApi } from '../api';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';

type NotifPref = 'none' | 'default' | 'all';

function BellIcon({ pref }: { pref: NotifPref }) {
  if (pref === 'none') {
    // Bell with slash
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 003.844.148m-3.844-.148a23.856 23.856 0 01-5.455-1.31A8.967 8.967 0 013 12a9 9 0 012.252-5.979M9.143 17.082C9.048 16.764 9 16.432 9 16c0-1.657 1.343-3 3-3s3 1.343 3 3c0 .432-.048.764-.143 1.082m0 0a23.78 23.78 0 003.143-.617M15 10a3 3 0 00-3-3M3 3l18 18" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function bellColor(pref: NotifPref) {
  if (pref === 'all') return 'text-emerald-500 dark:text-emerald-400';
  return 'text-gray-400 dark:text-gray-500';
}

export default function Friends() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [error, setError] = useState('');
  const [notifPickerFor, setNotifPickerFor] = useState<string | null>(null);
  const [notifPickerDir, setNotifPickerDir] = useState<'up' | 'down'>('down');
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notifPickerFor) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setNotifPickerFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifPickerFor]);

  const { data: friends = [], isLoading } = useQuery({ queryKey: ['friends'], queryFn: friendsApi.list });
  const { data: pendingInvites = [] } = useQuery({ queryKey: ['pending-invites'], queryFn: invitesApi.listPending });
  const { data: openLinks = [] } = useQuery({ queryKey: ['open-links'], queryFn: invitesApi.listOpenLinks });

  const removeFriend = useMutation({
    mutationFn: (id: string) => friendsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });

  const hideFriend = useMutation({
    mutationFn: (id: string) => friendsApi.hide(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['friendStatuses'] });
    },
  });

  const setNotifPref = useMutation({
    mutationFn: ({ friendId, pref }: { friendId: string; pref: NotifPref }) =>
      friendsApi.setNotifPref(friendId, pref),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] });
      setNotifPickerFor(null);
    },
  });

  const cancelInvite = useMutation({
    mutationFn: (token: string) => invitesApi.revoke(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-invites'] }),
  });

  const revokeLink = useMutation({
    mutationFn: (token: string) => invitesApi.revoke(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['open-links'] }),
  });

  const sendEmailInvite = useMutation({
    mutationFn: (email: string) => invitesApi.sendByEmail(email),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-invites'] });
      setAddMsg(t('friends.inviteSentSuccess'));
    },
    onError: (err: any) => {
      setAddMsg('');
      setError(err.response?.data?.error || t('friends.inviteError'));
    },
  });

  const filtered = (friends as any[]).filter((f: any) =>
    f.display_name.toLowerCase().includes(search.toLowerCase())
  );
  const activeFriends = filtered.filter((f: any) => !f.hidden);
  const hiddenFriends = filtered.filter((f: any) => f.hidden);

  const handleInvite = async () => {
    try {
      await copyText(invitesApi.generate().then(data => {
        qc.invalidateQueries({ queryKey: ['open-links'] });
        return `${t('home.friendshipCopyText')}\n${data.url}`;
      }));
      alert(t('home.inviteLinkCopied'));
    } catch {
      alert(t('home.couldNotCopy'));
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await copyText(Promise.resolve(`${t('home.friendshipCopyText')}\n${url}`));
      alert(t('home.inviteLinkCopied'));
    } catch {
      alert(t('home.couldNotCopy'));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    sendEmailInvite.mutate(addInput.trim());
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pt-10 pb-4 safe-top">
        <h1 className="text-2xl font-bold mb-4">{t('friends.title')}</h1>
        {(friends as any[]).length > 0 && (
          <input
            type="text"
            placeholder={t('friends.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 dark:text-gray-50 rounded-lg text-sm focus:outline-none"
          />
        )}
      </div>

      <div className="px-4 pt-4">
        {(friends as any[]).length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">👋</p>
            <p className="font-semibold text-gray-900 dark:text-gray-50 mb-2">{t('friends.noFriendsTitle')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('friends.noFriendsDesc')}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleInvite} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium">
                {t('friends.copyInviteLink')}
              </button>
              <button onClick={() => setShowAddModal(true)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
                {t('friends.addByEmail')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Active friends */}
            {activeFriends.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-4">
                {activeFriends.map((f: any, i: number) => {
                  const pref: NotifPref = f.notif_pref ?? 'default';
                  const pickerOpen = notifPickerFor === f.id;
                  return (
                    <div key={f.id} className="relative">
                      <div className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''}`}>
                        <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-50">{f.display_name}</span>
                        {/* Bell button */}
                        <button
                          onClick={e => {
                            if (pickerOpen) { setNotifPickerFor(null); return; }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            // picker is ~160px tall; open below unless less than 170px to bottom
                            setNotifPickerDir(window.innerHeight - rect.bottom < 170 ? 'up' : 'down');
                            setNotifPickerFor(f.id);
                          }}
                          className={`p-1.5 rounded-lg ${pickerOpen ? 'bg-gray-100 dark:bg-gray-800' : ''} ${bellColor(pref)}`}
                        >
                          <BellIcon pref={pref} />
                        </button>
                        {/* Hide button */}
                        <button
                          onClick={() => hideFriend.mutate(f.id)}
                          className="text-sm font-medium text-gray-400 dark:text-gray-500 px-2 py-1"
                        >
                          {t('friends.hide')}
                        </button>
                      </div>
                      {/* Floating notif picker */}
                      {pickerOpen && (
                        <div ref={pickerRef} className={`absolute right-3 z-20 w-48 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden ${notifPickerDir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('friends.notifTitle')}</span>
                          </div>
                          {([
                            { value: 'all' as NotifPref, label: t('friends.notifAll') },
                            { value: 'default' as NotifPref, label: t('friends.notifDefault') },
                            { value: 'none' as NotifPref, label: t('friends.notifNone') },
                          ]).map(({ value, label }) => (
                            <button
                              key={value}
                              onClick={() => setNotifPref.mutate({ friendId: f.id, pref: value })}
                              className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${
                                pref === value
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {label}
                              {pref === value && (
                                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hidden friends */}
            {hiddenFriends.length > 0 && (
              <>
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  {t('friends.hidden')}
                </h2>
                <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 mb-4">
                  {hiddenFriends.map((f: any, i: number) => (
                    <div key={f.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''}`}>
                      <Avatar name={f.display_name} url={f.avatar_url} size="sm" className="opacity-60" />
                      <span className="flex-1 text-sm font-medium text-gray-500 dark:text-gray-400">{f.display_name}</span>
                      {/* Greyed-out bell (not interactive) */}
                      <span className="p-1.5 opacity-40 text-gray-400 dark:text-gray-500">
                        <BellIcon pref="none" />
                      </span>
                      {/* Red Remove button */}
                      <button
                        onClick={() => setConfirmRemove({ id: f.id, name: f.display_name })}
                        className="text-sm font-medium text-red-500 border border-red-300 dark:border-red-700 rounded-lg px-2 py-1"
                      >
                        {t('friends.removeConfirm')}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Sent invites — email + link-based, merged by created_at */}
        {((pendingInvites as any[]).length > 0 || (openLinks as any[]).length > 0) && (() => {
          const now = Math.floor(Date.now() / 1000);
          const merged = [
            ...(pendingInvites as any[]).map(p => ({ ...p, kind: 'email' as const })),
            ...(openLinks as any[]).map(l => ({ ...l, kind: 'link' as const })),
          ].sort((a, b) => b.created_at - a.created_at);

          return (
            <>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 mt-4">
                {t('friends.pendingTitle')}
              </h2>
              <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 mb-4">
                {merged.map((item: any, i: number) => {
                  const isLink = item.kind === 'link';
                  const ageSecs = now - item.created_at;
                  const createdAgo = ageSecs < 3600
                    ? t('friends.linkCreatedJustNow')
                    : ageSecs < 86400
                      ? t('friends.linkCreatedHoursAgo', { hours: Math.floor(ageSecs / 3600) })
                      : t('friends.linkCreatedDaysAgo', { days: Math.floor(ageSecs / 86400) });

                  return (
                    <div key={item.token} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''}`}>
                      {isLink ? (
                        <button
                          onClick={() => handleCopyLink(item.url)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {t('friends.inviteLinkLabel', { time: createdAgo })}
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                            </svg>
                          </div>
                          <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.invited_email}</span>
                        </div>
                      )}
                      <button
                        onClick={() => isLink ? revokeLink.mutate(item.token) : cancelInvite.mutate(item.token)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 flex-shrink-0"
                        title={t('friends.cancelInvite')}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 px-1 mt-2 mb-4">{t('friends.linkExpiryNote')}</p>
            </>
          );
        })()}

        {/* Add friends actions */}
        <div className="flex gap-3 mt-2 mb-6">
          <button
            onClick={handleInvite}
            className="flex-1 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-medium"
          >
            {t('friends.copyInviteLink')}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium"
          >
            {t('friends.addByEmail')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => removeFriend.mutate(confirmRemove!.id)}
        title={t('friends.removeTitle')}
        message={t('friends.removeMessage', { name: confirmRemove?.name })}
        confirmLabel={t('friends.removeConfirm')}
        danger
      />

      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setAddMsg(''); setAddInput(''); setError(''); }}
        title={t('friends.addFriendTitle')}
      >
        {addMsg ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">✉️</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">{addMsg}</p>
            <button
              onClick={() => { setAddMsg(''); setAddInput(''); }}
              className="mt-4 text-sm text-gray-500 dark:text-gray-400 underline"
            >
              {t('friends.inviteAnother')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleAdd} className="space-y-3">
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <input
              type="email"
              placeholder={t('friends.emailPlaceholder')}
              value={addInput}
              onChange={e => { setAddInput(e.target.value); setError(''); }}
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              type="submit"
              disabled={sendEmailInvite.isPending}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold"
            >
              {sendEmailInvite.isPending ? t('friends.sending') : t('friends.sendInvite')}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
