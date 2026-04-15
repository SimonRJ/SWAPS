import { useMemo, useState } from 'react';
import { getInitials } from '../utils/logoUtils.js';

export default function TeamAvatar({
  src = '',
  alt = 'Team logo',
  name = '',
  sizeClass = 'w-10 h-10',
  className = '',
  imageClassName = '',
  fallbackClassName = '',
  referrerPolicy = 'no-referrer',
}) {
  const [failedSrc, setFailedSrc] = useState('');

  const initials = useMemo(() => getInitials(name, '?'), [name]);
  const canShowImage = !!src && failedSrc !== src;

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden border border-gray-200 bg-white shadow-sm flex items-center justify-center ${className}`}>
      {canShowImage ? (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-contain bg-white ${imageClassName}`}
          referrerPolicy={referrerPolicy}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div
          aria-label={`${name || 'Team'} initials`}
          role="img"
          className={`w-full h-full bg-gradient-to-br from-pitch-500 to-pitch-700 text-white font-bold flex items-center justify-center ${fallbackClassName}`}
        >
          <span className="text-xs tracking-wide">{initials}</span>
        </div>
      )}
    </div>
  );
}
