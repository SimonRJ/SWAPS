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
import { submitAdminRequest } from '../utils/netlifyData.js';

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

function getKeeperCandidates(game, players) {
  const keeperIds = new Set();
  if (Array.isArray(game?.playerMinuteDeltas)) {
    for (const delta of game.playerMinuteDeltas) {
      if ((delta?.minutesGK || 0) > 0) {
        keeperIds.add(delta.playerId);
      }
    }
  } else if (game?.playerTimers) {
    for (const [playerId, timer] of Object.entries(game.playerTimers)) {
      if ((timer?.positionSeconds?.GK || 0) > 0) {
        keeperIds.add(playerId);
      }
    }
  }
  for (const playerId of Object.keys(game?.gkSaves || {})) {
    keeperIds.add(playerId);
  }
  return players.filter(player => keeperIds.has(player.id));
}

export default function GameTab({ data, onUpdate, onSwitchToGame, sessionTeamId, readOnly = false }) {
  const { currentGame, players, team } = data;
  const [setupMode, setSetupMode] = useState(false);
  const [editingGameIndex, setEditingGameIndex] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [restoringCancelledRound, setRestoringCancelledRound] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ playerId: '', minute: '' });
  const [saveForm, setSaveForm] = useState({ playerId: '', saves: 1 });
  const [saveFormError, setSaveFormError] = useState('');
  const [deletePromptIndex, setDeletePromptIndex] = useState(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [requestHelpMode, setRequestHelpMode] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [setupMode, currentGame]);

  useEffect(() => {
    if (readOnly && setupMode) {
      setSetupMode(false);
    }
  }, [readOnly, setupMode]);

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
    if (readOnly) return;
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
        onUpdate={readOnly ? () => {} : handleUpdateGame}
        onEndGame={handleEndGame}
        onSwitchToGame={onSwitchToGame}
        readOnly={readOnly}
      />
    );
  }

  if (setupMode) {
    return (
      <GameDaySetup
        data={data}
        onStartGame={handleStartGame}
        onUpdate={readOnly ? () => {} : onUpdate}
        onCancel={() => {
          if (data.pendingGameSetup) {
            onUpdate({ ...data, pendingGameSetup: null });
          }
          setSetupMode(false);
        }}
        readOnly={readOnly}
      />
    );
  }

  // No game in progress
  const activePlayers = players.filter(p => p.isActive);
  const canStartGame = activePlayers.length >= (team.fieldPlayers + 1);
  const history = data.gameHistory || [];
  const cancelledDetails = getCancelledDetails(data);
  const historyItems = [
    ...history.map((game, index) => ({
      ...game,
      historyType: 'played',
      originalIndex: index,
      displayDate: game.date,
      historyKey: `played-${game.gameNumber ?? index}`,
    })),
    ...cancelledDetails.map(game => ({
      ...game,
      historyType: 'cancelled',
      gameNumber: game.round,
      displayDate: game.cancelledDate || game.date,
      historyKey: `cancelled-${game.round}`,
    })),
  ].sort((a, b) => (Number(a.gameNumber) || 0) - (Number(b.gameNumber) || 0));

  function handleCancelGame() {
    if (readOnly) return;
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
    if (readOnly) return;
    const history = data.gameHistory || [];
    const game = history[originalIndex];
    if (!game) return;
    setRestoringCancelledRound(null);
    setEditingGameIndex(originalIndex);
    setShowGoalForm(false);
    setShowSaveForm(false);
    const defaultPlayerId = players.length > 0 ? players[0].id : null;
    setGoalForm({ playerId: defaultPlayerId, minute: '' });
    setSaveForm({ playerId: defaultPlayerId, saves: 1 });
    setSaveFormError('');
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

  function openEditCancelledGame(game) {
    if (readOnly) return;
    if (!game) return;
    const historyLength = (data.gameHistory || []).length;
    setRestoringCancelledRound(game.round);
    setEditingGameIndex(historyLength);
    setShowGoalForm(false);
    setShowSaveForm(false);
    const defaultPlayerId = players.length > 0 ? players[0].id : null;
    setGoalForm({ playerId: defaultPlayerId, minute: '' });
    setSaveForm({ playerId: defaultPlayerId, saves: 1 });
    setSaveFormError('');
    const matchedClub = findOpponentClubByName(game.opponentName || '');
    setEditDraft({
      gameNumber: game.round,
      date: game.date || game.cancelledDate || '',
      opponentName: game.opponentName || 'Opponent',
      opponentLogoUrl: game.opponentLogoUrl || '',
      homeScore: 0,
      awayScore: 0,
      goals: [],
      gkSaves: {},
      playerMinuteDeltas: [],
      opponentClubId: matchedClub?.id || '__custom__',
      opponentSelectionTouched: false,
    });
  }

  function closeEditGame() {
    setEditingGameIndex(null);
    setEditDraft(null);
    setShowGoalForm(false);
    setShowSaveForm(false);
    setSaveFormError('');
    setRestoringCancelledRound(null);
  }

  function removeCancelledStatus(round) {
    if (readOnly) return;
    if (!window.confirm(`Remove cancelled status for Round ${round}?`)) return;
    const updatedCancelled = getCancelledDetails(data)
      .filter(item => Number(item.round) !== Number(round))
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    onUpdate({
      ...data,
      cancelledGameDetails: updatedCancelled,
      cancelledGames: updatedCancelled.length,
    });
  }

  function openDeletePrompt(originalIndex) {
    if (readOnly) return;
    setDeletePromptIndex(originalIndex);
    setDeleteAdminPassword('');
    setDeleteError('');
    setRequestHelpMode(false);
    setRequestMessage('');
    setRequestStatus('');
    setRequestError('');
    setRequestSubmitting(false);
  }

  function closeDeletePrompt() {
    setDeletePromptIndex(null);
    setDeleteAdminPassword('');
    setDeleteError('');
    setDeleteInProgress(false);
    setRequestHelpMode(false);
    setRequestMessage('');
    setRequestStatus('');
    setRequestError('');
    setRequestSubmitting(false);
  }

  function saveEditedGame() {
    if (editingGameIndex === null || !editDraft) return;
    const updatedHistory = [...(data.gameHistory || [])];
    const originalGame = updatedHistory[editingGameIndex] || {};
    const selectedOpponentClub = editDraft.opponentClubId && editDraft.opponentClubId !== '__custom__'
      ? getOpponentClubById(editDraft.opponentClubId)
      : null;
    let nextOpponentName = (editDraft.opponentName || '').trim() || originalGame.opponentName || 'Opponent';
    const nextOpponentLogoUrl = originalGame.opponentLogoUrl || '';
    if (editDraft.opponentSelectionTouched && selectedOpponentClub) {
      nextOpponentName = selectedOpponentClub.name || nextOpponentName;
    }
    const normalizedGoals = (editDraft.goals || [])
      .map(g => {
        const scorer = players.find(p => p.id === g.playerId);
        return {
          ...g,
          playerName: scorer?.name || g.playerName || '?',
          minute: sanitizeScore(g.minute),
        };
      })
      .sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0));
    const normalizedSaves = Object.fromEntries(
      Object.entries(editDraft.gkSaves || {}).map(([playerId, saves]) => ([
        playerId,
        sanitizeScore(saves),
      ])),
    );
    const updatedMinuteDeltas = Array.isArray(editDraft.playerMinuteDeltas)
      ? editDraft.playerMinuteDeltas.map(delta => ({
        ...delta,
        saves: normalizedSaves[delta.playerId] || 0,
      }))
      : editDraft.playerMinuteDeltas;
    updatedHistory[editingGameIndex] = {
      ...originalGame,
      opponentName: nextOpponentName,
      opponentLogoUrl: nextOpponentLogoUrl,
      homeScore: sanitizeScore(editDraft.homeScore),
      awayScore: sanitizeScore(editDraft.awayScore),
      goals: normalizedGoals,
      gkSaves: normalizedSaves,
      playerMinuteDeltas: updatedMinuteDeltas,
    };
    const recalculatedPlayers = applyHistoryToPlayers(players, updatedHistory);
    const updatedCancelled = restoringCancelledRound
      ? getCancelledDetails(data).filter(item => Number(item.round) !== Number(restoringCancelledRound))
      : getCancelledDetails(data);
    onUpdate({
      ...data,
      players: recalculatedPlayers,
      gameHistory: updatedHistory,
      ...(restoringCancelledRound
        ? {
            cancelledGameDetails: updatedCancelled,
            cancelledGames: updatedCancelled.length,
          }
        : {}),
    });
    closeEditGame();
  }

  async function deleteGameFromHistory(originalIndex, adminCode) {
    const nextHistory = (data.gameHistory || [])
      .filter((_, idx) => idx !== originalIndex)
      .map((g, idx) => ({ ...g, gameNumber: idx + 1 }));
    const recalculatedPlayers = applyHistoryToPlayers(players, nextHistory);
    const updateResult = await onUpdate(
      {
        ...data,
        players: recalculatedPlayers,
        gameHistory: nextHistory,
      },
      {
        adminCode,
        optimistic: false,
      },
    );
    if (updateResult?.ok === false) {
      setDeleteError(updateResult?.error?.message || 'Unable to delete the game. Check the administrator password.');
      return false;
    }
    closeEditGame();
    return true;
  }

  async function confirmDeleteGame() {
    if (deletePromptIndex === null) return;
    if (!deleteAdminPassword.trim()) {
      setDeleteError('Administrator password is required to delete a game.');
      return;
    }
    setDeleteInProgress(true);
    const ok = await deleteGameFromHistory(deletePromptIndex, deleteAdminPassword.trim());
    setDeleteInProgress(false);
    if (ok) {
      closeDeletePrompt();
    }
  }

  async function submitDeleteRequest() {
    if (deletePromptIndex === null) return;
    if (!requestMessage.trim()) {
      setRequestError('Please describe the game you want removed.');
      return;
    }
    setRequestSubmitting(true);
    setRequestError('');
    setRequestStatus('');
    const resolvedTeamId = sessionTeamId || team?.teamId || '';
    if (!resolvedTeamId) {
      setRequestError('Unable to identify your team. Ask an admin for help.');
      setRequestSubmitting(false);
      return;
    }
    const history = data.gameHistory || [];
    const targetGame = history[deletePromptIndex];
    const details = [];
    if (targetGame?.gameNumber) details.push(`Game ${targetGame.gameNumber}`);
    if (targetGame?.opponentName) details.push(`Opponent: ${targetGame.opponentName}`);
    if (targetGame?.date) details.push(`Date: ${targetGame.date}`);
    try {
      await submitAdminRequest({
        requestType: 'delete_game',
        teamId: resolvedTeamId,
        teamName: team?.name || '',
        description: requestMessage.trim(),
        details,
      });
      setRequestStatus('Admin has been notified of request.');
    } catch (error) {
      setRequestError(error?.message || 'Unable to send request.');
    } finally {
      setRequestSubmitting(false);
    }
  }

  const sortedGoals = editDraft
    ? (editDraft.goals || [])
      .map((goal, idx) => ({ ...goal, originalIndex: idx }))
      .sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0))
    : [];
  const isEditingExistingGame = editingGameIndex !== null && editingGameIndex < (data.gameHistory || []).length;
  const keeperCandidates = editDraft ? getKeeperCandidates(editDraft, players) : [];
  const keeperDisplayIds = new Set([
    ...keeperCandidates.map(player => player.id),
    ...Object.keys(editDraft?.gkSaves || {}),
  ]);
  const keeperDisplayPlayers = editDraft
    ? players.filter(player => keeperDisplayIds.has(player.id))
    : [];
  const keeperOptions = keeperCandidates.length > 0 ? keeperCandidates : players;

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
              const metaText = isCancelled
                ? `${fixtureType} fixture`
                : `${g.formation || 'Formation TBC'} · ${g.playerCount ?? 0}p${g.absentCount ? ` · ${g.absentCount} absent` : ''}`;
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
                  <div className="flex items-center gap-2">
                    {!readOnly && (isCancelled ? (
                      <>
                        <button
                          onClick={() => openEditCancelledGame(g)}
                          className="text-xs font-semibold text-pitch-600 px-2.5 py-1 rounded-lg bg-pitch-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeCancelledStatus(g.round ?? g.gameNumber)}
                          className="text-xs font-semibold text-red-600 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/30 dark:text-red-300"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openEditGame(g.originalIndex)}
                          className="text-xs font-semibold text-pitch-600 px-2.5 py-1 rounded-lg bg-pitch-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openDeletePrompt(g.originalIndex)}
                          className="text-xs font-semibold text-red-600 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/30 dark:text-red-300"
                        >
                          Delete
                        </button>
                      </>
                    ))}
                  </div>
                </div>
              </li>
            )})}
          </ul>
        </div>
      )}

      {editDraft && (
          <div className="fixed inset-0 h-dvh bg-black/60 z-[70] flex items-stretch sm:items-center justify-center overflow-hidden" onClick={closeEditGame}>
          <div className="bg-white dark:bg-slate-900 w-full h-dvh sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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
              <div className="px-6 py-5 bg-gray-50 border-b border-gray-100 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">{team.name || 'Home'}</p>
                    <input
                      id="edit-home-score"
                      type="number"
                      min={0}
                      className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 text-2xl text-center font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={editDraft.homeScore}
                      onChange={e => setEditDraft(d => ({ ...d, homeScore: e.target.value }))}
                    />
                  </div>
                  <div className="text-gray-300 dark:text-slate-600 text-2xl font-black pt-5">vs</div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">Opponent</p>
                    <input
                      id="edit-away-score"
                      type="number"
                      min={0}
                      className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 text-2xl text-center font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={editDraft.awayScore}
                      onChange={e => setEditDraft(d => ({ ...d, awayScore: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 space-y-5">
                {/* Opponent selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Opponent Team</label>
                  <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">
                    Opponent logo is managed in Team Settings.
                  </p>
                  <select
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Goal Scorers</label>
                    <button
                      onClick={() => {
                        if (players.length === 0) return;
                        setGoalForm({ playerId: players[0].id, minute: '' });
                        setShowGoalForm(true);
                      }}
                      disabled={players.length === 0}
                      className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                        players.length === 0
                          ? 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                          : 'text-pitch-600 bg-pitch-50 active:bg-pitch-100 dark:bg-emerald-900/40 dark:text-emerald-200'
                      }`}
                    >
                      <span className="text-base leading-none">+</span> Goal Scorer
                    </button>
                  </div>
                  {showGoalForm && (
                    <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={goalForm.playerId || ''}
                          onChange={e => setGoalForm(form => ({ ...form, playerId: e.target.value }))}
                        >
                          {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <div className="relative w-20">
                          <input
                            type="number"
                            min={0}
                            placeholder="min"
                            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center tabular-nums font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            value={goalForm.minute}
                            onChange={e => setGoalForm(form => ({ ...form, minute: e.target.value }))}
                          />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 dark:text-slate-500 pointer-events-none">&apos;</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!goalForm.playerId) return;
                            const scorer = players.find(p => p.id === goalForm.playerId);
                            setEditDraft(d => ({
                              ...d,
                              goals: [
                                ...(d.goals || []),
                                {
                                  playerId: goalForm.playerId,
                                  playerName: scorer?.name || '?',
                                  minute: sanitizeScore(goalForm.minute),
                                },
                              ],
                            }));
                            setShowGoalForm(false);
                          }}
                          className="btn-primary flex-1 text-xs"
                        >
                          Add Goal
                        </button>
                        <button onClick={() => setShowGoalForm(false)} className="btn-secondary flex-1 text-xs">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {sortedGoals.length === 0 ? (
                    <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 py-4 text-center dark:bg-slate-900 dark:border-slate-700">
                      <p className="text-sm text-gray-400 dark:text-slate-500">No goals recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedGoals.map(goal => {
                        const scorer = players.find(p => p.id === goal.playerId);
                        const scorerName = scorer?.name || goal.playerName || '?';
                        const minuteLabel = Number.isFinite(Number(goal.minute)) ? `${Number(goal.minute)}'` : '';
                        return (
                          <div key={`${goal.originalIndex}-${goal.playerId}-${goal.minute}`} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-3 dark:bg-slate-900">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-pitch-100 flex items-center justify-center text-pitch-700 text-xs font-bold shrink-0 dark:bg-emerald-900/40 dark:text-emerald-200">⚽</div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{scorerName}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400">{minuteLabel}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => setEditDraft(d => ({
                                ...d,
                                goals: (d.goals || []).filter((_, gIdx) => gIdx !== goal.originalIndex),
                              }))}
                              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-500 font-bold text-sm active:bg-red-200 transition-colors dark:bg-red-900/40 dark:text-red-300 dark:active:bg-red-900/60"
                              aria-label="Remove goal"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Keeper Saves */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Keeper Saves</label>
                    <button
                      onClick={() => {
                        if (keeperOptions.length === 0) return;
                        setSaveForm({ playerId: keeperOptions[0].id, saves: 1 });
                        setSaveFormError('');
                        setShowSaveForm(true);
                      }}
                      disabled={keeperOptions.length === 0}
                      className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                        keeperOptions.length === 0
                          ? 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                          : 'text-pitch-600 bg-pitch-50 active:bg-pitch-100 dark:bg-emerald-900/40 dark:text-emerald-200'
                      }`}
                    >
                      <span className="text-base leading-none">+</span> Add Save
                    </button>
                  </div>
                  {showSaveForm && (
                    <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={saveForm.playerId || ''}
                          onChange={e => {
                            setSaveForm(form => ({ ...form, playerId: e.target.value }));
                            if (saveFormError) setSaveFormError('');
                          }}
                        >
                          {keeperOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input
                          type="number"
                          min={1}
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center tabular-nums font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={saveForm.saves}
                          onChange={e => {
                            setSaveForm(form => ({ ...form, saves: e.target.value }));
                            if (saveFormError) setSaveFormError('');
                          }}
                        />
                      </div>
                      {saveFormError && (
                        <p className="text-xs text-red-600 dark:text-red-300">{saveFormError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!saveForm.playerId) return;
                            const toAdd = sanitizeScore(saveForm.saves);
                            if (toAdd < 1) {
                              setSaveFormError('Enter a save count of at least 1.');
                              return;
                            }
                            setEditDraft(d => {
                              const current = d.gkSaves || {};
                              return {
                                ...d,
                                gkSaves: {
                                  ...current,
                                  [saveForm.playerId]: (Number(current[saveForm.playerId]) || 0) + toAdd,
                                },
                              };
                            });
                            setShowSaveForm(false);
                          }}
                          className="btn-primary flex-1 text-xs"
                        >
                          Add Saves
                        </button>
                        <button onClick={() => setShowSaveForm(false)} className="btn-secondary flex-1 text-xs">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {keeperDisplayPlayers.length === 0 ? (
                    <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 py-4 text-center dark:bg-slate-900 dark:border-slate-700">
                      <p className="text-sm text-gray-400 dark:text-slate-500">No keeper saves recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {keeperDisplayPlayers.map(player => {
                        const totalSaves = Number(editDraft.gkSaves?.[player.id]) || 0;
                        return (
                          <div key={player.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-3 dark:bg-slate-900">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold shrink-0 dark:bg-emerald-900/40 dark:text-emerald-200">🧤</div>
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{player.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums">{totalSaves}</span>
                              {totalSaves > 0 && (
                                <button
                                  onClick={() => setEditDraft(d => {
                                    const nextSaves = { ...(d.gkSaves || {}) };
                                    delete nextSaves[player.id];
                                    return { ...d, gkSaves: nextSaves };
                                  })}
                                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-500 font-bold text-sm active:bg-red-200 transition-colors dark:bg-red-900/40 dark:text-red-300 dark:active:bg-red-900/60"
                                  aria-label="Remove saves"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 pt-4 pb-[calc(1.5rem+var(--app-tabbar-height))] border-t border-gray-100 bg-white space-y-3 dark:border-slate-800 dark:bg-slate-900">
              <button onClick={saveEditedGame} className="btn-primary w-full text-sm">
                Save Changes
              </button>
              <div className={`grid gap-3 ${isEditingExistingGame ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button onClick={closeEditGame} className="btn-secondary text-sm">
                  Cancel
                </button>
                {isEditingExistingGame && (
                  <button
                    onClick={() => openDeletePrompt(editingGameIndex)}
                    className="py-3 px-6 rounded-xl bg-red-50 text-red-600 font-semibold text-sm active:bg-red-100 transition-colors dark:bg-red-900/30 dark:text-red-300 dark:active:bg-red-900/50"
                  >
                    Delete Game
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {deletePromptIndex !== null && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center px-4" onClick={closeDeletePrompt}>
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-3xl mb-1">🗑️</div>
              <h3 className="text-lg font-black text-gray-900 dark:text-slate-100">Delete this game?</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">This will recalculate all season stats from game history.</p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Administrator Password</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={deleteAdminPassword}
                onChange={e => {
                  setDeleteAdminPassword(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder="Enter admin password"
                autoComplete="current-password"
              />
              {deleteError && (
                <p className="text-xs text-red-600 dark:text-red-300">{deleteError}</p>
              )}
            </div>
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-800">
              {!requestHelpMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setRequestHelpMode(true);
                    setRequestError('');
                    setRequestStatus('');
                  }}
                  className="w-full rounded-xl border border-pitch-200 bg-pitch-50 px-3 py-2 text-xs font-semibold text-pitch-700 transition-colors hover:bg-pitch-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                >
                  Request admin help
                </button>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Request details</label>
                  <textarea
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    rows={3}
                    placeholder="Describe the game you want removed"
                    value={requestMessage}
                    onChange={e => {
                      setRequestMessage(e.target.value);
                      if (requestError) setRequestError('');
                    }}
                  />
                  {requestError && <p className="text-xs text-red-600 dark:text-red-300">{requestError}</p>}
                  {requestStatus && <p className="text-xs text-emerald-600 dark:text-emerald-300">{requestStatus}</p>}
                  <button
                    type="button"
                    onClick={submitDeleteRequest}
                    disabled={requestSubmitting}
                    className="w-full rounded-xl bg-pitch-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-pitch-700 disabled:opacity-60"
                  >
                    {requestSubmitting ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={closeDeletePrompt} className="btn-secondary flex-1 text-sm" disabled={deleteInProgress}>
                Cancel
              </button>
              <button
                onClick={confirmDeleteGame}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${deleteInProgress ? 'bg-red-200 text-red-500 dark:bg-red-900/40 dark:text-red-200' : 'bg-red-50 text-red-600 active:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:active:bg-red-900/50'}`}
                disabled={deleteInProgress}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
