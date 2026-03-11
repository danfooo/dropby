import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { friendsApi, invitesApi } from '../api';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';

export default function Friends() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg] = useState('');

  const { data: friends = [], isLoading } = useQuery({ queryKey: ['friends'], queryFn: friendsApi.list });

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

  const filtered = (friends as any[]).filter((f: any) =>
    f.display_name.toLowerCase().includes(search.toLowerCase())
  );
  const activeFriends = filtered.filter((f: any) => !f.muted);
  const mutedFriends = filtered.filter((f: any) => f.muted);

  const handleInvite = async () => {
    try {
      const data = await invitesApi.generate();
      await navigator.clipboard.writeText(data.url);
      alert('Invite link copied!');
    } catch {
      alert('Could not copy link');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    // For now: generate a link to share. Full email/SMS delivery is deferred.
    const data = await invitesApi.generate();
    setAddMsg(`Share this link with ${addInput}: ${data.url}`);
    console.log(`[INVITE] Sending invite to ${addInput}: ${data.url}`);
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-4 safe-top">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Friends</h1>
          <div className="flex gap-2">
            <button
              onClick={handleInvite}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium"
            >
              Invite
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
            >
              Add
            </button>
          </div>
        </div>
        {(friends as any[]).length > 0 && (
          <input
            type="text"
            placeholder="Search friends…"
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
            <p className="font-semibold text-gray-900 mb-2">No friends yet</p>
            <p className="text-sm text-gray-500 mb-6">Invite people or add them by email.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleInvite} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium">
                Copy invite link
              </button>
              <button onClick={() => setShowAddModal(true)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium">
                Add by email
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
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Muted</h2>
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4">
                  {mutedFriends.map((f: any, i: number) => (
                    <div key={f.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                      <Avatar name={f.display_name} size="sm" className="opacity-60" />
                      <span className="flex-1 text-sm font-medium text-gray-500">{f.display_name}</span>
                      <button
                        onClick={() => unmuteFriend.mutate(f.id)}
                        className="text-emerald-600 text-xs font-medium px-2"
                      >
                        Unmute
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
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => removeFriend.mutate(confirmRemove!.id)}
        title="Remove friend"
        message={`Remove ${confirmRemove?.name} as a friend? This cannot be undone.`}
        confirmLabel="Remove"
        danger
      />

      <Modal open={showAddModal} onClose={() => { setShowAddModal(false); setAddMsg(''); setAddInput(''); }} title="Add friend">
        {addMsg ? (
          <div className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 mb-4 break-all">{addMsg}</div>
        ) : (
          <form onSubmit={handleAdd} className="space-y-3">
            <input
              type="text"
              placeholder="Email or phone"
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold"
            >
              Send invite
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
