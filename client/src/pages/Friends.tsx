import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { friendsApi, invitesApi } from '../api';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';

export default function Friends() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [error, setError] = useState('');

  const { data: friends = [], isLoading } = useQuery({ queryKey: ['friends'], queryFn: friendsApi.list });
  const { data: pendingInvites = [] } = useQuery({ queryKey: ['pending-invites'], queryFn: invitesApi.listPending });

  const removeFriend = useMutation({
    mutationFn: (id: string) => friendsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });

  const muteFriend = useMutation({
    mutationFn: (id: string) => friendsApi.mute(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });

  const unmuteFriend = useMutation({
    mutationFn: (id: string) => friendsApi.unmute(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });

  const cancelInvite = useMutation({
    mutationFn: (token: string) => invitesApi.revoke(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-invites'] }),
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
  const activeFriends = filtered.filter((f: any) => !f.muted);
  const mutedFriends = filtered.filter((f: any) => f.muted);

  const handleInvite = async () => {
    try {
      const data = await invitesApi.generate();
      await navigator.clipboard.writeText(data.url);
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
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-4 safe-top">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t('friends.title')}</h1>
          <div className="flex gap-2">
            <button
              onClick={handleInvite}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium"
            >
              {t('friends.invite')}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
            >
              {t('friends.add')}
            </button>
          </div>
        </div>
        {(friends as any[]).length > 0 && (
          <input
            type="text"
            placeholder={t('friends.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none"
          />
        )}
      </div>

      <div className="px-4 pt-4">
        {(friends as any[]).length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">👋</p>
            <p className="font-semibold text-gray-900 mb-2">{t('friends.noFriendsTitle')}</p>
            <p className="text-sm text-gray-500 mb-6">{t('friends.noFriendsDesc')}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleInvite} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium">
                {t('friends.copyInviteLink')}
              </button>
              <button onClick={() => setShowAddModal(true)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium">
                {t('friends.addByEmail')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Active friends */}
            {activeFriends.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4">
                {activeFriends.map((f: any, i: number) => (
                  <div key={f.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <Avatar name={f.display_name} size="sm" />
                    <span className="flex-1 text-sm font-medium text-gray-900">{f.display_name}</span>
                    <button
                      onClick={() => muteFriend.mutate(f.id)}
                      className="text-gray-400 hover:text-gray-600 p-1 ml-1"
                      title="Mute"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Muted friends */}
            {mutedFriends.length > 0 && (
              <>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t('friends.muted')}
                </h2>
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4">
                  {mutedFriends.map((f: any, i: number) => (
                    <div key={f.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                      <Avatar name={f.display_name} size="sm" className="opacity-60" />
                      <span className="flex-1 text-sm font-medium text-gray-500">{f.display_name}</span>
                      <button
                        onClick={() => unmuteFriend.mutate(f.id)}
                        className="text-emerald-600 text-xs font-medium px-2"
                      >
                        {t('friends.unmute')}
                      </button>
                      <button
                        onClick={() => setConfirmRemove({ id: f.id, name: f.display_name })}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Pending email invites */}
        {(pendingInvites as any[]).length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">
              {t('friends.pendingTitle')}
            </h2>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4">
              {(pendingInvites as any[]).map((p: any, i: number) => (
                <div key={p.token} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <span className="flex-1 text-sm text-gray-500">{p.invited_email}</span>
                  <button
                    onClick={() => cancelInvite.mutate(p.token)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title={t('friends.cancelInvite')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
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
            <p className="text-sm text-emerald-700 font-medium">{addMsg}</p>
            <button
              onClick={() => { setAddMsg(''); setAddInput(''); }}
              className="mt-4 text-sm text-gray-500 underline"
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
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
