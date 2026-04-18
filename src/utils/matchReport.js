function getPlayerName(players, playerId, fallback = '?') {
  if (!playerId) return fallback;
  const found = players?.find(p => p.id === playerId);
  return found?.name || fallback;
}

function normalizeMinute(value) {
  const minute = Number(value);
  return Number.isFinite(minute) ? minute : null;
}

function normalizeEvent(event, players, teamName, opponentName) {
  return {
    ...event,
    minute: normalizeMinute(event?.minute),
    playerName: event?.playerName || getPlayerName(players, event?.playerId),
    offPlayerName: event?.offPlayerName || getPlayerName(players, event?.offPlayerId),
    onPlayerName: event?.onPlayerName || getPlayerName(players, event?.onPlayerId),
    teamName: event?.teamName || teamName,
    opponentName: event?.opponentName || opponentName,
  };
}

export function buildMatchReport({ game, players = [], team }) {
  if (!game) return null;
  const teamName = team?.name || 'Home';
  const opponentName = game?.opponentName || 'Opponent';
  const goals = (game.goals || []).map(goal => ({
    ...goal,
    playerName: goal?.playerName || getPlayerName(players, goal?.playerId),
    minute: normalizeMinute(goal?.minute),
  }));
  const rawEvents = Array.isArray(game.gameLog) ? game.gameLog : [];
  const events = rawEvents.map(event => normalizeEvent(event, players, teamName, opponentName));
  const timeline = [...events].sort((a, b) => {
    const minuteDiff = (a.minute ?? 0) - (b.minute ?? 0);
    if (minuteDiff !== 0) return minuteDiff;
    return (a.createdAtMs || 0) - (b.createdAtMs || 0);
  });
  const saveEvents = timeline.filter(event => event.type === 'save');
  const substitutionEvents = timeline.filter(event => event.type === 'sub');
  const opponentGoals = timeline.filter(event => event.type === 'opponent-goal');

  const startingField = (game.startingField || []).map(slot => ({
    ...slot,
    playerName: slot?.playerName || getPlayerName(players, slot?.playerId),
  }));
  const startingBench = (game.startingBench || []).map(playerId => ({
    playerId,
    playerName: getPlayerName(players, playerId),
  }));

  const saveSummary = saveEvents.length > 0
    ? null
    : Object.entries(game.gkSaves || {})
      .filter(([, count]) => Number(count) > 0)
      .map(([playerId, count]) => ({
        playerId,
        playerName: getPlayerName(players, playerId),
        count: Number(count) || 0,
      }));

  return {
    createdAt: game.reportCreatedAt || new Date().toISOString(),
    teamName,
    opponentName,
    formation: game.formation,
    homeScore: game.homeScore ?? 0,
    awayScore: game.awayScore ?? 0,
    elapsedSeconds: game.elapsedSeconds ?? 0,
    teamSheet: {
      formation: game.formation,
      startingField,
      startingBench,
      availablePlayers: game.availablePlayers || [],
      absentPlayers: game.absentPlayers || [],
    },
    goals,
    saves: saveEvents,
    saveSummary,
    substitutions: substitutionEvents,
    opponentGoals,
    timeline,
    events,
  };
}
