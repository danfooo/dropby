import { useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { authApi, nudgesApi } from '../api';
import { useAuthStore } from '../stores/auth';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import FeedbackModal from '../components/FeedbackModal';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof DAY_KEYS[number];

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
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const suggestion = suggestNextNudge(existing);
  const [day, setDay] = useState(suggestion.day);
  const [hour, setHour] = useState(suggestion.hour);

  const use24h = ['de', 'es', 'fr'].includes(i18n.language.split('-')[0]);

  const formatHour = (h: number) => {
    if (use24h) return `${h}:00`;
    const ampm = h < 12 ? 'am' : 'pm';
    const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${disp}${ampm}`;
  };

  const addNudge = useMutation({
    mutationFn: ({ d, h }: { d: string; h: number }) => nudgesApi.add(d, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nudges'] }); onClose(); },
  });

  const suggestedDayLabel = t(`profile.days.${suggestion.day}`);

  return (
    <Modal open={open} onClose={onClose} title={t('profile.addReminderTitle')}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">{t('profile.day')}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {DAY_KEYS.map(d => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  day === d ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t(`profile.daysShort.${d}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">{t('profile.time', { time: formatHour(hour) })}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map(h => (
              <button
                key={h}
                onClick={() => setHour(h)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  hour === h ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {formatHour(h)}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <p className="text-xs text-emerald-700 font-medium">{t('profile.suggested')}</p>
          <p className="text-sm text-emerald-900">
            {suggestedDayLabel} {use24h ? `${suggestion.hour}:00` : (() => {
              const h = suggestion.hour;
              const ampm = h < 12 ? 'am' : 'pm';
              const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
              return `${disp}${ampm}`;
            })()}
          </p>
          <button
            onClick={() => addNudge.mutate({ d: suggestion.day, h: suggestion.hour })}
            className="text-xs text-emerald-600 mt-1 underline"
          >
            {t('profile.useSuggestion')}
          </button>
        </div>
        <button
          onClick={() => addNudge.mutate({ d: day, h: hour })}
          disabled={addNudge.isPending}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {t('profile.addReminderButton')}
        </button>
      </div>
    </Modal>
  );
}

async function getCroppedBlob(imageSrc: string, crop: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  const size = 400;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  ctx.drawImage(img, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, size, size);
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9));
}

function AvatarCropModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (blob: Blob) => void }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_: any, croppedAreaPixels: any) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedArea) return;
    setSaving(true);
    const blob = await getCroppedBlob(imageSrc, croppedArea);
    onSave(blob);
    setSaving(false);
  };

  const handleClose = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Change photo">
      {!imageSrc ? (
        <div className="text-center py-6">
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
          >
            Choose photo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative w-full" style={{ height: 280 }}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setImageSrc(null); setZoom(1); }}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
            >
              Change photo
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, setUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(user?.display_name || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddNudge, setShowAddNudge] = useState(() => searchParams.get('addReminder') === '1');
  const [showAvatarCrop, setShowAvatarCrop] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const use24h = ['de', 'es', 'fr'].includes(i18n.language.split('-')[0]);

  const formatHour = (h: number) => {
    if (use24h) return `${h}:00`;
    const ampm = h < 12 ? 'am' : 'pm';
    const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${disp}${ampm}`;
  };

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

  const addNudgeInline = useMutation({
    mutationFn: ({ d, h }: { d: string; h: number }) => nudgesApi.add(d, h),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nudges'] }),
  });

  const uploadAvatar = useMutation({
    mutationFn: (blob: Blob) => authApi.uploadAvatar(blob),
    onSuccess: (data) => {
      setUser({ ...user!, avatar_url: data.avatar_url });
      setShowAvatarCrop(false);
    },
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
        <button onClick={() => setShowAvatarCrop(true)} className="relative group flex-shrink-0">
          <Avatar name={user?.display_name ?? ''} url={user?.avatar_url} size="md" />
          <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </button>
        <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Display name */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('profile.displayName')}
            </label>
            {!editName && (
              <button
                onClick={() => { setEditName(true); setNewName(user?.display_name || ''); }}
                className="text-sm text-emerald-600 font-medium"
              >
                {t('profile.edit')}
              </button>
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
                {t('profile.save')}
              </button>
              <button type="button" onClick={() => setEditName(false)} className="px-3 py-2 text-gray-500 text-sm">
                {t('profile.cancel')}
              </button>
            </form>
          ) : (
            <p className="text-gray-900 font-medium">{user?.display_name}</p>
          )}
        </div>

        {/* Email */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
            {t('profile.email')}
          </label>
          <p className="text-gray-900">{user?.email}</p>
        </div>

        {/* Language */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {t('profile.language')}
          </label>
          <select
            value={i18n.language}
            onChange={e => i18n.changeLanguage(e.target.value)}
            className="text-sm text-gray-900 bg-transparent border-none outline-none cursor-pointer"
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </div>

        {/* Nudge reminders */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">{t('profile.remindersTitle')}</h2>
            <button onClick={() => setShowAddNudge(true)} className="text-sm text-emerald-600 font-medium">
              {t('profile.addReminder')}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">{t('profile.remindersDesc')}</p>

          {(nudges as any[]).length === 0 ? (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-500">
                {t(`profile.days.${suggestNextNudge([]).day}`)} {formatHour(suggestNextNudge([]).hour)}
              </span>
              <button
                onClick={() => addNudgeInline.mutate({ d: suggestNextNudge([]).day, h: suggestNextNudge([]).hour })}
                disabled={addNudgeInline.isPending}
                className="text-sm text-emerald-600 font-medium px-3 py-1 bg-emerald-50 rounded-lg disabled:opacity-50"
              >
                {t('profile.addReminder')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {(nudges as any[]).map((n: any) => (
                <div key={n.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-900">
                    {t(`profile.days.${n.day_of_week}`)} {formatHour(n.hour)}
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
              <p className="font-medium text-gray-900 text-sm">{t('profile.autoNudgeTitle')}</p>
            </div>
            <button
              onClick={() => updateMe.mutate({ auto_nudge_enabled: !user?.auto_nudge_enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors ${user?.auto_nudge_enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${user?.auto_nudge_enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback */}
        <button
          onClick={() => setShowFeedback(true)}
          className="w-full py-3 text-gray-600 text-sm font-medium border border-gray-200 rounded-2xl hover:bg-gray-50"
        >
          Share feedback
        </button>

        {/* Buy me a coffee */}
        <a
          href="https://www.buymeacoffee.com/dropby"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 text-center text-gray-600 text-sm font-medium border border-gray-200 rounded-2xl hover:bg-gray-50"
        >
          ☕ buymeacoffee.com/dropby
        </a>

        {/* Logout + Delete */}
        <div className="pt-2 space-y-2">
          <button
            onClick={() => { clearAuth(); navigate('/'); }}
            className="w-full py-3 text-gray-600 text-sm font-medium border border-gray-200 rounded-2xl hover:bg-gray-50"
          >
            {t('profile.logout')}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 text-red-500 text-sm font-medium border border-red-100 rounded-2xl hover:bg-red-50"
          >
            {t('profile.deleteAccount')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteAccount.mutate()}
        title={t('profile.deleteTitle')}
        message={t('profile.deleteMessage')}
        confirmLabel={t('profile.deleteAccount')}
        danger
      />

      <AddNudgeModal open={showAddNudge} onClose={() => setShowAddNudge(false)} existing={nudges as any[]} />
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />

      <AvatarCropModal
        open={showAvatarCrop}
        onClose={() => setShowAvatarCrop(false)}
        onSave={blob => uploadAvatar.mutate(blob)}
      />
    </div>
  );
}
