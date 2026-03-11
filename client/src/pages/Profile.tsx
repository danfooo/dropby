import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, nudgesApi } from '../api';
import { useAuthStore } from '../stores/auth';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';

const DAY_OPTIONS = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

const DAY_SHORT: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
};

function formatHour(h: number) {
  const ampm = h < 12 ? 'am' : 'pm';
  const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${disp}${ampm}`;
}

// Suggest next nudge based on existing ones
function suggestNextNudge(existing: Array<{ day_of_week: string; hour: number }>): { day: string; hour: number } {
  if (!existing.length) return { day: 'sat', hour: 11 };
  const last = existing[existing.length - 1];
  if (last.day_of_week === 'sat' && last.hour < 15) return { day: 'sat', hour: 15 };
  if (last.day_of_week === 'sat') return { day: 'sun', hour: 19 };
  // suggest weekday evening
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const nextDay = days[(days.indexOf(last.day_of_week) + 1) % 7];
  return { day: nextDay, hour: 19 };
}

function AddNudgeModal({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: any[] }) {
  const qc = useQueryClient();
  const suggestion = suggestNextNudge(existing);
  const [day, setDay] = useState(suggestion.day);
  const [hour, setHour] = useState(suggestion.hour);

  const addNudge = useMutation({
    mutationFn: () => nudgesApi.add(day, hour),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nudges'] }); onClose(); },
  });

  return (
    <Modal open={open} onClose={onClose} title="Add reminder">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Day</label>
          <div className="grid grid-cols-4 gap-1.5">
            {DAY_OPTIONS.map(d => (
              <button
                key={d.value}
                onClick={() => setDay(d.value)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  day === d.value ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {DAY_SHORT[d.value]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Time: {formatHour(hour)}</label>
          <input
            type="range"
            min={6}
            max={23}
            value={hour}
            onChange={e => setHour(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <p className="text-xs text-emerald-700 font-medium">Suggested</p>
          <p className="text-sm text-emerald-900">{DAY_OPTIONS.find(d => d.value === suggestion.day)?.label} at {formatHour(suggestion.hour)}</p>
          <button
            onClick={() => { setDay(suggestion.day); setHour(suggestion.hour); }}
            className="text-xs text-emerald-600 mt-1 underline"
          >
            Use this
          </button>
        </div>
        <button
          onClick={() => addNudge.mutate()}
          disabled={addNudge.isPending}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          Add reminder
        </button>
      </div>
    </Modal>
  );
}

export default function Profile() {
  const { user, setUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(user?.display_name || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddNudge, setShowAddNudge] = useState(false);

  const { data: nudges = [] } = useQuery({ queryKey: ['nudges'], queryFn: nudgesApi.list });

  const updateMe = useMutation({
    mutationFn: (data: { display_name?: string; auto_nudge_enabled?: boolean }) => authApi.updateMe(data),
    onSuccess: updated => { setUser(updated); setEditName(false); },
  });

  const deleteAccount = useMutation({
    mutationFn: authApi.deleteMe,
    onSuccess: () => { clearAuth(); navigate('/'); },
  });

  const removeNudge = useMutation({
    mutationFn: (id: string) => nudgesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nudges'] }),
  });

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-4 safe-top flex items-center gap-3">
        <Link to="/home" className="text-gray-400 hover:text-gray-600 mr-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold">Profile</h1>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Display name */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Display name</label>
            {!editName && (
              <button onClick={() => { setEditName(true); setNewName(user?.display_name || ''); }} className="text-sm text-emerald-600 font-medium">Edit</button>
            )}
          </div>
          {editName ? (
            <form onSubmit={e => { e.preventDefault(); updateMe.mutate({ display_name: newName }); }} className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                autoFocus
              />
              <button type="submit" disabled={updateMe.isPending} className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                Save
              </button>
              <button type="button" onClick={() => setEditName(false)} className="px-3 py-2 text-gray-500 text-sm">
                Cancel
              </button>
            </form>
          ) : (
            <p className="text-gray-900 font-medium">{user?.display_name}</p>
          )}
        </div>

        {/* Email */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Email</label>
          <p className="text-gray-900">{user?.email}</p>
        </div>

        {/* Nudge reminders */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Reminders</h2>
            <button onClick={() => setShowAddNudge(true)} className="text-sm text-emerald-600 font-medium">
              + Add
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Personal nudges to open your door — not sent to friends.</p>

          {(nudges as any[]).length === 0 ? (
            <p className="text-sm text-gray-500 italic">No reminders set.</p>
          ) : (
            <div className="space-y-2">
              {(nudges as any[]).map((n: any) => (
                <div key={n.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-900">
                    {DAY_OPTIONS.find(d => d.value === n.day_of_week)?.label} at {formatHour(n.hour)}
                  </span>
                  <button onClick={() => removeNudge.mutate(n.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-nudge */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-medium text-gray-900 text-sm">Remind me when I opened my door this time last week</p>
              <p className="text-xs text-gray-500 mt-0.5">On by default</p>
            </div>
            <button
              onClick={() => updateMe.mutate({ auto_nudge_enabled: !user?.auto_nudge_enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors ${user?.auto_nudge_enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${user?.auto_nudge_enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Delete account */}
        <div className="pt-4">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 text-red-500 text-sm font-medium border border-red-100 rounded-2xl hover:bg-red-50"
          >
            Delete account
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteAccount.mutate()}
        title="Delete account"
        message="This will permanently delete your account, friends, and all data. This cannot be undone."
        confirmLabel="Delete"
        danger
      />

      <AddNudgeModal open={showAddNudge} onClose={() => setShowAddNudge(false)} existing={nudges as any[]} />
    </div>
  );
}
