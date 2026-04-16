import { useEffect, useState } from 'react';
import GameDaySetup from './GameDaySetup.jsx';
import GameTimer from './GameTimer.jsx';
import TeamAvatar from './TeamAvatar.jsx';
import { applyBlockMinutes } from '../utils/subAlgorithm.js';
import { buildSeasonSchedule, createScheduleRound, getNextUnresolvedRound } from '../utils/storage.js';
import { getGameResultLabel } from '../utils/gameResults.js';
import {
  OPPONENT_CLUBS,
  findOpponentClubByName,
  getOpponentClubById,
} from '../utils/clubLogos.js';

function secondsToMinutes(seconds) {
  return Math.round((seconds || 0) / 60);
}

function resultColorClass(label) {
  if (label === 'Win') return 'bg-emerald-100 text-emerald-700';
  if (label === 'Lose') return 'bg-red-100 text-red-700';
  if (label === 'Draw') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function applyTrackedMinutes(players, playerTimers) {
  return players.map(player => {
    const timer = playerTimers?.[player.id];
    if (!timer?.positionSeconds) return player;
    const gkMinutes = secondsToMinutes(timer.positionSeconds.GK);
    const defMinutes = secondsToMinutes(timer.positionSeconds.DEF);
    const midMinutes = secondsToMinutes(timer.positionSeconds.MID);
    const atkMinutes = secondsToMinutes(timer.positionSeconds.ATK);
    return {
      ...player,
      minutesGK: (player.minutesGK || 0) + gkMinutes,
      minutesDEF: (player.minutesDEF || 0) + defMinutes,
      minutesMID: (player.minutesMID || 0) + midMinutes,
      minutesATK: (player.minutesATK || 0) + atkMinutes,
    };
  });
}

function resetPlayerMinutes(players) {
  return players.map(player => ({
    ...player,
    minutesGK: 0,
    minutesDEF: 0,
    minutesMID: 0,
    minutesATK: 0,
    minutesSickInjured: 0,
    minutesBench: 0,
    saves: 0,
  }));
}

function applyHistoryToPlayers(players, gameHistory) {
  let updated = resetPlayerMinutes(players);
  for (const game of gameHistory || []) {
    const deltas = game.playerMinuteDeltas;
    if (deltas && Array.isArray(deltas)) {
      updated = updated.map(p => {
        const d = deltas.find(item => item.playerId === p.id);
        if (!d) return p;
        return {
          ...p,
          minutesGK: (p.minutesGK || 0) + (d.minutesGK || 0),
          minutesDEF: (p.minutesDEF || 0) + (d.minutesDEF || 0),
          minutesMID: (p.minutesMID || 0) + (d.minutesMID || 0),
          minutesATK: (p.minutesATK || 0) + (d.minutesATK || 0),
          minutesSickInjured: (p.minutesSickInjured || 0) + (d.minutesSickInjured || 0),
          minutesBench: (p.minutesBench || 0) + (d.minutesBench || 0),
          saves: (p.saves || 0) + (d.saves || 0),
        };
      });
    } else {
      updated = applyTrackedMinutes(updated, game.playerTimers || {});
      const gameSaves = game.gkSaves || {};
      updated = updated.map(p => ({
        ...p,
        saves: (p.saves || 0) + (Number(gameSaves[p.id]) || 0),
      }));
      if (Array.isArray(game.absentMinutes) && game.absentMinutes.length > 0) {
        updated = updated.map(p => {
          const absentEntry = game.absentMinutes.find(a => a.playerId === p.id);
          if (!absentEntry) return p;
          return {
            ...p,
            minutesSickInjured: (p.minutesSickInjured || 0) + (absentEntry.minutesSickInjured || 0),
          };
        });
      }
    }
  }
  return updated;
}

function sanitizeScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function getCancelledDetails(data) {
  return Array.isArray(data.cancelledGameDetails) ? data.cancelledGameDetails : [];
}

export default function GameTab({ data, onUpdate, onSwitchToGame }) {
  const { currentGame, players, team } = data;
  const [setupMode, setSetupMode] = useState(false);
  const [editingGameIndex, setEditingGameIndex] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [setupMode, currentGame]);

  useEffect(() => {
    if (!editDraft) return undefined;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const originalStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      touchAction: document.body.style.touchAction,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = originalStyles.overflow;
      document.body.style.position = originalStyles.position;
      document.body.style.top = originalStyles.top;
      document.body.style.left = originalStyles.left;
      document.body.style.right = originalStyles.right;
      document.body.style.width = originalStyles.width;
      document.body.style.touchAction = originalStyles.touchAction;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    };
  }, [editDraft]);

  function handleStartGame({ availablePlayers, absentPlayers, absentMinutes, formation, plan, gameNumber, opponentName, opponentLogoUrl, startingField, startingBench }) {
    // Initialize per-player timers
    const playerTimers = {};
    for (const id of availablePlayers) {
      playerTimers[id] = { totalSeconds: 0, positionSeconds: {} };
    }
    const newGame = {
      gameNumber,
      availablePlayers,
      absentPlayers: absentPlayers || [],
      absentMinutes: absentMinutes || [],
      formation,
      plan,
      startTime: Date.now(),
      elapsedSeconds: 0,
      blockIndex: 0,
      isPaused: false,
      gameLog: [],
      opponentName: opponentName || 'Opponent',
      opponentLogoUrl: opponentLogoUrl || '',
      homeScore: 0,
      awayScore: 0,
      goals: [],
      gkSaves: {},
      playerTimers,
      startingField: startingField || plan?.[0]?.onField || [],
      startingBench: startingBench || plan?.[0]?.onBench || [],
    };
    onUpdate({ ...data, currentGame: newGame, pendingGameSetup: null });
    setSetupMode(false);
  }

  function handleUpdateGame(updatedData) {
    onUpdate(updatedData);
  }

  function handleEndGame(finalBlockIndex, elapsedSeconds, matchSummary) {
    if (!currentGame) return;
    const { plan, availablePlayers, absentMinutes } = currentGame;

    // Apply minutes for each completed block
    let updatedPlayers = [...players];
    const blocksPlayed = finalBlockIndex + 1;
    const totalBlocks = plan.length;

    const playerTimers = matchSummary?.playerTimers ?? currentGame.playerTimers ?? {};
    const hasTrackedMinutes = Object.values(playerTimers).some(t => (t?.totalSeconds || 0) > 0);

    if (hasTrackedMinutes) {
      updatedPlayers = applyTrackedMinutes(updatedPlayers, playerTimers);
    } else {
      // Calculate actual minutes per block (last block might be partial)
      for (let i = 0; i < Math.min(blocksPlayed, totalBlocks); i++) {
        const block = plan[i];
        // Last block might be less than 10 min
        let blockMinutes = 10;
        if (i === totalBlocks - 1) {
          const remainingMinutes = team.gameDuration - (totalBlocks - 1) * 10;
          blockMinutes = remainingMinutes;
        }
        updatedPlayers = applyBlockMinutes(updatedPlayers, block.onField, blockMinutes);
      }
    }

    // Apply sick/injured minutes for absent players
    if (absentMinutes && absentMinutes.length > 0) {
      updatedPlayers = updatedPlayers.map(p => {
        const absentEntry = absentMinutes.find(a => a.playerId === p.id);
        if (absentEntry) {
          return {
            ...p,
            minutesSickInjured: (p.minutesSickInjured || 0) + absentEntry.minutesSickInjured,
          };
        }
        return p;
      });
    }

    const gkSaves = matchSummary?.gkSaves ?? currentGame.gkSaves ?? {};
    updatedPlayers = updatedPlayers.map(player => ({
      ...player,
      saves: (player.saves || 0) + (Number(gkSaves[player.id]) || 0),
    }));

    // Calculate and apply bench minutes for available players
    // Bench minutes = game duration - field minutes gained this game
    const availableSet = new Set(availablePlayers);
    updatedPlayers = updatedPlayers.map(player => {
      if (!availableSet.has(player.id)) return player;
      const original = players.find(p => p.id === player.id) || player;
      const fieldMinutesThisGame =
        ((player.minutesGK || 0) - (original.minutesGK || 0)) +
        ((player.minutesDEF || 0) - (original.minutesDEF || 0)) +
        ((player.minutesMID || 0) - (original.minutesMID || 0)) +
        ((player.minutesATK || 0) - (original.minutesATK || 0));
      const benchMinutesThisGame = Math.max(0, team.gameDuration - fieldMinutesThisGame);
      return {
        ...player,
        minutesBench: (player.minutesBench || 0) + benchMinutesThisGame,
      };
    });

    const playerMinuteDeltas = players.map(original => {
      const updated = updatedPlayers.find(p => p.id === original.id) || original;
      return {
        playerId: original.id,
        minutesGK: (updated.minutesGK || 0) - (original.minutesGK || 0),
        minutesDEF: (updated.minutesDEF || 0) - (original.minutesDEF || 0),
        minutesMID: (updated.minutesMID || 0) - (original.minutesMID || 0),
        minutesATK: (updated.minutesATK || 0) - (original.minutesATK || 0),
        minutesSickInjured: (updated.minutesSickInjured || 0) - (original.minutesSickInjured || 0),
        minutesBench: (updated.minutesBench || 0) - (original.minutesBench || 0),
        saves: (updated.saves || 0) - (original.saves || 0),
      };
    });

    const historyEntry = {
      gameNumber: currentGame.gameNumber,
      date: new Date().toLocaleDateString(),
      formation: currentGame.formation,
      playerCount: availablePlayers.length,
      absentCount: (currentGame.absentPlayers || []).length,
      elapsedSeconds,
      opponentName: currentGame.opponentName || 'Opponent',
      opponentLogoUrl: currentGame.opponentLogoUrl || '',
      homeScore: matchSummary?.homeScore ?? currentGame.homeScore ?? 0,
      awayScore: matchSummary?.awayScore ?? currentGame.awayScore ?? 0,
      goals: matchSummary?.goals ?? currentGame.goals ?? [],
      gkSaves,
      playerTimers: matchSummary?.playerTimers ?? currentGame.playerTimers ?? {},
      absentMinutes: currentGame.absentMinutes || [],
      playerMinuteDeltas,
      // startingBench is an array of player ID strings (set in GameDaySetup)
      startingBenchIds: Array.isArray(currentGame.startingBench)
        ? currentGame.startingBench.filter(id => typeof id === 'string')
        : [],
    };

    const updatedCancelled = getCancelledDetails(data)
      .filter(item => Number(item.round) !== Number(currentGame.gameNumber));

    onUpdate({
      ...data,
      players: updatedPlayers,
      currentGame: null,
      pendingGameSetup: null,
      gameHistory: [...(data.gameHistory || []), historyEntry],
      cancelledGameDetails: updatedCancelled,
      cancelledGames: updatedCancelled.length,
      seasonSchedule: buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule),
    });
  }

  if (currentGame && !setupMode) {
    return (
      <GameTimer
        data={data}
        onUpdate={handleUpdateGame}
        onEndGame={handleEndGame}
        onSwitchToGame={onSwitchToGame}
      />
    );
  }

  if (setupMode) {
    return (
      <GameDaySetup
        data={data}
        onStartGame={handleStartGame}
        onUpdate={onUpdate}
        onCancel={() => {
          if (data.pendingGameSetup) {
            onUpdate({ ...data, pendingGameSetup: null });
          }
          setSetupMode(false);
        }}
      />
    );
  }

  // No game in progress
  const activePlayers = players.filter(p => p.isActive);
  const canStartGame = activePlayers.length >= (team.fieldPlayers + 1);
  const history = data.gameHistory || [];

  function handleCancelGame() {
    const round = getNextUnresolvedRound(data);
    const schedule = buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule);
    const scheduledRound = schedule.find(item => item.round === round) || createScheduleRound(round);
    const fixtureType = scheduledRound.homeAway === 'AWAY' ? 'Away' : 'Home';
    let opponentName = (scheduledRound.opponentName || '').trim();
    let opponentLogoUrl = scheduledRound.opponentLogoUrl || '';

    if (!opponentName) {
      const enteredOpponent = window.prompt(
        `Round ${round} is scheduled as a ${fixtureType.toLowerCase()} fixture with no opponent set.\nEnter an opponent for this cancelled game (optional):`,
        '',
      );
      if (enteredOpponent === null) return;
      opponentName = enteredOpponent.trim();
      if (opponentName) {
        const matchedClub = findOpponentClubByName(opponentName);
        opponentName = matchedClub?.name || opponentName;
        opponentLogoUrl = matchedClub?.logoUrl || '';
      }
    }

    const roundSummary = `Round ${round} · ${fixtureType} · ${opponentName || 'Opponent TBC'}`;
    if (!window.confirm(`Record cancelled game for ${roundSummary}? This adjusts season tracking.`)) return;

    const updatedScheduledRound = {
      ...scheduledRound,
      round,
      opponentName,
      opponentLogoUrl,
    };
    const updatedSchedule = schedule.map(item => (
      item.round === round ? updatedScheduledRound : item
    ));
    const nextCancelled = [
      ...getCancelledDetails(data).filter(item => Number(item.round) !== round),
      {
        ...updatedScheduledRound,
        cancelledDate: new Date().toLocaleDateString(),
      },
    ].sort((a, b) => a.round - b.round);
    onUpdate({
      ...data,
      cancelledGameDetails: nextCancelled,
      cancelledGames: nextCancelled.length,
      seasonSchedule: updatedSchedule,
    });
  }

  function openEditGame(originalIndex) {
    const history = data.gameHistory || [];
    const game = history[originalIndex];
    if (!game) return;
    setEditingGameIndex(originalIndex);
    const matchedClub = findOpponentClubByName(game.opponentName || '');
    setEditDraft({
      ...game,
      homeScore: game.homeScore ?? 0,
      awayScore: game.awayScore ?? 0,
      goals: (game.goals || []).map(g => ({ ...g })),
      opponentClubId: matchedClub?.id || '__custom__',
      opponentSelectionTouched: false,
    });
  }

  function closeEditGame() {
    setEditingGameIndex(null);
    setEditDraft(null);
  }

  function saveEditedGame() {
    if (editingGameIndex === null || !editDraft) return;
    const updatedHistory = [...(data.gameHistory || [])];
    const originalGame = updatedHistory[editingGameIndex] || {};
    const selectedOpponentClub = editDraft.opponentClubId && editDraft.opponentClubId !== '__custom__'
      ? getOpponentClubById(editDraft.opponentClubId)
      : null;
    let nextOpponentName = (editDraft.opponentName || '').trim() || originalGame.opponentName || 'Opponent';
    let nextOpponentLogoUrl = editDraft.opponentLogoUrl || originalGame.opponentLogoUrl || '';
    if (editDraft.opponentSelectionTouched && selectedOpponentClub) {
      nextOpponentName = selectedOpponentClub.name || nextOpponentName;
      nextOpponentLogoUrl = selectedOpponentClub.logoUrl || nextOpponentLogoUrl;
    }
    updatedHistory[editingGameIndex] = {
      ...originalGame,
      opponentName: nextOpponentName,
      opponentLogoUrl: nextOpponentLogoUrl,
      homeScore: sanitizeScore(editDraft.homeScore),
      awayScore: sanitizeScore(editDraft.awayScore),
      goals: (editDraft.goals || []).map(g => {
        const scorer = players.find(p => p.id === g.playerId);
        return {
          ...g,
          playerName: scorer?.name || g.playerName || '?',
          minute: sanitizeScore(g.minute),
        };
      }),
    };
    onUpdate({ ...data, gameHistory: updatedHistory });
    closeEditGame();
  }

  function deleteGameFromHistory(originalIndex) {
    if (!window.confirm('Delete this game? This will recalculate all season stats from game history.')) return;
    const nextHistory = (data.gameHistory || [])
      .filter((_, idx) => idx !== originalIndex)
      .map((g, idx) => ({ ...g, gameNumber: idx + 1 }));
    const recalculatedPlayers = applyHistoryToPlayers(players, nextHistory);
    onUpdate({
      ...data,
      players: recalculatedPlayers,
      gameHistory: nextHistory,
    });
    closeEditGame();
  }

  return (
    <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
      <div className="card text-center py-8 space-y-4">
        <div className="text-6xl">⚽</div>
        <h2 className="text-xl font-bold text-gray-900">No Game in Progress</h2>
        <p className="text-sm text-gray-500">
          {activePlayers.length} active player{activePlayers.length !== 1 ? 's' : ''} available
          {!canStartGame && ` (need ${team.fieldPlayers + 1}+)`}
        </p>
        <button
          onClick={() => {
            if (data.pendingGameSetup) {
              onUpdate({ ...data, pendingGameSetup: null });
            }
            setSetupMode(true);
          }}
          disabled={!canStartGame}
          className={`btn-primary w-full text-lg ${!canStartGame ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          🟢 Start New Game
        </button>
        <button
          onClick={handleCancelGame}
          className="btn-secondary w-full text-sm"
        >
          ❌ Record Cancelled Game
        </button>
        {!canStartGame && (
          <p className="text-xs text-gray-400">Add more players in the Team tab</p>
        )}
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-3">Game History</h3>
          <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {[...history].reverse().map((g, i) => {
              const originalIndex = history.length - 1 - i;
              return (
              <li key={i} className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {g.opponentLogoUrl ? (
                      <TeamAvatar
                        src={g.opponentLogoUrl}
                        alt={`${g.opponentName || 'Opponent'} logo`}
                        name={g.opponentName || 'Opponent'}
                        sizeClass="w-8 h-8"
                      />
                    ) : (
                      <TeamAvatar
                        alt="Opponent logo"
                        name={g.opponentName || 'Opponent'}
                        sizeClass="w-8 h-8"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 leading-tight">Game {g.gameNumber}</p>
                      <p className="text-xs text-gray-500 truncate">
                        vs {g.opponentName || 'Opponent'}, {g.date}
                      </p>
                    </div>
                  </div>
                  {(g.homeScore !== undefined) ? (
                    <div className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-bold text-gray-900">
                      {g.homeScore} - {g.awayScore}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">
                      {g.formation} · {g.playerCount}p{g.absentCount ? ` · ${g.absentCount} absent` : ''}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${resultColorClass(getGameResultLabel(g))}`}>
                      {getGameResultLabel(g)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditGame(originalIndex)}
                      className="text-xs font-semibold text-pitch-600 px-2.5 py-1 rounded-lg bg-pitch-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteGameFromHistory(originalIndex)}
                      className="text-xs font-semibold text-red-600 px-2.5 py-1 rounded-lg bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )})}
          </ul>
        </div>
      )}

      {editDraft && (
        <div className="fixed inset-0 h-dvh bg-black/60 z-50 flex items-stretch sm:items-center justify-center overflow-hidden" onClick={closeEditGame}>
          <div className="bg-white w-full h-dvh sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header with result badge */}
            <div className="bg-gradient-to-r from-pitch-700 to-pitch-600 px-6 pt-6 pb-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold">Edit Game {editDraft.gameNumber}</h3>
                <button onClick={closeEditGame} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold active:bg-white/30 transition-colors">×</button>
              </div>
              <p className="text-pitch-200 text-sm">{editDraft.date || 'No date'}</p>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Score display */}
              <div className="px-6 py-5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-gray-500 mb-2">{team.name || 'Home'}</p>
                    <input
                      id="edit-home-score"
                      type="number"
                      min={0}
                      className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 text-2xl text-center font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white"
                      value={editDraft.homeScore}
                      onChange={e => setEditDraft(d => ({ ...d, homeScore: e.target.value }))}
                    />
                  </div>
                  <div className="text-gray-300 text-2xl font-black pt-5">vs</div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Opponent</p>
                    <input
                      id="edit-away-score"
                      type="number"
                      min={0}
                      className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 text-2xl text-center font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white"
                      value={editDraft.awayScore}
                      onChange={e => setEditDraft(d => ({ ...d, awayScore: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 space-y-5">
                {/* Opponent selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Opponent Team</label>
                  <select
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white"
                    value={editDraft.opponentClubId || '__custom__'}
                    onChange={e => {
                      const clubId = e.target.value;
                      if (clubId === '__custom__') {
                        setEditDraft(d => ({ ...d, opponentClubId: '__custom__', opponentSelectionTouched: true }));
                        return;
                      }
                      const club = getOpponentClubById(clubId);
                      setEditDraft(d => ({
                        ...d,
                        opponentSelectionTouched: true,
                        opponentClubId: clubId,
                        opponentName: club?.name || d.opponentName,
                        opponentLogoUrl: club?.logoUrl || d.opponentLogoUrl,
                      }));
                    }}
                  >
                    <option value="__custom__">Select opponent club</option>
                    {OPPONENT_CLUBS.map(club => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                </div>

                {/* Goal Scorers */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Goal Scorers</label>
                    <button
                      onClick={() => {
                        if (players.length === 0) return;
                        setEditDraft(d => ({
                          ...d,
                          goals: [...(d.goals || []), { playerId: players[0].id, playerName: players[0].name || '?', minute: 0 }],
                        }));
                      }}
                      className="flex items-center gap-1 text-xs text-pitch-600 font-bold px-3 py-1.5 rounded-full bg-pitch-50 active:bg-pitch-100 transition-colors"
                    >
                      <span className="text-base leading-none">+</span> Add Goal
                    </button>
                  </div>
                  {(editDraft.goals || []).length === 0 ? (
                    <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 py-4 text-center">
                      <p className="text-sm text-gray-400">No goals recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(editDraft.goals || []).map((goal, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                          <div className="w-7 h-7 rounded-full bg-pitch-100 flex items-center justify-center text-pitch-700 text-xs font-bold shrink-0">⚽</div>
                          <select
                            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white"
                            value={goal.playerId || ''}
                            onChange={e => {
                              const playerId = e.target.value;
                              const player = players.find(p => p.id === playerId);
                              setEditDraft(d => ({
                                ...d,
                                goals: (d.goals || []).map((g, gIdx) => gIdx === idx ? { ...g, playerId, playerName: player?.name || '?' } : g),
                              }));
                            }}
                          >
                            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <div className="relative w-14 shrink-0">
                            <input
                              type="number"
                              min={0}
                              placeholder="min"
                              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center tabular-nums font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white"
                              value={goal.minute}
                              onChange={e => setEditDraft(d => ({
                                ...d,
                                goals: (d.goals || []).map((g, gIdx) => gIdx === idx ? { ...g, minute: e.target.value } : g),
                              }))}
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 pointer-events-none">&#39;</span>
                          </div>
                          <button
                            onClick={() => setEditDraft(d => ({
                              ...d,
                              goals: (d.goals || []).filter((_, gIdx) => gIdx !== idx),
                            }))}
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-500 font-bold text-sm active:bg-red-200 transition-colors"
                            aria-label="Remove goal"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 pb-6 pt-4 border-t border-gray-100 bg-white space-y-3">
              <button onClick={saveEditedGame} className="btn-primary w-full text-sm">
                Save Changes
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={closeEditGame} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => deleteGameFromHistory(editingGameIndex)}
                  className="py-3 px-6 rounded-xl bg-red-50 text-red-600 font-semibold text-sm active:bg-red-100 transition-colors"
                >
                  Delete Game
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
