import { useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { authApi } from '../api';
import { deregisterPushToken } from '../utils/notifications';
import { useAuthStore } from '../stores/auth';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import FeedbackModal from '../components/FeedbackModal';
import { useToast } from '../contexts/toast';

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

function AvatarCropModal({ open, onClose, onSave, onRemove, hasAvatar }: { open: boolean; onClose: () => void; onSave: (blob: Blob) => void; onRemove: () => void; hasAvatar: boolean }) {
  const { t } = useTranslation();
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
    <Modal open={open} onClose={handleClose} title={t('profile.changePhoto')}>
      {!imageSrc ? (
        <div className="text-center py-6">
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
          >
            {t('profile.choosePhoto')}
          </button>
          {hasAvatar && (
            <button
              onClick={onRemove}
              className="w-full py-2.5 text-sm text-red-500 hover:text-red-600 font-medium"
            >
              {t('profile.removePhoto')}
            </button>
          )}
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
              className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400"
            >
              {t('profile.changePhoto')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {saving ? t('profile.saving') : t('profile.save')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const setToast = useToast();
  const { user, setUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(user?.display_name || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAvatarCrop, setShowAvatarCrop] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const updateMe = useMutation({
    mutationFn: (data: { display_name?: string }) => authApi.updateMe(data),
    onSuccess: updated => { setUser(updated); setEditName(false); },
  });

  const deleteAccount = useMutation({
    mutationFn: authApi.deleteMe,
    onSuccess: () => { clearAuth(); navigate('/'); },
  });

  const uploadAvatar = useMutation({
    mutationFn: (blob: Blob) => authApi.uploadAvatar(blob),
    onSuccess: (data) => {
      setUser({ ...user!, avatar_url: data.avatar_url });
      setShowAvatarCrop(false);
    },
  });

  const removeAvatar = useMutation({
    mutationFn: authApi.removeAvatar,
    onSuccess: (data) => {
      setUser({ ...user!, avatar_url: data.avatar_url });
      setShowAvatarCrop(false);
    },
  });

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pt-10 pb-6 safe-top">
        <div className="flex items-center mb-5">
          <Link to="/home" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold flex-1 text-center">{t('profile.title')}</h1>
          <div className="w-5" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => setShowAvatarCrop(true)} className="relative group flex-shrink-0">
            <Avatar name={user?.display_name ?? ''} url={user?.avatar_url} size="xl" />
            <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 group-active:opacity-100 flex items-center justify-center transition-opacity">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </button>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{user?.display_name}</p>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Display name */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('profile.displayName')}
            </label>
            {!editName && (
              <button
                onClick={() => { setEditName(true); setNewName(user?.display_name || ''); }}
                className="text-sm text-emerald-600 dark:text-emerald-400 font-medium"
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
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                autoFocus
              />
              <button type="submit" disabled={updateMe.isPending} className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {t('profile.save')}
              </button>
              <button type="button" onClick={() => setEditName(false)} className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">
                {t('profile.cancel')}
              </button>
            </form>
          ) : (
            <p className="text-gray-900 dark:text-gray-50 font-medium">{user?.display_name}</p>
          )}
        </div>

        {/* Email */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
            {t('profile.email')}
          </label>
          <p className="text-gray-900 dark:text-gray-50">{user?.email}</p>
        </div>

        {/* Language */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('profile.language')}
          </label>
          <select
            value={i18n.language}
            onChange={e => i18n.changeLanguage(e.target.value)}
            className="text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-900 border-none outline-none cursor-pointer"
          >
            <option value="en-US">English</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="sv">Svenska</option>
          </select>
        </div>

        {/* Notifications */}
        <Link
          to="/notifications"
          className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between"
        >
          <span className="font-medium text-gray-900 dark:text-gray-50 text-sm">{t('profile.notifications')}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Feedback + Support + Reset */}
        <div className="pt-2 space-y-2">
          <button
            onClick={() => setShowFeedback(true)}
            className="w-full py-3 text-[#7C6AF6] text-sm font-medium border border-[#7C6AF6]/30 dark:border-[#7C6AF6]/20 rounded-2xl hover:bg-[#7C6AF6]/5"
          >
            {t('profile.shareFeedback')}
          </button>
          <a
            href="https://www.buymeacoffee.com/dropby"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 text-center text-gray-600 dark:text-gray-400 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('profile.buyMeCoffee')}
          </a>
          <button
            onClick={() => {
              ['tip_nudge_dismissed', 'tip_invite_dismissed', 'tip_feedback_dismissed', 'tip_coffee_dismissed'].forEach(k => localStorage.removeItem(k));
              setToast({ message: t('profile.tipsReset') });
            }}
            className="w-full py-3 text-gray-600 dark:text-gray-400 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('profile.resetOnboarding')}
          </button>
        </div>

        {/* Logout + Delete */}
        <div className="pt-2 space-y-2">
          <button
            onClick={async () => { await deregisterPushToken(); clearAuth(); navigate('/'); }}
            className="w-full py-3 text-gray-600 dark:text-gray-400 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('profile.logout')}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 text-red-500 text-sm font-medium border border-red-100 dark:border-red-900 rounded-2xl hover:bg-red-50 dark:hover:bg-red-950"
          >
            {t('profile.deleteAccount')}
          </button>
        </div>

        {/* Imprint */}
        <div className="pt-4 pb-2 text-center">
          <Link to="/about" className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">About</Link>
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

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />

      <AvatarCropModal
        open={showAvatarCrop}
        onClose={() => setShowAvatarCrop(false)}
        onSave={blob => uploadAvatar.mutate(blob)}
        onRemove={() => removeAvatar.mutate()}
        hasAvatar={!!user?.avatar_url}
      />
    </div>
  );
}
