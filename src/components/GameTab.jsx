import { useEffect, useState } from 'react';
import GameDaySetup from './GameDaySetup.jsx';
import GameTimer from './GameTimer.jsx';
import TeamAvatar from './TeamAvatar.jsx';
import { applyBlockMinutes } from '../utils/subAlgorithm.js';
import { buildSeasonSchedule, createScheduleRound, getNextUnresolvedRound } from '../utils/storage.js';
import { getGameResultLabel } from '../utils/gameResults.js';
import { findOpponentClubByName } from '../utils/clubLogos.js';
import { buildMatchReport } from '../utils/matchReport.js';

function secondsToMinutes(seconds) {
  return Math.round((seconds || 0) / 60);
}

function formatRoundDateLabel(dateValue) {
  if (!dateValue) return 'Date TBC';
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRoundTimeLabel(timeValue) {
  if (!timeValue) return '';
  const [hours, minutes] = String(timeValue).split(':');
  const parsed = new Date();
  parsed.setHours(Number(hours || 0), Number(minutes || 0), 0, 0);
  if (Number.isNaN(parsed.getTime())) return timeValue;
  return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatRoundDateTimeLabel(dateValue, timeValue) {
  const dateLabel = formatRoundDateLabel(dateValue);
  if (!timeValue) return dateLabel;
  return `${dateLabel} · ${formatRoundTimeLabel(timeValue)}`;
}

function resultColorClass(label) {
  if (label === 'Win') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (label === 'Lose') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  if (label === 'Draw') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  if (label === 'Cancelled') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
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

function getCancelledDetails(data) {
  return Array.isArray(data.cancelledGameDetails) ? data.cancelledGameDetails : [];
}

export default function GameTab({ data, onUpdate, onSwitchToGame, readOnly = false }) {
  const { currentGame, players, team } = data;
  const [setupMode, setSetupMode] = useState(false);
  const [reportGame, setReportGame] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [setupMode, currentGame]);

  useEffect(() => {
    if (readOnly && setupMode) {
      setSetupMode(false);
    }
  }, [readOnly, setupMode]);

  function handleStartGame({ availablePlayers, absentPlayers, absentMinutes, formation, plan, gameNumber, opponentName, opponentLogoUrl, startingField, startingBench }) {
    if (readOnly) return;
    // Initialize per-player timers
    const playerTimers = {};
    for (const id of availablePlayers) {
      playerTimers[id] = { totalSeconds: 0, positionSeconds: {} };
    }
    const gameStartMs = Date.now();
    const newGame = {
      gameNumber,
      availablePlayers,
      absentPlayers: absentPlayers || [],
      absentMinutes: absentMinutes || [],
      formation,
      plan,
      startTime: gameStartMs,
      elapsedSeconds: 0,
      elapsedSecondsAtTimerStart: 0,
      timerStartedAtMs: gameStartMs,
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
    if (readOnly) return;
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

    const resolvedGoals = matchSummary?.goals ?? currentGame.goals ?? [];
    const resolvedSaves = matchSummary?.gkSaves ?? currentGame.gkSaves ?? {};
    const resolvedLog = matchSummary?.gameLog ?? currentGame.gameLog ?? [];
    const reportGame = {
      ...currentGame,
      elapsedSeconds,
      homeScore: matchSummary?.homeScore ?? currentGame.homeScore ?? 0,
      awayScore: matchSummary?.awayScore ?? currentGame.awayScore ?? 0,
      goals: resolvedGoals,
      gkSaves: resolvedSaves,
      gameLog: resolvedLog,
    };
    const matchReport = buildMatchReport({ game: reportGame, players, team });

    const historyEntry = {
      gameNumber: currentGame.gameNumber,
      date: new Date().toLocaleDateString(),
      formation: currentGame.formation,
      playerCount: availablePlayers.length,
      absentCount: (currentGame.absentPlayers || []).length,
      elapsedSeconds,
      opponentName: currentGame.opponentName || 'Opponent',
      opponentLogoUrl: currentGame.opponentLogoUrl || '',
      homeScore: reportGame.homeScore,
      awayScore: reportGame.awayScore,
      goals: resolvedGoals,
      gkSaves: resolvedSaves,
      gameLog: resolvedLog,
      playerTimers: matchSummary?.playerTimers ?? currentGame.playerTimers ?? {},
      absentMinutes: currentGame.absentMinutes || [],
      playerMinuteDeltas,
      availablePlayers: currentGame.availablePlayers || [],
      absentPlayers: currentGame.absentPlayers || [],
      startingField: currentGame.startingField || [],
      // startingBench is an array of player ID strings (set in GameDaySetup)
      startingBenchIds: Array.isArray(currentGame.startingBench)
        ? currentGame.startingBench.filter(id => typeof id === 'string')
        : [],
      startingBench: Array.isArray(currentGame.startingBench)
        ? currentGame.startingBench.filter(id => typeof id === 'string')
        : [],
      matchReport,
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
    <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
      <div className="card text-center py-8 space-y-4">
        <div className="text-6xl">⚽</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">No Game in Progress</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {activePlayers.length} active player{activePlayers.length !== 1 ? 's' : ''} available
          {!canStartGame && ` (need ${team.fieldPlayers + 1}+)`}
        </p>
        <button
          onClick={() => {
            if (readOnly) return;
            if (data.pendingGameSetup) {
              onUpdate({ ...data, pendingGameSetup: null });
            }
            setSetupMode(true);
          }}
          disabled={!canStartGame || readOnly}
          className={`btn-primary w-full text-lg ${(!canStartGame || readOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          🟢 Start New Game
        </button>
        <button
          onClick={handleCancelGame}
          disabled={readOnly}
          className={`btn-secondary w-full text-sm ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          ❌ Record Cancelled Game
        </button>
        {readOnly && (
          <p className="text-xs text-gray-400 dark:text-slate-500">View-only mode: game controls are disabled.</p>
        )}
        {!canStartGame && (
          <p className="text-xs text-gray-400 dark:text-slate-500">Add more players in the Team tab</p>
        )}
      </div>

      {historyItems.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Game History</h3>
          <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {[...historyItems].reverse().map((g) => {
              const isCancelled = g.historyType === 'cancelled';
              const label = isCancelled ? 'Cancelled' : getGameResultLabel(g);
              const fixtureType = g.homeAway === 'AWAY' ? 'Away' : 'Home';
              const dateText = g.cancelledDate
                ? g.cancelledDate
                : formatRoundDateTimeLabel(g.date || g.displayDate, g.kickoffTime);
              const roundNumber = g.gameNumber ?? g.round ?? '';
              const goalSummary = (g.goals || [])
                .map(goal => `${goal.playerName || '?'}${Number.isFinite(Number(goal.minute)) ? ` ${Number(goal.minute)}'` : ''}`.trim())
                .join(', ');
              const metaText = isCancelled
                ? `${fixtureType} fixture`
                : (goalSummary || 'No goals recorded');
              return (
                <li
                  key={g.historyKey || `${g.historyType}-${roundNumber}`}
                  className="rounded-xl border border-gray-200 p-3 space-y-2 dark:border-slate-800"
                >
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
                        <p className="font-semibold text-gray-900 dark:text-slate-100 leading-tight">
                          {isCancelled ? 'Round' : 'Game'} {roundNumber}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                          vs {g.opponentName || 'Opponent'}, {dateText}
                        </p>
                      </div>
                    </div>
                    {(g.homeScore !== undefined) ? (
                      <div className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-bold text-gray-900 dark:bg-slate-800 dark:text-slate-100">
                        {g.homeScore} - {g.awayScore}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 dark:text-slate-400">
                        {metaText}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${resultColorClass(label)}`}>
                        {label}
                      </span>
                    </div>
                    {!isCancelled && (
                      <button
                        onClick={() => setReportGame(g)}
                        className="text-xs font-semibold text-pitch-600 px-2.5 py-1 rounded-lg bg-pitch-50"
                      >
                        View Report
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {reportData && (
        <div className="fixed inset-0 bg-black/60 z-[75] flex items-stretch sm:items-center justify-center px-4" onClick={() => setReportGame(null)}>
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-pitch-700 to-pitch-600 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">Match Report · Game {reportGame?.gameNumber}</h3>
                  <p className="text-pitch-200 text-sm">{reportGame?.date || 'Date TBC'}</p>
                </div>
                <button onClick={() => setReportGame(null)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold active:bg-white/30 transition-colors">×</button>
              </div>
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-pitch-200">{reportData.teamName || team.name}</p>
                  <p className="text-4xl font-black">{reportData.homeScore}</p>
                </div>
                <span className="text-2xl font-bold opacity-70">-</span>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-pitch-200">{reportData.opponentName}</p>
                  <p className="text-4xl font-black">{reportData.awayScore}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="card">
                <h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Team Sheet</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Starting XI</p>
                    <ul className="grid grid-cols-2 gap-2 text-sm">
                      {(reportData.teamSheet?.startingField || []).map(slot => (
                        <li key={`${slot.playerId}-${slot.position}`} className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pitch-100 text-pitch-700 dark:bg-emerald-900/40 dark:text-emerald-200">{slot.position}</span>
                          <span className="font-semibold text-gray-900 dark:text-slate-100 truncate">{slot.playerName || '?'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bench</p>
                    {(reportData.teamSheet?.startingBench || []).length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-slate-500">No bench players recorded.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {reportData.teamSheet.startingBench.map(player => (
                          <span key={player.playerId} className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-xs font-semibold text-gray-700 dark:text-slate-200">
                            {player.playerName || '?'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Goals</h4>
                {(reportData.goals || []).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">No goals recorded.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {reportData.goals.map((goal, idx) => (
                      <li key={`${goal.playerId}-${idx}`} className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-slate-100">⚽ {goal.playerName || '?'}</span>
                        <span className="text-gray-500 dark:text-slate-400">{Number.isFinite(Number(goal.minute)) ? `${Number(goal.minute)}'` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Saves</h4>
                {(reportData.saves || []).length === 0 && (!reportData.saveSummary || reportData.saveSummary.length === 0) ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">No saves recorded.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {(reportData.saves || []).length > 0 ? (
                      reportData.saves.map(save => (
                        <li key={save.id} className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 dark:text-slate-100">🧤 {save.playerName || '?'}</span>
                          <span className="text-gray-500 dark:text-slate-400">{Number.isFinite(Number(save.minute)) ? `${Number(save.minute)}'` : ''}</span>
                        </li>
                      ))
                    ) : (
                      reportData.saveSummary?.map(save => (
                        <li key={save.playerId} className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 dark:text-slate-100">🧤 {save.playerName || '?'}</span>
                          <span className="text-gray-500 dark:text-slate-400">{save.count}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <div className="card">
                <h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Substitutions</h4>
                {(reportData.substitutions || []).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">No substitutions recorded.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {reportData.substitutions.map(sub => (
                      <li key={sub.id} className="flex items-center justify-between">
                        <span className="text-red-500 font-semibold">{sub.offPlayerName || '?'}</span>
                        <span className="text-gray-400">⇄</span>
                        <span className="text-emerald-600 font-semibold">{sub.onPlayerName || '?'}</span>
                        <span className="text-gray-500 dark:text-slate-400">{Number.isFinite(Number(sub.minute)) ? `${Number(sub.minute)}'` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Timeline</h4>
                {(reportData.timeline || []).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">No timeline events recorded.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {reportData.timeline.map(event => (
                      <li key={event.id} className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-slate-300">{Number.isFinite(Number(event.minute)) ? `${Number(event.minute)}'` : ''}</span>
                        <span className="flex-1 text-right font-semibold text-gray-900 dark:text-slate-100">
                          {event.type === 'goal' && `⚽ Goal · ${event.playerName || '?'}`}
                          {event.type === 'opponent-goal' && `⚽ Opponent Goal · ${event.opponentName || reportData.opponentName}`}
                          {event.type === 'save' && `🧤 Save · ${event.playerName || '?'}`}
                          {event.type === 'sub' && `⇄ ${event.offPlayerName || '?'} → ${event.onPlayerName || '?'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
