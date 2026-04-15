import { normalizeShirtNumber } from '../utils/playerUtils.js';

const JERSEY_RADIUS_CLASS = 'rounded-[32%_32%_18%_18%]';

// Murdoch University Melville FC circle logo as a small SVG badge.
// Simplified circle crest with "MUM" text for compact rendering.
function JerseyCrestSvg({ size = 6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="absolute" style={{ top: '28%', right: '14%' }}>
      <circle cx="10" cy="10" r="9" fill="#1e3a5f" stroke="#c8a84e" strokeWidth="1.5" />
      <text x="10" y="13" textAnchor="middle" fill="#c8a84e" fontSize="7" fontWeight="bold" fontFamily="sans-serif">FC</text>
    </svg>
  );
}

// SVG-based jersey with red body and black sleeves
function JerseySvg({ number, sizeClass, textClassName, isBench }) {
  const bodyFill = isBench ? '#6b7280' : '#cc0000';
  const sleeveFill = isBench ? '#4b5563' : '#1a1a1a';
  const collarFill = isBench ? '#4b5563' : '#1a1a1a';
  const seamColor = isBench ? '#555' : '#990000';
  return (
    <div className={`${sizeClass} relative flex items-center justify-center`}>
      <svg viewBox="0 0 100 120" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Left sleeve */}
        <path d="M14 0 L0 28 L12 46 L12 0 Z" fill={sleeveFill} />
        {/* Right sleeve */}
        <path d="M86 0 L100 28 L88 46 L88 0 Z" fill={sleeveFill} />
        {/* Main body */}
        <path d="M14 0 L34 0 L41 13 L59 13 L66 0 L86 0 L100 28 L88 46 L88 120 L12 120 L12 46 L0 28 Z" fill={bodyFill} />
        {/* Collar */}
        <path d="M41 13 L44 4 L56 4 L59 13 Z" fill={collarFill} />
        {/* Shoulder seam lines */}
        <line x1="12" y1="0" x2="12" y2="46" stroke={seamColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="88" y1="0" x2="88" y2="46" stroke={seamColor} strokeWidth="0.5" opacity="0.4" />
        {/* Crest circle on right chest */}
        {!isBench && (
          <>
            <circle cx="34" cy="38" r="7" fill="#1e3a5f" stroke="#c8a84e" strokeWidth="1" />
            <text x="34" y="41" textAnchor="middle" fill="#c8a84e" fontSize="6" fontWeight="bold" fontFamily="sans-serif">FC</text>
          </>
        )}
      </svg>
      {/* Shirt number in white, centered on chest */}
      <span className={`relative z-10 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] ${textClassName}`} style={{ marginTop: '15%' }}>
        {number}
      </span>
    </div>
  );
}

export default function PlayerAvatar({
  player,
  sizeClass = 'w-8 h-8',
  className = '',
  textClassName = '',
  variant = 'circle',
  isBench = false,
  style,
}) {
  const shirtNumber = normalizeShirtNumber(player?.shirtNumber);
  const fallback = player?.name?.charAt(0)?.toUpperCase() || '?';
  const label = shirtNumber || fallback;

  if (variant === 'jersey') {
    return (
      <div className={className} style={style}>
        <JerseySvg number={label} sizeClass={sizeClass} textClassName={textClassName} isBench={isBench} />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold ${className}`}
      style={style}
    >
      <span className={textClassName}>{label}</span>
    </div>
  );
}
