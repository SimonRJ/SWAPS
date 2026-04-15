export const FOOTBALL_WEST_LOGO_URL = '/football-west-logo.png';
export const FOOTBALL_WEST_LOGO_ALT = 'Football West official logo';

export const FOOTBALL_WEST_CLUBS = [
  { id: 'armadale-sc', name: 'Armadale SC', logoUrl: 'https://www.armadale-soccer-club.com.au/favicon.ico' },
  { id: 'aubin-grove-united', name: 'Aubin Grove United FC', logoUrl: 'https://aubingrovefc.com.au/favicon.ico' },
  { id: 'balcatta-etna', name: 'Balcatta Etna FC', logoUrl: 'https://www.balcattafc.com.au/favicon.ico' },
  { id: 'bayswater-city', name: 'Bayswater City SC', logoUrl: 'https://www.bayswatercitysc.com.au/favicon.ico' },
  { id: 'canning-city', name: 'Canning City FC', logoUrl: 'https://www.canningcity.com.au/favicon.ico' },
  { id: 'cockburn-city', name: 'Cockburn City SC', logoUrl: 'https://www.cockburncity.com.au/favicon.ico' },
  { id: 'curtin-university', name: 'Curtin University FC', logoUrl: 'https://www.curtinfc.com.au/favicon.ico' },
  { id: 'floreat-athena', name: 'Floreat Athena FC', logoUrl: 'https://www.floreatathena.com.au/favicon.ico' },
  { id: 'fremantle-city', name: 'Fremantle City FC', logoUrl: 'https://www.fremantlecityfc.com.au/favicon.ico' },
  { id: 'gosnells-city', name: 'Gosnells City FC', logoUrl: 'https://www.gosnellssoccerclub.com.au/favicon.ico' },
  { id: 'inglewood-united', name: 'Inglewood United FC', logoUrl: 'https://www.inglewoodunited.com.au/favicon.ico' },
  { id: 'joondalup-city', name: 'Joondalup City FC', logoUrl: 'https://www.joondalupcityfc.com.au/favicon.ico' },
  { id: 'kelmscott-roos', name: 'Kelmscott Roos FC', logoUrl: 'https://www.kelmscottroosfc.com.au/favicon.ico' },
  { id: 'kingsley-westside', name: 'Kingsley Westside FC', logoUrl: 'https://www.kingsleywestside.com.au/favicon.ico' },
  { id: 'maccabi-ajax', name: 'Maccabi-Ajax FC', logoUrl: 'https://www.maccabiajax.com.au/favicon.ico' },
  { id: 'mandurah-city', name: 'Mandurah City FC', logoUrl: 'https://www.mandurahcityfc.com.au/favicon.ico' },
  { id: 'murdoch-melville', name: 'Murdoch Melville University FC', logoUrl: 'https://mumfc.com.au/favicon.ico' },
  { id: 'olympic-kingsway', name: 'Olympic Kingsway SC', logoUrl: 'https://www.olympickingsway.com.au/favicon.ico' },
  { id: 'perth-redstar', name: 'Perth RedStar FC', logoUrl: 'https://www.perthredstar.com.au/favicon.ico' },
  { id: 'perth-sc', name: 'Perth SC', logoUrl: 'https://www.perthsc.com.au/favicon.ico' },
  { id: 'sorrento', name: 'Sorrento FC', logoUrl: 'https://www.sorrentofc.com.au/favicon.ico' },
  { id: 'stirling-macedonia', name: 'Stirling Macedonia FC', logoUrl: 'https://www.stirlingmacedonia.com.au/favicon.ico' },
  { id: 'subiaco', name: 'Subiaco AFC', logoUrl: 'https://www.subiacoafc.com.au/favicon.ico' },
  { id: 'uwa-nedlands', name: 'UWA Nedlands FC', logoUrl: 'https://www.uwanedlandsfc.com.au/favicon.ico' },
];

export const OPPONENT_CLUBS = [
  { id: 'mandurah-city', name: 'Mandurah City FC', logoUrl: 'https://www.mandurahcityfc.com.au/favicon.ico' },
  { id: 'perth-saints', name: 'Perth Saints FC', logoUrl: '' },
  { id: 'aubin-grove-united', name: 'Aubin Grove United FC', logoUrl: 'https://aubingrovefc.com.au/favicon.ico' },
  { id: 'rockingham-city', name: 'Rockingham City FC', logoUrl: '' },
  {
    id: 'murdoch-university-melville',
    name: 'Murdoch University Melville FC',
    logoUrl: 'https://mumfc.com.au/favicon.ico',
    aliases: ['Murdoch Melville University FC'],
  },
];

function normalizeClubName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getOpponentClubById(clubId) {
  return OPPONENT_CLUBS.find(club => club.id === clubId) || null;
}

export function findOpponentClubByName(name) {
  const needle = normalizeClubName(name);
  if (!needle) return null;
  return OPPONENT_CLUBS.find((club) => {
    if (normalizeClubName(club.name) === needle) return true;
    return (club.aliases || []).some(alias => normalizeClubName(alias) === needle);
  }) || null;
}

export function getClubById(clubId) {
  return FOOTBALL_WEST_CLUBS.find(club => club.id === clubId) || null;
}

export function findClubByName(name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  return FOOTBALL_WEST_CLUBS.find(club => club.name.toLowerCase() === needle) || null;
}
