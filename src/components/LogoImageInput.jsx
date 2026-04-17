import { useRef, useState } from 'react';
import { getClipboardImageFile, readImageFileAsDataUrl } from '../utils/imageUpload.js';
import TeamAvatar from './TeamAvatar.jsx';

export default function LogoImageInput({
  value = '',
  onChange,
  label = 'Logo',
  helperText = 'Upload from photos, or tap and paste an image.',
  previewName = 'Team',
  hidePreview = false,
  compact = false,
}) {
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function applyFile(file) {
    if (!file) return;
    setError('');

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err?.message || 'Could not add image.');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {label ? (
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">{label}</label>
        ) : (
          <span />
        )}

        {value && (
          <button
            type="button"
            onClick={() => {
              setError('');
              onChange('');
            }}
            className="text-xs font-semibold text-red-600 dark:text-red-300"
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const [file] = Array.from(e.target.files || []);
          applyFile(file);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={compact ? 'btn-secondary w-full !py-2 text-sm' : 'btn-secondary w-full'}
      >
        {value ? 'Change Logo Image' : 'Upload Logo Image'}
      </button>

      {!hidePreview && value && (
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Current Logo
          </p>
          <div className="flex items-center gap-3">
            <TeamAvatar
              src={value}
              name={previewName}
              alt={`${previewName} logo`}
              sizeClass="w-12 h-12"
            />
            <p className="text-xs text-gray-600 dark:text-slate-300">
              Uploaded image will be used across the app.
            </p>
          </div>
        </div>
      )}

      {helperText ? (
        <div
          tabIndex={0}
          onPaste={(e) => {
            const file = getClipboardImageFile(e.clipboardData);
            if (!file) return;
            e.preventDefault();
            applyFile(file);
          }}
          className={`rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-pitch-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${
            compact ? 'px-3 py-2' : 'px-3 py-2'
          }`}
        >
          {helperText}
        </div>
      ) : null}

      {error && <p className="text-xs text-red-500 dark:text-red-300">{error}</p>}
    </div>
  );
}
