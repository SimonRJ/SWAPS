import { FOOTBALL_WEST_LOGO_ALT, FOOTBALL_WEST_LOGO_URL } from '../utils/clubLogos.js';
import TeamAvatar from './TeamAvatar.jsx';

export default function ClubLogo({
  sizeClass = 'w-10 h-10',
  className = '',
  showLabel = false,
  logoUrl = FOOTBALL_WEST_LOGO_URL,
  alt = FOOTBALL_WEST_LOGO_ALT,
  name = 'Football West',
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TeamAvatar
        src={logoUrl}
        alt={alt}
        name={name}
        sizeClass={sizeClass}
      />
      {showLabel && (
        <div className="leading-tight">
          <p className="text-xs font-bold tracking-wide uppercase whitespace-normal break-words">
            {name}
          </p>
        </div>
      )}
    </div>
  );
}
