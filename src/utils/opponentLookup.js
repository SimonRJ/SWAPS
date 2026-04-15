import { firstValidLogoUrl, normalizeImageUrl } from './logoUtils.js';

const SPORTS_DB_API_KEY = import.meta.env.VITE_SPORTSDB_API_KEY || '3';
const SEARCH_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_API_KEY}/searchteams.php?t=`;

function normalizeWebsiteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasProtocol = ['http://', 'https://', '//'].some(prefix => raw.startsWith(prefix));
  return normalizeImageUrl(hasProtocol ? raw : `https://${raw}`);
}

function websiteLogoUrl(team) {
  const websiteUrl = normalizeWebsiteUrl(team?.strWebsite);
  if (!websiteUrl) return '';

  try {
    const url = new URL('/favicon.ico', websiteUrl);
    return url.toString();
  } catch {
    return '';
  }
}

function isSoccerTeam(team) {
  return team?.strSport ? team.strSport.toLowerCase().includes('soccer') : true;
}

function isWesternAustralianTeam(team) {
  const haystack = [
    team?.strCountry || '',
    team?.strLeague || '',
    team?.strLeague2 || '',
    team?.strStadiumLocation || '',
    team?.strDescriptionEN || '',
  ].join(' ').toLowerCase();

  if (!haystack) return false;
  if (!haystack.includes('australia')) return false;

  return (
    haystack.includes('western australia')
    || /\bwa\b/.test(haystack)
    || haystack.includes('perth')
  );
}

function mapTeam(team) {
  const badgeLogo = firstValidLogoUrl(
    team?.strBadge,
    team?.strTeamBadge,
    team?.strLogo,
    team?.strLogoWide,
    team?.strTeamLogo,
  );

  return {
    id: team?.idTeam || `${team?.strTeam || ''}-${team?.strLeague || ''}`,
    name: team?.strTeam || '',
    league: team?.strLeague || '',
    country: team?.strCountry || '',
    sport: team?.strSport || '',
    websiteUrl: normalizeWebsiteUrl(team?.strWebsite),
    logoUrl: firstValidLogoUrl(badgeLogo, websiteLogoUrl(team)),
  };
}

export async function searchOpponentTeams(query, options = {}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const res = await fetch(`${SEARCH_URL}${encodeURIComponent(trimmed)}`, {
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(`Lookup failed (${res.status})`);
  }

  const payload = await res.json();
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  const soccerTeams = teams.filter(isSoccerTeam);
  const waTeams = soccerTeams.filter(isWesternAustralianTeam);
  const shortList = waTeams.length > 0 ? waTeams : soccerTeams;
  const seen = new Set();
  const needle = trimmed.toLowerCase();
  const PRIORITY_MATCH = 0;
  const PRIORITY_NO_MATCH = 1;

  return shortList
    .map(mapTeam)
    .map(team => ({
      ...team,
      _nameLower: team.name.toLowerCase(),
    }))
    .filter(team => {
      if (!team.name) return false;
      const key = team.id || `${team._nameLower}|${team.league.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aStarts = a._nameLower.startsWith(needle) ? PRIORITY_MATCH : PRIORITY_NO_MATCH;
      const bStarts = b._nameLower.startsWith(needle) ? PRIORITY_MATCH : PRIORITY_NO_MATCH;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    })
    .map(team => {
      const next = { ...team };
      delete next._nameLower;
      return next;
    })
    .slice(0, 6);
}
