import { useEffect, useMemo, useState } from 'react';
import { calculateSeasonTargets, planRemainingSeasonSheets, getSubsBetweenBlocks } from '../utils/subAlgorithm.js';
import { parseFormation, formatFormation } from '../utils/formations.js';
import { buildSeasonSchedule } from '../utils/storage.js';
import { getGameResultLabel } from '../utils/gameResults.js';
import { generateRoundPdf } from '../utils/pdfRoundSheet.js';
import OpponentTeamInput from './OpponentTeamInput.jsx';
import TeamAvatar from './TeamAvatar.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

function MinuteBar({ label, minutes, maxMinutes, colorClass, target }) {
  const pct = maxMinutes > 0 ? Math.round((minutes / maxMinutes) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-900 font-bold">
          {minutes} min
          {target > 0 && <span className="text-gray-400 font-normal"> / {target} target</span>}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function getDateDisplay(date) {
  return date || 'Date TBC';
}

function resultColorClass(label) {
  if (label === 'Win') return 'bg-emerald-100 text-emerald-700';
  if (label === 'Lose') return 'bg-red-100 text-red-700';
  if (label === 'Draw') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function resultBlobColor(label) {
  if (label === 'Win') return 'bg-emerald-500';
  if (label === 'Lose') return 'bg-red-500';
  if (label === 'Draw') return 'bg-gray-400';
  return 'bg-slate-300';
}

function resultBlobLetter(label) {
  if (label === 'Win') return 'W';
  if (label === 'Lose') return 'L';
  if (label === 'Draw') return 'D';
  return '?';
}

export default function StatsTab({ data, onUpdate }) {
  const { players, team, gameHistory } = data;
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [overviewView, setOverviewView] = useState('overview');
  const [editingRound, setEditingRound] = useState(null);
  const [roundDraft, setRoundDraft] = useState(null);
  const [editingCancelledRound, setEditingCancelledRound] = useState(null);
  const [cancelledDraft, setCancelledDraft] = useState(null);
  const [teamSheetRound, setTeamSheetRound] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [overviewView, selectedPlayer]);

  const activePlayers = players.filter(p => p.isActive);
  const history = useMemo(() => gameHistory || [], [gameHistory]);
  const schedule = useMemo(
    () => buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule),
    [team.gamesPerSeason, data.seasonSchedule],
  );
  const cancelledDetails = data.cancelledGameDetails || [];
  const playedHistory = useMemo(
    () => [...history].sort((a, b) => (b.gameNumber || 0) - (a.gameNumber || 0)),
    [history],
  );
  const playedRounds = new Set(history.map(g => Number(g.gameNumber)).filter(Number.isFinite));
  const cancelledRounds = new Set(cancelledDetails.map(g => Number(g.round)).filter(Number.isFinite));

  function totalMins(p) {
    return (p.minutesGK || 0) + (p.minutesDEF || 0) + (p.minutesMID || 0) + (p.minutesATK || 0);
  }

  function totalMinsWithSick(p) {
    return totalMins(p) + (p.minutesSickInjured || 0);
  }

  // Formation is always 3-3-2
  const FORCED_FORMATION = [3, 3, 2];
  const defaultFormation = FORCED_FORMATION;
  const targets = activePlayers.length > 0
    ? calculateSeasonTargets(team, activePlayers.length, defaultFormation, team.rotateGK)
    : null;

  const remainingRounds = schedule.filter(round => (
    !playedRounds.has(round.round) && !cancelledRounds.has(round.round)
  ));

  // Pre-compute team sheets for ALL remaining rounds together.
  // This ensures each round's plan takes into account simulated minutes
  // from preceding rounds, producing fair distribution across the season.
  // When a live game exists with absent players, the current game's actual
  // plan is used and remaining games are recalculated accordingly.
  const minFieldCount = team.fieldPlayers + 1;
  const hasLiveGame = Boolean(data.currentGame);
  const seasonSheets = useMemo(() => {
    const active = players.filter(p => p.isActive);
    if (active.length < (team.fieldPlayers + 1)) return [];
    const lastPlayed = (gameHistory || []).slice(-1)[0];
    const formation = lastPlayed ? parseFormation(lastPlayed.formation) : [3, 3, 2];
    const played = new Set((gameHistory || []).map(g => Number(g?.gameNumber)).filter(Number.isFinite));
    const cancelled = new Set((data.cancelledGameDetails || []).map(g => Number(g?.round)).filter(Number.isFinite));
    const sched = buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule);
    const remaining = sched.filter(round => !played.has(round.round) && !cancelled.has(round.round));
    if (remaining.length === 0) return [];
    const roundNumbers = remaining.map(r => r.round);

    // Apply live-game override when a game is in progress, otherwise use
    // pre-game confirmation from setup so sheets update before kickoff.
    let currentGameOverride = null;
    const cg = data.currentGame;
    const pendingSetup = data.pendingGameSetup;
    if (cg && cg.plan) {
      currentGameOverride = {
        roundNumber: cg.gameNumber,
        plan: cg.plan,
        absentPlayerIds: cg.absentPlayers || [],
        absentMinutes: cg.absentMinutes || [],
      };
    } else if (pendingSetup && pendingSetup.plan) {
      currentGameOverride = {
        roundNumber: pendingSetup.roundNumber,
        plan: pendingSetup.plan,
        absentPlayerIds: pendingSetup.absentPlayerIds || [],
        absentMinutes: pendingSetup.absentMinutes || [],
      };
    }

    return planRemainingSeasonSheets(active, formation, team, gameHistory || [], roundNumbers, currentGameOverride);
  }, [players, team, gameHistory, data.cancelledGameDetails, data.seasonSchedule, data.currentGame, data.pendingGameSetup]);

  const gamesPlayed = history.length;
  const gamesRemaining = remainingRounds.length;
  const cancelledCount = cancelledDetails.length;

  const maxTotal = activePlayers.reduce((max, p) => Math.max(max, totalMinsWithSick(p)), 1);

  function openRoundEditor(round) {
    setEditingRound(round.round);
    setRoundDraft({
      ...round,
      homeAway: round.homeAway === 'AWAY' ? 'AWAY' : 'HOME',
    });
  }

  function closeRoundEditor() {
    setEditingRound(null);
    setRoundDraft(null);
  }

  function saveRoundEditor() {
    if (!roundDraft || !onUpdate) return;
    const updatedSchedule = schedule.map(item => (
      item.round === editingRound
        ? {
            ...item,
            opponentName: roundDraft.opponentName || '',
            opponentLogoUrl: roundDraft.opponentLogoUrl || '',
            date: roundDraft.date || '',
            homeAway: roundDraft.homeAway === 'AWAY' ? 'AWAY' : 'HOME',
          }
        : item
    ));
    onUpdate({ ...data, seasonSchedule: updatedSchedule });
    closeRoundEditor();
  }

  function openCancelledEditor(game) {
    setEditingCancelledRound(game.round);
    setCancelledDraft({
      ...game,
      homeAway: game.homeAway === 'AWAY' ? 'AWAY' : 'HOME',
    });
  }

  function closeCancelledEditor() {
    setEditingCancelledRound(null);
    setCancelledDraft(null);
  }

  function saveCancelledEditor() {
    if (!cancelledDraft || !onUpdate) return;
    const nextCancelled = cancelledDetails
      .map(item => (
        item.round === editingCancelledRound
          ? {
              ...item,
              opponentName: cancelledDraft.opponentName || '',
              opponentLogoUrl: cancelledDraft.opponentLogoUrl || '',
              date: cancelledDraft.date || '',
              homeAway: cancelledDraft.homeAway === 'AWAY' ? 'AWAY' : 'HOME',
            }
          : item
      ))
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    const updatedSchedule = schedule.map(item => (
      item.round === editingCancelledRound
        ? {
            ...item,
            opponentName: cancelledDraft.opponentName || '',
            opponentLogoUrl: cancelledDraft.opponentLogoUrl || '',
            date: cancelledDraft.date || '',
            homeAway: cancelledDraft.homeAway === 'AWAY' ? 'AWAY' : 'HOME',
          }
        : item
    ));
    onUpdate({
      ...data,
      cancelledGameDetails: nextCancelled,
      cancelledGames: nextCancelled.length,
      seasonSchedule: updatedSchedule,
    });
    closeCancelledEditor();
  }

  function removeCancelledGame(round) {
    if (!window.confirm(`Remove cancelled status for Round ${round}?`)) return;
    const nextCancelled = cancelledDetails
      .filter(item => Number(item.round) !== Number(round))
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    onUpdate({
      ...data,
      cancelledGameDetails: nextCancelled,
      cancelledGames: nextCancelled.length,
    });
    if (Number(editingCancelledRound) === Number(round)) closeCancelledEditor();
  }

  function switchOverview(view) {
    closeRoundEditor();
    closeCancelledEditor();
    setOverviewView(view);
  }

  // Helper to generate PDF for a given round from the remaining games list
  function handleRoundPdf(roundNumber) {
    const seasonSheet = seasonSheets.find(s => s.round === roundNumber);
    const gamePlan = seasonSheet?.plan || null;
    if (!gamePlan) return;

    const roundInfo = schedule.find(r => r.round === roundNumber);
    const formationArr = defaultFormation;
    const formationStr = formatFormation(formationArr);

    // Calculate estimated minutes per player for this game
    const playerMins = {};
    for (const p of activePlayers) {
      playerMins[p.id] = { field: 0, bench: 0, positions: {} };
    }
    for (let b = 0; b < gamePlan.length; b++) {
      const block = gamePlan[b];
      for (const { playerId, position } of block.onField) {
        if (playerMins[playerId]) {
          playerMins[playerId].field += 10;
          playerMins[playerId].positions[position] = (playerMins[playerId].positions[position] || 0) + 10;
        }
      }
      for (const benchId of block.onBench) {
        if (playerMins[benchId]) {
          playerMins[benchId].bench += 10;
        }
      }
    }

    // Build sub changes
    const subs = [];
    if (gamePlan.length > 1) {
      for (let b = 1; b < gamePlan.length; b++) {
        const changes = getSubsBetweenBlocks(gamePlan[b - 1], gamePlan[b]);
        if (changes.length > 0) {
          subs.push({ minute: b * 10, subs: changes });
        }
      }
    }

    // Build cumulative stats up to and including this round
    const cumStats = {};
    for (const p of activePlayers) {
      cumStats[p.id] = {
        minutesGK: p.minutesGK || 0,
        minutesDEF: p.minutesDEF || 0,
        minutesMID: p.minutesMID || 0,
        minutesATK: p.minutesATK || 0,
        minutesBench: p.minutesBench || 0,
        goals: 0,
        saves: p.saves || 0,
      };
    }
    for (const game of (gameHistory || [])) {
      for (const goal of (game.goals || [])) {
        if (goal.playerId && cumStats[goal.playerId]) {
          cumStats[goal.playerId].goals += 1;
        }
      }
    }
    for (const sheet of seasonSheets) {
      if (sheet.round > roundNumber) break;
      if (!sheet.plan) continue;
      const plan = sheet.plan;
      const gameFieldMins = {};
      for (const p of activePlayers) gameFieldMins[p.id] = 0;
      for (let b = 0; b < plan.length; b++) {
        for (const { playerId, position } of plan[b].onField) {
          if (cumStats[playerId]) {
            if (position === 'GK') cumStats[playerId].minutesGK += 10;
            else if (position === 'DEF') cumStats[playerId].minutesDEF += 10;
            else if (position === 'MID') cumStats[playerId].minutesMID += 10;
            else if (position === 'ATK') cumStats[playerId].minutesATK += 10;
            gameFieldMins[playerId] = (gameFieldMins[playerId] || 0) + 10;
          }
        }
      }
      // Add bench minutes for this game (skip absent players)
      const sheetAbsentSet = new Set(sheet.absentPlayerIds || []);
      for (const p of activePlayers) {
        if (sheetAbsentSet.has(p.id)) continue;
        const fMins = gameFieldMins[p.id] || 0;
        const bMins = team.gameDuration - fMins;
        if (bMins > 0 && cumStats[p.id]) {
          cumStats[p.id].minutesBench += bMins;
        }
      }
    }

    generateRoundPdf({
      roundNumber,
      roundInfo,
      teamName: team.name,
      teamLogoUrl: team.logoUrl || '',
      opponentLogoUrl: roundInfo?.opponentLogoUrl || '',
      formationStr,
      gameDuration: team.gameDuration,
      gamePlan,
      subChanges: subs,
      playerMinutes: playerMins,
      activePlayers,
      cumulativeStats: cumStats,
      openInNewTab: hasLiveGame,
    });
  }

  if (selectedPlayer) {
    const p = players.find(pl => pl.id === selectedPlayer);
    if (!p) { setSelectedPlayer(null); return null; }
    const total = totalMins(p);
    const sickMins = p.minutesSickInjured || 0;
    const benchMins = p.minutesBench || 0;
    const saves = p.saves || 0;
    const maxMin = Math.max(p.minutesGK || 0, p.minutesDEF || 0, p.minutesMID || 0, p.minutesATK || 0, benchMins, sickMins, 1);
    return (
      <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <button onClick={() => setSelectedPlayer(null)} className="text-pitch-600 font-semibold text-sm flex items-center gap-1">
          ← Back to Stats
        </button>
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar
              player={p}
              sizeClass="w-14 h-14"
              className="bg-pitch-100 text-pitch-700"
              textClassName="text-2xl font-black"
            />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{p.name}</h2>
              <p className="text-sm text-gray-500">
                {total} min played{benchMins > 0 ? ` · ${benchMins} min bench` : ''}{sickMins > 0 ? ` · ${sickMins} min sick/injured` : ''}{saves > 0 ? ` · 🧤 ${saves} saves` : ''}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <MinuteBar label="🥅 Goalkeeper" minutes={p.minutesGK || 0} maxMinutes={maxMin}
              colorClass="bg-yellow-400" target={targets?.targetGK || 0} />
            <MinuteBar label="🛡 Defender" minutes={p.minutesDEF || 0} maxMinutes={maxMin}
              colorClass="bg-blue-500" target={targets?.targetDEF || 0} />
            <MinuteBar label="⚡ Midfielder" minutes={p.minutesMID || 0} maxMinutes={maxMin}
              colorClass="bg-purple-500" target={targets?.targetMID || 0} />
            <MinuteBar label="🔥 Attacker" minutes={p.minutesATK || 0} maxMinutes={maxMin}
              colorClass="bg-red-500" target={targets?.targetATK || 0} />
            {benchMins > 0 && (
              <MinuteBar label="🪑 Bench" minutes={benchMins} maxMinutes={maxMin}
                colorClass="bg-slate-400" target={0} />
            )}
            {sickMins > 0 && (
              <MinuteBar label="🏥 Sick/Injured" minutes={sickMins} maxMinutes={maxMin}
                colorClass="bg-orange-400" target={0} />
            )}
          </div>
          {targets && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-700">Season Progress</p>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Total (played + sick)</span>
                <span className="font-semibold text-gray-700">{total + sickMins} / {targets.totalMinutesPerPlayer} target</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-pitch-500 rounded-full" style={{ width: `${Math.min(100, Math.round(((total + sickMins) / targets.totalMinutesPerPlayer) * 100))}%` }} />
              </div>
            </div>
          )}
          {total === 0 && sickMins === 0 && (
            <p className="text-center text-gray-400 text-sm">No games played yet</p>
          )}
        </div>
      </div>
    );
  }

  if (overviewView === 'played') {
    return (
      <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <button onClick={() => switchOverview('overview')} className="text-pitch-600 font-semibold text-sm flex items-center gap-1">
          ← Back to Stats
        </button>
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Played Games</h2>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No completed games yet.</p>
          ) : (
            <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {playedHistory.map(game => (
                <li key={`${game.gameNumber}-${game.date}`} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 leading-tight">Round {game.gameNumber}</p>
                      <p className="text-xs text-gray-500">{game.date}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultColorClass(getGameResultLabel(game))}`}>
                        {getGameResultLabel(game)}
                      </span>
                      <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-bold text-gray-900">
                        {game.homeScore ?? 0} - {game.awayScore ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TeamAvatar
                      src={game.opponentLogoUrl}
                      alt={`${game.opponentName || 'Opponent'} logo`}
                      name={game.opponentName || 'Opponent'}
                      sizeClass="w-8 h-8"
                    />
                    <p className="text-sm text-gray-700 truncate">
                      {team.name} vs {game.opponentName || 'Opponent'}
                    </p>
                  </div>
                  {(game.goals || []).length > 0 ? (
                    <div className="text-xs text-gray-600">
                      Goals: {(game.goals || []).map(goal => `${goal.playerName || '?'} ${goal.minute ? `${goal.minute}'` : ''}`.trim()).join(', ')}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No goals recorded.</p>
                  )}
                  {Object.values(game.gkSaves || {}).some(count => Number(count) > 0) && (
                    <div className="text-xs text-gray-600">
                      Saves: {Object.entries(game.gkSaves || {})
                        .filter(([, count]) => Number(count) > 0)
                        .map(([playerId, count]) => `${players.find(p => p.id === playerId)?.name || '?'} 🧤 ${count}`)
                        .join(', ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (overviewView === 'cancelled') {
    return (
      <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <button onClick={() => switchOverview('overview')} className="text-pitch-600 font-semibold text-sm flex items-center gap-1">
          ← Back to Stats
        </button>
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Cancelled Games</h2>
          {editingCancelledRound && cancelledDraft && (
            <div className="rounded-xl border border-amber-200 bg-amber-100 p-3 mb-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">Edit Cancelled Round {editingCancelledRound}</p>
              <div className="flex rounded-lg overflow-hidden border border-amber-200 w-fit">
                <button
                  onClick={() => setCancelledDraft(d => ({ ...d, homeAway: 'HOME' }))}
                  className={`px-3 py-1 text-xs font-semibold ${cancelledDraft.homeAway !== 'AWAY' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-600'}`}
                >
                  Home
                </button>
                <button
                  onClick={() => setCancelledDraft(d => ({ ...d, homeAway: 'AWAY' }))}
                  className={`px-3 py-1 text-xs font-semibold ${cancelledDraft.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600'}`}
                >
                  Away
                </button>
              </div>
              <OpponentTeamInput
                label="Opponent"
                team={{
                  name: cancelledDraft.opponentName || '',
                  logoUrl: cancelledDraft.opponentLogoUrl || '',
                  confirmed: true,
                }}
                onTeamChange={next => setCancelledDraft(d => ({
                  ...d,
                  opponentName: next.name,
                  opponentLogoUrl: next.logoUrl || '',
                }))}
              />
              <div className="relative">
                <input
                  type="date"
                  className="input-field"
                  value={cancelledDraft.date || ''}
                  onChange={e => setCancelledDraft(d => ({ ...d, date: e.target.value }))}
                />
                {!cancelledDraft.date && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    Date
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={saveCancelledEditor} className="btn-primary">Save</button>
                <button onClick={closeCancelledEditor} className="btn-secondary">Cancel</button>
              </div>
            </div>
          )}
          {cancelledDetails.length === 0 ? (
            <p className="text-sm text-gray-400">No cancelled games recorded.</p>
          ) : (
            <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {cancelledDetails.slice().sort((a, b) => (a.round || 0) - (b.round || 0)).map(game => (
                <li key={`cancelled-${game.round}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-amber-800">Round {game.round}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-amber-700">{game.cancelledDate || 'Cancelled'}</p>
                      <button
                        onClick={() => openCancelledEditor(game)}
                        className="text-xs font-semibold text-amber-800 px-2 py-1 rounded-md bg-amber-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeCancelledGame(game.round)}
                        className="text-xs font-semibold text-red-700 px-2 py-1 rounded-md bg-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TeamAvatar
                      src={game.opponentLogoUrl}
                      alt={`${game.opponentName || 'Opponent'} logo`}
                      name={game.opponentName || 'Opponent'}
                      sizeClass="w-7 h-7"
                      className="border-amber-200"
                    />
                    <p className="text-sm text-amber-900">
                      {(game.homeAway === 'AWAY' ? 'Away' : 'Home')} · {game.opponentName || 'Opponent TBC'}
                    </p>
                  </div>
                  <p className="text-xs text-amber-800">{getDateDisplay(game.date)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Team Sheet view for a specific round
  if (teamSheetRound !== null) {
    const formationArr = defaultFormation;
    const formationStr = formatFormation(formationArr);

    // Look up the pre-computed plan for this round from the season sheets
    const seasonSheet = seasonSheets.find(s => s.round === teamSheetRound);
    const gamePlan = seasonSheet?.plan || null;

    const roundInfo = schedule.find(r => r.round === teamSheetRound);
    const numBlocks = gamePlan ? gamePlan.length : 0;

    // Calculate estimated minutes per player
    const playerMinutes = {};
    if (gamePlan) {
      for (const p of activePlayers) {
        playerMinutes[p.id] = { field: 0, bench: 0, positions: {} };
      }
      for (let b = 0; b < numBlocks; b++) {
        const block = gamePlan[b];
        for (const { playerId, position } of block.onField) {
          if (playerMinutes[playerId]) {
            playerMinutes[playerId].field += 10;
            playerMinutes[playerId].positions[position] = (playerMinutes[playerId].positions[position] || 0) + 10;
          }
        }
        for (const benchId of block.onBench) {
          if (playerMinutes[benchId]) {
            playerMinutes[benchId].bench += 10;
          }
        }
      }
    }

    // Build sub changes between blocks
    const subChanges = [];
    if (gamePlan && gamePlan.length > 1) {
      for (let b = 1; b < gamePlan.length; b++) {
        const subs = getSubsBetweenBlocks(gamePlan[b - 1], gamePlan[b]);
        if (subs.length > 0) {
          subChanges.push({ minute: b * 10, subs });
        }
      }
    }

    const getPlayer = (id) => activePlayers.find(p => p.id === id);

    // Build cumulative stats up to and including this round for the PDF
    const cumulativeStats = {};
    {
      // Start with actual played stats
      for (const p of activePlayers) {
        cumulativeStats[p.id] = {
          minutesGK: p.minutesGK || 0,
          minutesDEF: p.minutesDEF || 0,
          minutesMID: p.minutesMID || 0,
          minutesATK: p.minutesATK || 0,
          minutesBench: p.minutesBench || 0,
          goals: 0,
          saves: p.saves || 0,
        };
      }
      // Count goals from game history
      for (const game of (gameHistory || [])) {
        for (const goal of (game.goals || [])) {
          const playerId = goal.playerId;
          if (playerId && cumulativeStats[playerId]) {
            cumulativeStats[playerId].goals += 1;
          }
        }
      }
      // Add simulated minutes from all season sheets UP TO and including this round
      for (const sheet of seasonSheets) {
        if (sheet.round > teamSheetRound) break;
        if (!sheet.plan) continue;
        const plan = sheet.plan;
        const gameFieldMinutes = {};
        for (const p of activePlayers) gameFieldMinutes[p.id] = 0;
        for (let b = 0; b < plan.length; b++) {
          for (const { playerId, position } of plan[b].onField) {
            if (cumulativeStats[playerId]) {
              const blockMin = 10;
              if (position === 'GK') cumulativeStats[playerId].minutesGK += blockMin;
              else if (position === 'DEF') cumulativeStats[playerId].minutesDEF += blockMin;
              else if (position === 'MID') cumulativeStats[playerId].minutesMID += blockMin;
              else if (position === 'ATK') cumulativeStats[playerId].minutesATK += blockMin;
              gameFieldMinutes[playerId] = (gameFieldMinutes[playerId] || 0) + blockMin;
            }
          }
        }
        // Add bench minutes for this game (skip absent players)
        const sheetAbsentSet = new Set(sheet.absentPlayerIds || []);
        for (const p of activePlayers) {
          if (sheetAbsentSet.has(p.id)) continue;
          const fieldMins = gameFieldMinutes[p.id] || 0;
          const benchMins = team.gameDuration - fieldMins;
          if (benchMins > 0 && cumulativeStats[p.id]) {
            cumulativeStats[p.id].minutesBench += benchMins;
          }
        }
      }
    }

    function handleDownloadPdf() {
      generateRoundPdf({
        roundNumber: teamSheetRound,
        roundInfo,
        teamName: team.name,
        teamLogoUrl: team.logoUrl || '',
        opponentLogoUrl: roundInfo?.opponentLogoUrl || '',
        formationStr,
        gameDuration: team.gameDuration,
        gamePlan,
        subChanges,
        playerMinutes,
        activePlayers,
        cumulativeStats,
        openInNewTab: hasLiveGame,
      });
    }

    const posLabel = (pos) => {
      if (pos === 'GK') return 'GK';
      if (pos === 'DEF') return 'DEF';
      if (pos === 'MID') return 'MID';
      if (pos === 'ATK') return 'ATK';
      return pos;
    };

    const posTagColor = (pos) => {
      if (pos === 'GK') return 'bg-yellow-100 text-yellow-800';
      if (pos === 'DEF') return 'bg-blue-100 text-blue-800';
      if (pos === 'MID') return 'bg-purple-100 text-purple-800';
      if (pos === 'ATK') return 'bg-red-100 text-red-800';
      return 'bg-gray-100 text-gray-600';
    };

    return (
      <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <button onClick={() => setTeamSheetRound(null)} className="text-pitch-600 font-semibold text-sm flex items-center gap-1">
          ← Back to Remaining Games
        </button>

        {/* Round Info Header */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-900">Round {teamSheetRound} Team Sheet</h2>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${roundInfo?.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {roundInfo?.homeAway === 'AWAY' ? 'Away' : 'Home'}
            </span>
          </div>
          {roundInfo?.opponentName && (
            <div className="flex items-center gap-2 mb-1">
              <TeamAvatar
                src={roundInfo.opponentLogoUrl}
                alt={`${roundInfo.opponentName} logo`}
                name={roundInfo.opponentName}
                sizeClass="w-6 h-6"
              />
              <span className="text-sm text-gray-700">vs {roundInfo.opponentName}</span>
            </div>
          )}
          <p className="text-xs text-gray-500">{getDateDisplay(roundInfo?.date)} · Formation: {formationStr} · {team.gameDuration} min game</p>
          {gamePlan && (
            <button
              onClick={handleDownloadPdf}
              className="mt-2 text-xs font-bold text-white bg-red-600 px-3 py-1.5 rounded-lg active:bg-red-700 transition-colors flex items-center gap-1"
            >
              📄 Download PDF
            </button>
          )}
        </div>

        {!gamePlan ? (
          <div className="card text-center py-6">
            <p className="text-gray-400 text-sm">Not enough active players to generate a team sheet. Need at least {minFieldCount}.</p>
          </div>
        ) : (
          <>
            {/* Starting Lineup */}
            <div className="card">
              <h3 className="font-bold text-gray-900 mb-3">Starting Lineup</h3>
              <div className="space-y-2">
                {gamePlan[0].onField.map(({ playerId, position }) => {
                  const player = getPlayer(playerId);
                  return (
                    <div key={playerId} className="flex items-center gap-3 py-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${posTagColor(position)}`}>{posLabel(position)}</span>
                      <PlayerAvatar player={player} sizeClass="w-7 h-7" className="bg-pitch-100 text-pitch-700" textClassName="text-xs" />
                      <span className="text-sm font-semibold text-gray-900">{player?.name || '?'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bench */}
            {gamePlan[0].onBench.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-gray-900 mb-3">Starting on Bench</h3>
                <div className="space-y-2">
                  {gamePlan[0].onBench.map(id => {
                    const player = getPlayer(id);
                    return (
                      <div key={id} className="flex items-center gap-3 py-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">BENCH</span>
                        <PlayerAvatar player={player} sizeClass="w-7 h-7" className="bg-gray-100 text-gray-600" textClassName="text-xs" />
                        <span className="text-sm font-semibold text-gray-900">{player?.name || '?'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Substitution Plan */}
            {subChanges.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-gray-900 mb-3">Substitution Plan</h3>
                <div className="space-y-3">
                  {subChanges.map(({ minute, subs }) => (
                    <div key={minute} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-pitch-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{minute}&apos;</span>
                        <span className="text-xs text-gray-500 font-medium">{subs.length} sub{subs.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-1.5">
                        {subs.map((sub, idx) => {
                          const offPlayer = getPlayer(sub.off);
                          const onPlayer = getPlayer(sub.on);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <span className="text-red-500 font-bold text-xs">↓</span>
                              <span className="text-gray-700">{offPlayer?.name || '?'}</span>
                              <span className="text-gray-400 text-xs">→</span>
                              <span className="text-emerald-600 font-bold text-xs">↑</span>
                              <span className="text-gray-700">{onPlayer?.name || '?'}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${posTagColor(sub.position)}`}>{posLabel(sub.position)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Estimated Minutes Per Player */}
            <div className="card">
              <h3 className="font-bold text-gray-900 mb-3">Estimated Minutes</h3>
              <div className="space-y-2">
                {activePlayers
                  .slice()
                  .sort((a, b) => (playerMinutes[b.id]?.field || 0) - (playerMinutes[a.id]?.field || 0))
                  .map(p => {
                    const mins = playerMinutes[p.id];
                    if (!mins) return null;
                    const posEntries = Object.entries(mins.positions || {}).filter(([, v]) => v > 0);
                    return (
                      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar player={p} sizeClass="w-6 h-6" className="bg-pitch-100 text-pitch-700" textClassName="text-[10px]" />
                          <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {posEntries.map(([pos, min]) => (
                              <span key={pos} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${posTagColor(pos)}`}>
                                {posLabel(pos)} {min}&#39;
                              </span>
                            ))}
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-pitch-700">{mins.field}&#39;</span>
                            {mins.bench > 0 && (
                              <span className="text-xs text-gray-400 ml-1">({mins.bench}&#39; bench)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (overviewView === 'remaining') {
    return (
      <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <button onClick={() => switchOverview('overview')} className="text-pitch-600 font-semibold text-sm flex items-center gap-1">
          ← Back to Stats
        </button>
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-gray-900">Remaining Games</h2>
          {editingRound && roundDraft && (
            <div className="rounded-xl border border-pitch-200 bg-pitch-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-pitch-800">Edit Round {editingRound}</p>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit">
                <button
                  onClick={() => setRoundDraft(d => ({ ...d, homeAway: 'HOME' }))}
                  className={`px-3 py-1 text-xs font-semibold ${roundDraft.homeAway !== 'AWAY' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-600'}`}
                >
                  Home
                </button>
                <button
                  onClick={() => setRoundDraft(d => ({ ...d, homeAway: 'AWAY' }))}
                  className={`px-3 py-1 text-xs font-semibold ${roundDraft.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600'}`}
                >
                  Away
                </button>
              </div>
              <OpponentTeamInput
                label="Opponent"
                team={{
                  name: roundDraft.opponentName || '',
                  logoUrl: roundDraft.opponentLogoUrl || '',
                  confirmed: true,
                }}
                onTeamChange={next => setRoundDraft(d => ({
                  ...d,
                  opponentName: next.name,
                  opponentLogoUrl: next.logoUrl || '',
                }))}
              />
              <div className="relative">
                <input
                  type="date"
                  className="input-field"
                  value={roundDraft.date}
                  onChange={e => setRoundDraft(d => ({ ...d, date: e.target.value }))}
                />
                {!roundDraft.date && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    Date
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={saveRoundEditor} className="btn-primary">Save Round</button>
                <button onClick={closeRoundEditor} className="btn-secondary">Cancel</button>
              </div>
            </div>
          )}
          {remainingRounds.length === 0 ? (
            <p className="text-sm text-gray-400">No remaining scheduled rounds.</p>
          ) : (
            <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {remainingRounds.map(round => (
                <li
                  key={`remaining-${round.round}`}
                  className={`rounded-xl border p-3 ${round.homeAway === 'AWAY' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">Round {round.round}</p>
                    <button onClick={() => openRoundEditor(round)} className="text-xs font-semibold text-pitch-700">Edit</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <TeamAvatar
                      src={round.opponentLogoUrl}
                      alt={`${round.opponentName || 'Opponent'} logo`}
                      name={round.opponentName || 'Opponent'}
                      sizeClass="w-7 h-7"
                    />
                    <p className="text-sm text-gray-700">{round.homeAway === 'AWAY' ? 'Away' : 'Home'} · {round.opponentName || 'Opponent TBC'}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-500">{getDateDisplay(round.date)}</p>
                    <div className="flex items-center gap-2">
                      {seasonSheets.find(s => s.round === round.round)?.plan && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRoundPdf(round.round); }}
                          className="text-xs font-bold text-white bg-red-600 px-3 py-1.5 rounded-lg active:bg-red-700 transition-colors"
                        >
                          📄 PDF
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setTeamSheetRound(round.round); }}
                        className="text-xs font-bold text-white bg-pitch-600 px-3 py-1.5 rounded-lg active:bg-pitch-700 transition-colors"
                      >
                        📋 Team Sheet
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
      {/* Season Overview */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Season Overview</h2>
        <p className="text-xs text-gray-400">Select a stat card to open details</p>
        <div className="grid grid-cols-3 gap-3 text-center mt-3">
          <button onClick={() => switchOverview('played')} className="bg-pitch-50 rounded-xl p-3">
            <div className="text-2xl font-black text-pitch-700">{gamesPlayed}</div>
            <div className="text-xs text-gray-500">Played</div>
          </button>
          <button onClick={() => switchOverview('remaining')} className="bg-gray-50 rounded-xl p-3">
            <div className="text-2xl font-black text-gray-600">{gamesRemaining}</div>
            <div className="text-xs text-gray-500">Remaining</div>
          </button>
          <button onClick={() => switchOverview('cancelled')} className="bg-amber-50 rounded-xl p-3">
            <div className="text-2xl font-black text-amber-600">{cancelledCount}</div>
            <div className="text-xs text-gray-500">Cancelled</div>
          </button>
        </div>
        {/* Form Guide */}
        {history.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Form</p>
            <div className="flex flex-wrap gap-1.5">
              {[...history].sort((a, b) => (a.gameNumber || 0) - (b.gameNumber || 0)).map(game => {
                const label = getGameResultLabel(game);
                return (
                  <div
                    key={`form-${game.gameNumber}-${game.date}`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${resultBlobColor(label)}`}
                    title={`R${game.gameNumber}: ${label} (${game.homeScore ?? 0}-${game.awayScore ?? 0} vs ${game.opponentName || 'Opponent'})`}
                  >
                    {resultBlobLetter(label)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {targets && (
          <div className="mt-3 text-xs text-gray-500">
            Target per player: <span className="font-semibold text-gray-700">{targets.totalMinutesPerPlayer} min</span>
            {' '}(GK: {targets.targetGK}, DEF: {targets.targetDEF}, MID: {targets.targetMID}, ATK: {targets.targetATK})
          </div>
        )}
      </div>

      {/* Player Stats */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Player Stats</h2>
        <p className="text-xs text-gray-400 mb-4">Tap a player to see position breakdown</p>

        {activePlayers.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">No players yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 md:grid md:grid-cols-2 md:gap-x-4 md:divide-y-0">
            {activePlayers.map(p => {
              const total = totalMins(p);
              const sickMins = p.minutesSickInjured || 0;
              const benchMins = p.minutesBench || 0;
              const saves = p.saves || 0;
              const combined = total + sickMins;
              const pct = maxTotal > 0 ? Math.round((combined / maxTotal) * 100) : 0;
              return (
                <li key={p.id}
                  onClick={() => setSelectedPlayer(p.id)}
                  className="py-3 cursor-pointer active:bg-gray-50 -mx-4 px-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        player={p}
                        sizeClass="w-7 h-7"
                        className="bg-pitch-100 text-pitch-700"
                        textClassName="text-xs"
                      />
                      <span className="font-semibold text-gray-900">{p.name}</span>
                    </div>
                    <span className="text-sm text-gray-500 font-medium">
                      {total} min{benchMins > 0 ? ` · 🪑 ${benchMins}` : ''}{sickMins > 0 ? ` · 🏥 ${sickMins}` : ''}{saves > 0 ? ` · 🧤 ${saves}` : ''} →
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-pitch-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    {[
                      { label: 'GK', value: p.minutesGK, color: 'text-yellow-600' },
                      { label: 'DEF', value: p.minutesDEF, color: 'text-blue-600' },
                      { label: 'MID', value: p.minutesMID, color: 'text-purple-600' },
                      { label: 'ATK', value: p.minutesATK, color: 'text-red-600' },
                      ...(benchMins > 0 ? [{ label: '🪑', value: benchMins, color: 'text-slate-500' }] : []),
                      ...(saves > 0 ? [{ label: '🧤', value: saves, color: 'text-emerald-600' }] : []),
                      ...(sickMins > 0 ? [{ label: '🏥', value: sickMins, color: 'text-orange-500' }] : []),
                    ].map(z => (
                      <span key={z.label} className={`text-xs font-medium ${z.color}`}>
                        {z.label}: {z.value || 0}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-2">Position Key</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Goalkeeper (GK)</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Defender (DEF)</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Midfielder (MID)</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Attacker (ATK)</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-400 inline-block" /> Bench</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Sick/Injured</div>
        </div>
      </div>
    </div>
  );
}
