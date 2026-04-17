import { OPPONENT_CLUBS, findOpponentClubByName, getOpponentClubById } from '../utils/clubLogos.js';
import TeamAvatar from './TeamAvatar.jsx';
import LogoImageInput from './LogoImageInput.jsx';

export default function OpponentTeamInput({
  label = 'Opponent Team Name',
  team,
  onTeamChange,
  showLogoInput = true,
  hidePreview = false,
  compact = false,
  logoInline = false,
}) {
  const matchedClub = findOpponentClubByName(team?.name || '');
  const hasCustomName = Boolean((team?.name || '').trim()) && !matchedClub;
  const selectedClubId = matchedClub?.id || '__custom__';
  const displayLogoUrl = team?.logoUrl || matchedClub?.logoUrl || '';
  const displayName = team?.name || matchedClub?.name || 'Opponent';

  function handleClubChange(clubId) {
    if (clubId === '__custom__') {
      onTeamChange({
        name: matchedClub ? '' : (team?.name || ''),
        logoUrl: team?.logoUrl || '',
        confirmed: false,
      });
      return;
    }

    const club = getOpponentClubById(clubId);
    if (!club) return;

    onTeamChange({
      name: club.name,
      logoUrl: club.logoUrl || '',
      confirmed: true,
    });
  }

  function handleCustomNameChange(name) {
    onTeamChange({
      name,
      logoUrl: team?.logoUrl || '',
      confirmed: Boolean(name.trim()),
    });
  }

  function handleLogoChange(logoUrl) {
    onTeamChange({
      name: team?.name || '',
      logoUrl,
      confirmed: team?.confirmed ?? Boolean((team?.name || '').trim()),
    });
  }

  return (
    <div className="space-y-2">
      {label ? (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      ) : null}

      <div className={`rounded-2xl border border-gray-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
        <div className="flex items-start gap-3">
          {logoInline && (
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              <TeamAvatar
                src={displayLogoUrl}
                alt={`${displayName} logo`}
                name={displayName}
                sizeClass="w-11 h-11"
              />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-3">
            <select
              className="input-field"
              value={selectedClubId}
              onChange={(e) => handleClubChange(e.target.value)}
            >
              <option value="__custom__">Custom opponent</option>
              {OPPONENT_CLUBS.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>

            {selectedClubId === '__custom__' && (
              <input
                className="input-field"
                placeholder="Enter opponent team name"
                value={hasCustomName ? team?.name || '' : ''}
                onChange={(e) => handleCustomNameChange(e.target.value)}
              />
            )}

            {showLogoInput && (
              <LogoImageInput
                label="Club Logo"
                helperText=""
                value={team?.logoUrl || ''}
                previewName={displayName}
                hidePreview
                compact
                onChange={handleLogoChange}
              />
            )}
          </div>
        </div>
      </div>

      {!hidePreview && matchedClub && !compact && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <TeamAvatar
            src={displayLogoUrl}
            alt={`${matchedClub.name} logo`}
            name={matchedClub.name}
            sizeClass="w-8 h-8"
          />
          <p className="text-xs text-gray-600">
            Selected opponent:{' '}
            <span className="font-semibold text-gray-800">{matchedClub.name}</span>
          </p>
        </div>
      )}
    </div>
  );
}
