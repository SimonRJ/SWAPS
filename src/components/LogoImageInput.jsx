import { useRef, useState } from 'react';
import { getClipboardImageFile, readImageFileAsDataUrl } from '../utils/imageUpload.js';

export default function LogoImageInput({
  value = '',
  onChange,
  label = 'Logo',
  helperText = 'Upload from photos, or tap and paste an image.',
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
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {value && (
          <button
            type="button"
            onClick={() => {
              setError('');
              onChange('');
            }}
            className="text-xs font-semibold text-red-600"
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
        onChange={e => {
          const [file] = Array.from(e.target.files || []);
          applyFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="btn-secondary w-full"
      >
        Upload Logo Image
      </button>
      <div
        tabIndex={0}
        onPaste={e => {
          const file = getClipboardImageFile(e.clipboardData);
          if (!file) return;
          e.preventDefault();
          applyFile(file);
        }}
        className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-pitch-300"
      >
        {helperText}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
