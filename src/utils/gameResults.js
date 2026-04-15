export function getGameResultLabel(game) {
  const ownScore = game.teamScore ?? game.homeScore;
  const rivalScore = game.opponentScore ?? game.awayScore;
  if (ownScore === undefined || rivalScore === undefined) return 'Pending';
  if (ownScore > rivalScore) return 'Win';
  if (ownScore < rivalScore) return 'Lose';
  return 'Draw';
}
