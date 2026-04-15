import { OPPONENT_CLUBS, findOpponentClubByName, getOpponentClubById } from '../utils/clubLogos.js';
import TeamAvatar from './TeamAvatar.jsx';
import LogoImageInput from './LogoImageInput.jsx';

export default function OpponentTeamInput({
  label = 'Opponent Team Name',
  team,
  onTeamChange,
  showLogoInput = true,
}) {
  const matchedClub = findOpponentClubByName(team?.name || '');
  const selectedClubId = matchedClub?.id || '__custom__';
  const displayLogoUrl = team?.logoUrl || matchedClub?.logoUrl || '';

  function handleClubChange(clubId) {
    if (clubId === '__custom__') {
      onTeamChange({
        name: team?.name || '',
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

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        className="input-field"
        value={selectedClubId}
        onChange={e => handleClubChange(e.target.value)}
      >
        <option value="__custom__">Select opponent club</option>
        {OPPONENT_CLUBS.map(club => (
          <option key={club.id} value={club.id}>{club.name}</option>
        ))}
      </select>
      {matchedClub && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <TeamAvatar
            src={displayLogoUrl}
            alt={`${matchedClub.name} logo`}
            name={matchedClub.name}
            sizeClass="w-8 h-8"
          />
          <p className="text-xs text-gray-600">
            Selected opponent: <span className="font-semibold text-gray-800">{matchedClub.name}</span>
          </p>
        </div>
      )}
      {showLogoInput && (
        <LogoImageInput
          label="Opponent Logo"
          helperText="Upload an image for this opponent club logo."
          value={team?.logoUrl || ''}
          onChange={(logoUrl) => onTeamChange({
            name: team?.name || '',
            logoUrl,
            confirmed: team?.confirmed ?? Boolean((team?.name || '').trim()),
          })}
        />
      )}
    </div>
  );
}
