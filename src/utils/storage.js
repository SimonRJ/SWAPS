import { findClubByName, getClubById } from './clubLogos.js';
import { normalizeShirtNumber } from './playerUtils.js';
export const AGE_CATEGORIES = ['U10', 'U11', 'U12'];
export const FIXED_GAME_DURATION = 50;

function normalizeHomeAway(value) {
  return value === 'AWAY' ? 'AWAY' : 'HOME';
}

function normalizeAgeCategory(value) {
  return AGE_CATEGORIES.includes(value) ? value : 'U10';
}

export function createScheduleRound(round, partial = {}) {
  return {
    round,
    opponentName: partial.opponentName || '',
    opponentLogoUrl: partial.opponentLogoUrl || '',
    date: partial.date || '',
    kickoffTime: partial.kickoffTime || '',
    location: partial.location || '',
    homeAway: normalizeHomeAway(partial.homeAway),
  };
}

export function buildSeasonSchedule(gamesPerSeason, existing = []) {
  const totalRounds = Math.max(1, Number(gamesPerSeason) || 1);
  const byRound = new Map(
    (existing || [])
      .filter(item => item && Number.isFinite(Number(item.round)))
      .map(item => [Number(item.round), item]),
  );
  return Array.from({ length: totalRounds }, (_, idx) => {
    const round = idx + 1;
    return createScheduleRound(round, byRound.get(round));
  });
}

export function getPlayedRoundSet(gameHistory = []) {
  return new Set(
    (gameHistory || [])
      .map(game => Number(game?.gameNumber))
      .filter(Number.isFinite),
  );
}

export function getCancelledRoundSet(cancelledGameDetails = []) {
  return new Set(
    (cancelledGameDetails || [])
      .map(game => Number(game?.round))
      .filter(Number.isFinite),
  );
}

export function getNextUnresolvedRound(data) {
  const playedRounds = getPlayedRoundSet(data?.gameHistory || []);
  const cancelledRounds = getCancelledRoundSet(data?.cancelledGameDetails || []);
  const totalRounds = Math.max(1, Number(data?.team?.gamesPerSeason) || 1);
  for (let round = 1; round <= totalRounds; round++) {
    if (!playedRounds.has(round) && !cancelledRounds.has(round)) return round;
  }
  const maxRound = Math.max(0, ...Array.from(playedRounds), ...Array.from(cancelledRounds));
  return maxRound + 1;
}

// Hash passcode with SHA-256 so it is not stored in clear text
export async function hashPasscode(passcode) {
  const encoded = new TextEncoder().encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getDefaultData(teamInput, passcode) {
  const passcodeHash = await hashPasscode(passcode);
  const teamProfile = (() => {
    if (typeof teamInput === 'string') return { name: teamInput };
    if (teamInput && typeof teamInput === 'object') return teamInput;
    return { name: '' };
  })();
  const selectedClub = getClubById(teamProfile.clubId) || findClubByName(teamProfile.name);
  const gamesPerSeason = 18;
  return {
    team: {
      name: teamProfile.name || selectedClub?.name || '',
      clubId: selectedClub?.id || teamProfile.clubId || '',
      logoUrl: teamProfile.logoUrl || selectedClub?.logoUrl || '',
      passcodeHash,
      ageCategory: 'U10',
      fieldPlayers: 8,
      gameDuration: FIXED_GAME_DURATION,
      gamesPerSeason,
      rotateGK: true,
      fixedGKPlayerId: null,
    },
    players: [],
    currentGame: null,
    pendingGameSetup: null,
    gameHistory: [],
    cancelledGames: 0,
    cancelledGameDetails: [],
    seasonSchedule: buildSeasonSchedule(gamesPerSeason),
  };
}

/**
 * Migrate legacy player data to include new fields.
 * Safe to call on already-migrated data.
 */
export function migrateData(data) {
  if (!data) return data;
  const migrated = { ...data };
  if (migrated.team && !('fixedGKPlayerId' in migrated.team)) {
    migrated.team = {
      ...migrated.team,
      fixedGKPlayerId: null,
    };
  }
  if (migrated.team) {
    const matchedClub = getClubById(migrated.team.clubId) || findClubByName(migrated.team.name);
    migrated.team = {
      ...migrated.team,
      ageCategory: normalizeAgeCategory(migrated.team.ageCategory),
      gameDuration: FIXED_GAME_DURATION,
      clubId: migrated.team.clubId || matchedClub?.id || '',
      logoUrl: migrated.team.logoUrl || matchedClub?.logoUrl || '',
    };
  }
  // Ensure cancelled games fields exist
  if (migrated.cancelledGames === undefined) {
    migrated.cancelledGames = 0;
  }
  if (!Array.isArray(migrated.cancelledGameDetails)) {
    const legacyCount = Math.max(0, Number(migrated.cancelledGames) || 0);
    const usedRounds = getPlayedRoundSet(migrated.gameHistory || []);
    const totalRounds = Math.max(1, Number(migrated.team?.gamesPerSeason) || 1);
    migrated.cancelledGameDetails = Array.from({ length: legacyCount }, () => {
      let round = 1;
      while (round <= totalRounds && usedRounds.has(round)) round++;
      if (round > totalRounds) {
        round = Math.max(0, ...Array.from(usedRounds)) + 1;
      }
      usedRounds.add(round);
        return {
          round,
          opponentName: '',
          opponentLogoUrl: '',
          date: '',
          kickoffTime: '',
          location: '',
          homeAway: 'HOME',
          cancelledDate: '',
        };
    });
  } else {
    migrated.cancelledGameDetails = migrated.cancelledGameDetails.map((item, idx) => ({
      round: Number(item?.round) || idx + 1,
      opponentName: item?.opponentName || '',
      opponentLogoUrl: item?.opponentLogoUrl || '',
      date: item?.date || '',
      kickoffTime: item?.kickoffTime || '',
      location: item?.location || '',
      homeAway: normalizeHomeAway(item?.homeAway),
      cancelledDate: item?.cancelledDate || '',
    }));
  }
  migrated.cancelledGames = migrated.cancelledGameDetails.length;

  // Ensure pending pre-game setup shape exists
  const pendingSetup = migrated.pendingGameSetup;
  if (
    pendingSetup
    && Number.isFinite(Number(pendingSetup.roundNumber))
    && Array.isArray(pendingSetup.plan)
  ) {
    migrated.pendingGameSetup = {
      roundNumber: Number(pendingSetup.roundNumber),
      plan: pendingSetup.plan,
      absentPlayerIds: Array.isArray(pendingSetup.absentPlayerIds) ? pendingSetup.absentPlayerIds : [],
      absentMinutes: Array.isArray(pendingSetup.absentMinutes) ? pendingSetup.absentMinutes : [],
    };
  } else {
    migrated.pendingGameSetup = null;
  }

  // Ensure season schedule exists and matches games per season
  migrated.seasonSchedule = buildSeasonSchedule(
    migrated.team?.gamesPerSeason,
    migrated.seasonSchedule,
  );

  // Ensure all players have the minutesSickInjured field
  if (migrated.players) {
    migrated.players = migrated.players.map(p => ({
      ...p,
      shirtNumber: normalizeShirtNumber(p.shirtNumber),
      minutesSickInjured: p.minutesSickInjured || 0,
      minutesBench: p.minutesBench || 0,
      saves: p.saves || 0,
    }));
  }
  return migrated;
}

export function generateId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
