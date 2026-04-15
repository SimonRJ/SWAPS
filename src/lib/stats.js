export function initialStats(playerId, playerName) {
  return {
    playerId,
    playerName,
    gamesPlayed: 0,
    totalMinutes: 0,
    positionMinutes: {
      GK: 0,
      DEF: 0,
      MID: 0,
      ATK: 0,
      BENCH: 0
    }
  }
}

export function applySubstitutionStats(stats, substitutions) {
  const updated = { ...stats, positionMinutes: { ...stats.positionMinutes } }
  substitutions.forEach((event) => {
    updated.totalMinutes += event.minutes
    updated.positionMinutes[event.position] = (updated.positionMinutes[event.position] || 0) + event.minutes
  })
  return updated
}
