import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FOOTBALL_WEST_LOGO_URL } from '../utils/clubLogos.js';
import { getFormationSlotXPercent, POSITION_Y_PERCENT } from '../utils/formations.js';
import TeamAvatar from './TeamAvatar.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function posColor(pos) {
  if (pos === 'GK') return 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950';
  if (pos === 'DEF') return 'bg-gradient-to-b from-sky-400 to-blue-600 text-white';
  if (pos === 'MID') return 'bg-gradient-to-b from-violet-400 to-purple-700 text-white';
  if (pos === 'ATK') return 'bg-gradient-to-b from-rose-400 to-red-700 text-white';
  return 'bg-gradient-to-b from-slate-400 to-slate-600 text-white';
}

function posLabelSmall(pos) {
  if (pos === 'GK') return 'pos-gk';
  if (pos === 'DEF') return 'pos-def';
  if (pos === 'MID') return 'pos-mid';
  if (pos === 'ATK') return 'pos-atk';
  return 'pos-bench';
}

function getReadOnlyElapsed(base, nowMs, gameDurationSeconds) {
  if (!base) return 0;
  const safeElapsed = Math.max(0, Number(base.elapsedSeconds) || 0);
  if (base.isPaused || !base.receivedAtMs) {
    return Math.min(gameDurationSeconds, safeElapsed);
  }
  const deltaSeconds = Math.max(0, Math.floor((nowMs - base.receivedAtMs) / 1000));
  return Math.min(gameDurationSeconds, safeElapsed + deltaSeconds);
}

const PRE_SUB_ALERT_SECONDS_2MIN = 120;
const PRE_SUB_ALERT_SECONDS_1MIN = 60;
const SUB_INTERVAL_SECONDS = 10 * 60;
// Allow minor drift from refresh cadence before resyncing the read-only clock.
const READONLY_SYNC_THRESHOLD_SECONDS = 2;
const PITCH_MARKINGS = {
  penaltyAreaDepthPct: 15.7,
  penaltyAreaWidthPct: 59.3,
  goalAreaDepthPct: 5.2,
  goalAreaWidthPct: 26.9,
  centerCircleDiameterPct: 26.9,
  penaltySpotDistancePct: 10.5,
};

export default function GameTimer({ data, onUpdate, onEndGame, onSwitchToGame, readOnly = false }) {
  const { currentGame, players, team } = data;
  const { plan, availablePlayers } = currentGame;
  const opponentLogo = currentGame.opponentLogoUrl || '';
  const planLength = plan.length;
  const lastBlockIndex = Math.max(planLength - 1, 0);

  const [elapsedSeconds, setElapsedSeconds] = useState(currentGame.elapsedSeconds || 0);
  const [isPaused, setIsPaused] = useState(currentGame.isPaused || false);
  const [blockIndex, setBlockIndex] = useState(currentGame.blockIndex || 0);
  const [homeScore, setHomeScore] = useState(currentGame.homeScore || 0);
  const [awayScore, setAwayScore] = useState(currentGame.awayScore || 0);
  const [goals, setGoals] = useState(currentGame.goals || []);
  const [gkSaves, setGkSaves] = useState(currentGame.gkSaves || {});
  const [playerTimers, setPlayerTimers] = useState(currentGame.playerTimers || {});
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showMatchSummary, setShowMatchSummary] = useState(false);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [pendingBlockIndex, setPendingBlockIndex] = useState(null);
  const [subAlertType, setSubAlertType] = useState('due');
  const [lastPreAlertBlock, setLastPreAlertBlock] = useState(null);
  const [lastPreAlert2MinBlock, setLastPreAlert2MinBlock] = useState(null);
  const [showResumeOptions, setShowResumeOptions] = useState(() => (
    (currentGame.elapsedSeconds || 0) > 0 && !currentGame.isPaused
  ));
  const [manualTimeSeconds, setManualTimeSeconds] = useState(currentGame.elapsedSeconds || 0);
  const [saveFeedback, setSaveFeedback] = useState('');
  const feedbackTimeoutRef = useRef(null);

  // Custom field/bench assignments (overrides plan)
  const [customField, setCustomField] = useState(() => (
    currentGame.customField || currentGame.startingField || currentGame.plan?.[currentGame.blockIndex || 0]?.onField || []
  ));
  const [customBench, setCustomBench] = useState(() => (
    currentGame.customBench || currentGame.startingBench || currentGame.plan?.[currentGame.blockIndex || 0]?.onBench || []
  ));

  const intervalRef = useRef(null);
  const elapsedRef = useRef(elapsedSeconds);
  const isPausedRef = useRef(isPaused);
  const customFieldRef = useRef(customField);
  const lastTickMsRef = useRef(currentGame.lastTickAtMs || 0);
  const readOnlySyncRef = useRef(null);
  const onSwitchToGameRef = useRef(onSwitchToGame);

  const gameDurationSeconds = useMemo(() => team.gameDuration * 60, [team.gameDuration]);

  useEffect(() => { elapsedRef.current = elapsedSeconds; }, [elapsedSeconds]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { customFieldRef.current = customField; }, [customField]);
  useEffect(() => { onSwitchToGameRef.current = onSwitchToGame; }, [onSwitchToGame]);
  useEffect(() => {
    if (!lastTickMsRef.current) lastTickMsRef.current = Date.now();
  }, []);
  useEffect(() => { setManualTimeSeconds(elapsedSeconds); }, [elapsedSeconds]);
  useEffect(() => {
    if (showResumeOptions) setIsPaused(true);
  }, [showResumeOptions]);
  useEffect(() => () => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!readOnly) return;
    const remoteElapsed = Number(currentGame.elapsedSeconds) || 0;
    const remotePaused = Boolean(currentGame.isPaused);
    const now = Date.now();
    const base = readOnlySyncRef.current;
    const seededBase = base || {
      elapsedSeconds: remoteElapsed,
      receivedAtMs: now,
      isPaused: remotePaused,
    };
    const localElapsed = getReadOnlyElapsed(seededBase, now, gameDurationSeconds);
    const driftSeconds = Math.abs(remoteElapsed - localElapsed);
    const shouldResync = !base
      || remotePaused !== seededBase.isPaused
      || driftSeconds >= READONLY_SYNC_THRESHOLD_SECONDS
      || (remoteElapsed === 0 && localElapsed > 0);

    if (shouldResync) {
      readOnlySyncRef.current = {
        elapsedSeconds: remoteElapsed,
        receivedAtMs: now,
        isPaused: remotePaused,
      };
      elapsedRef.current = remoteElapsed;
      setElapsedSeconds(remoteElapsed);
      setBlockIndex(Math.min(Math.floor(remoteElapsed / SUB_INTERVAL_SECONDS), lastBlockIndex));
    } else if (remoteElapsed > seededBase.elapsedSeconds) {
      // Remote time advanced slightly; bump baseline without forcing a full resync.
      readOnlySyncRef.current = {
        ...seededBase,
        elapsedSeconds: remoteElapsed,
        receivedAtMs: now,
      };
    }
    setIsPaused(remotePaused);
    setHomeScore(currentGame.homeScore || 0);
    setAwayScore(currentGame.awayScore || 0);
    setGoals(currentGame.goals || []);
    setGkSaves(currentGame.gkSaves || {});
    setPlayerTimers(currentGame.playerTimers || {});
    setCustomField(
      currentGame.customField
      || currentGame.startingField
      || currentGame.plan?.[currentGame.blockIndex || 0]?.onField
      || []
    );
    setCustomBench(
      currentGame.customBench
      || currentGame.startingBench
      || currentGame.plan?.[currentGame.blockIndex || 0]?.onBench
      || []
    );
    setShowGoalPicker(false);
    setShowResumeOptions(false);
  }, [readOnly, currentGame, gameDurationSeconds, lastBlockIndex]);

  useEffect(() => {
    if (!readOnly) return undefined;
    const tick = () => {
      const now = Date.now();
      const base = readOnlySyncRef.current || {
        elapsedSeconds: elapsedRef.current,
        receivedAtMs: now,
        isPaused: isPausedRef.current,
      };
      if (!readOnlySyncRef.current) {
        readOnlySyncRef.current = base;
      }
      const nextElapsed = getReadOnlyElapsed(base, now, gameDurationSeconds);
      if (nextElapsed !== elapsedRef.current) {
        elapsedRef.current = nextElapsed;
        setElapsedSeconds(nextElapsed);
        setBlockIndex(Math.min(Math.floor(nextElapsed / SUB_INTERVAL_SECONDS), lastBlockIndex));
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [readOnly, gameDurationSeconds, lastBlockIndex]);

  // Use custom assignments if set, otherwise use plan
  const fieldAssignments = customField;
  const benchIds = customBench;

  const getPlayer = useCallback((id) => players.find(p => p.id === id), [players]);

  // Count position indices for field layout
  function getPositionIndex(playerId, position, assignments) {
    let idx = 0;
    for (const a of assignments) {
      if (a.playerId === playerId) return idx;
      if (a.position === position) idx++;
    }
    return 0;
  }

  // Save state to data
  const saveState = useCallback((seconds, paused, bIdx, hScore, aScore, gls, saves, pTimers, cField, cBench) => {
    if (readOnly) return;
    onUpdate({
      ...data,
      currentGame: {
        ...data.currentGame,
        elapsedSeconds: seconds,
        isPaused: paused,
        blockIndex: bIdx,
        homeScore: hScore,
        awayScore: aScore,
        goals: gls,
        gkSaves: saves,
        playerTimers: pTimers,
        customField: cField,
        customBench: cBench,
        lastTickAtMs: lastTickMsRef.current,
      },
    });
  }, [data, onUpdate, readOnly]);

  // Timer tick
  useEffect(() => {
    if (readOnly) return undefined;
    if (isPaused) {
      clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      if (!lastTickMsRef.current) {
        lastTickMsRef.current = now;
        return;
      }
      const elapsedMs = now - lastTickMsRef.current;
      const deltaSeconds = Math.floor(elapsedMs / 1000);
      if (deltaSeconds < 1) return;
      lastTickMsRef.current = now;
      const currentElapsed = elapsedRef.current;
      const newElapsed = Math.min(gameDurationSeconds, currentElapsed + deltaSeconds);
      const appliedSeconds = Math.max(0, newElapsed - currentElapsed);
      if (appliedSeconds === 0) return;
      setElapsedSeconds(newElapsed);

      // Update player timers for those on field
      setPlayerTimers(prev => {
        const updated = { ...prev };
        for (const a of customFieldRef.current) {
          if (!updated[a.playerId]) {
            updated[a.playerId] = { totalSeconds: 0, positionSeconds: {} };
          }
          updated[a.playerId] = {
            ...updated[a.playerId],
            totalSeconds: (updated[a.playerId].totalSeconds || 0) + appliedSeconds,
            positionSeconds: {
              ...updated[a.playerId].positionSeconds,
              [a.position]: ((updated[a.playerId].positionSeconds || {})[a.position] || 0) + appliedSeconds,
            },
          };
        }
        return updated;
      });

      // Check if we've crossed a sub block boundary
      const newBlock = Math.floor(newElapsed / SUB_INTERVAL_SECONDS);
      const currentBlockFromTime = Math.min(newBlock, lastBlockIndex);
      const nextBlockIndex = Math.floor(newElapsed / SUB_INTERVAL_SECONDS) + 1;
      const nextBlockAt = nextBlockIndex * SUB_INTERVAL_SECONDS;

      // 2-minute warning
      if (
        nextBlockIndex < plan.length &&
        newElapsed >= (nextBlockAt - PRE_SUB_ALERT_SECONDS_2MIN) &&
        newElapsed < (nextBlockAt - PRE_SUB_ALERT_SECONDS_1MIN) &&
        lastPreAlert2MinBlock !== nextBlockIndex
      ) {
        setPendingBlockIndex(nextBlockIndex);
        setSubAlertType('upcoming_2min');
        setShowSubModal(true);
        setLastPreAlert2MinBlock(nextBlockIndex);
        if (onSwitchToGameRef.current) onSwitchToGameRef.current();
      }

      // 1-minute reminder
      if (
        nextBlockIndex < plan.length &&
        newElapsed >= (nextBlockAt - PRE_SUB_ALERT_SECONDS_1MIN) &&
        newElapsed < nextBlockAt &&
        lastPreAlertBlock !== nextBlockIndex
      ) {
        setPendingBlockIndex(nextBlockIndex);
        setSubAlertType('upcoming');
        setShowSubModal(true);
        setLastPreAlertBlock(nextBlockIndex);
        if (onSwitchToGameRef.current) onSwitchToGameRef.current();
      }

      setBlockIndex(prev => {
        if (currentBlockFromTime > prev && currentBlockFromTime < plan.length) {
          setPendingBlockIndex(currentBlockFromTime);
          setSubAlertType('due');
          setShowSubModal(true);
          return currentBlockFromTime;
        }
        return prev;
      });

      if (newElapsed >= gameDurationSeconds) {
        clearInterval(intervalRef.current);
        setIsPaused(true);
      }
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [readOnly, isPaused, gameDurationSeconds, plan, blockIndex, customField, lastPreAlertBlock, lastPreAlert2MinBlock, lastBlockIndex]);

  // Persist state periodically
  useEffect(() => {
    const t = setTimeout(() => {
      saveState(elapsedSeconds, isPaused, blockIndex, homeScore, awayScore, goals, gkSaves, playerTimers, customField, customBench);
    }, 3000);
    return () => clearTimeout(t);
  }, [elapsedSeconds, isPaused, blockIndex, homeScore, awayScore, goals, gkSaves, playerTimers, saveState, customField, customBench]);

  const gameOver = elapsedSeconds >= gameDurationSeconds;

  function handlePause() {
    if (readOnly) return;
    const newPaused = !isPaused;
    if (!newPaused) {
      lastTickMsRef.current = Date.now();
    }
    setIsPaused(newPaused);
    saveState(elapsedSeconds, newPaused, blockIndex, homeScore, awayScore, goals, gkSaves, playerTimers, customField, customBench);
  }

  function dismissSubModal() {
    setPendingBlockIndex(null);
    setShowSubModal(false);
  }

  function skipSubBlock() {
    if (readOnly) return;
    setPendingBlockIndex(null);
    setShowSubModal(false);
  }

  function applySubsFromPlan() {
    if (readOnly) return;
    // Auto-apply substitutions: update field and bench to match the plan for the pending block
    if (pendingBlockIndex !== null && pendingBlockIndex < plan.length) {
      const targetBlock = plan[pendingBlockIndex];
      setCustomField(targetBlock.onField);
      setCustomBench(targetBlock.onBench);
    }
    setPendingBlockIndex(null);
    setShowSubModal(false);
  }

  function finalizeGame() {
    if (readOnly) return;
    onEndGame(blockIndex, elapsedSeconds, {
      homeScore,
      awayScore,
      goals,
      gkSaves,
      playerTimers,
    });
  }

  function handleEndGame() {
    if (readOnly) return;
    if (!window.confirm('End this game? Stats will be saved.')) return;
    clearInterval(intervalRef.current);
    finalizeGame();
  }

  function handleConfirmEndGame() {
    if (readOnly) return;
    finalizeGame();
  }

  function applyManualTime() {
    if (readOnly) return;
    const manualValue = Number(manualTimeSeconds);
    const safeValue = Number.isFinite(manualValue) ? manualValue : elapsedSeconds;
    const nextTime = Math.max(0, Math.min(gameDurationSeconds, safeValue));
    const nextBlock = Math.min(Math.floor(nextTime / SUB_INTERVAL_SECONDS), lastBlockIndex);
    setElapsedSeconds(nextTime);
    setBlockIndex(nextBlock);
    setIsPaused(true);
    elapsedRef.current = nextTime;
    lastTickMsRef.current = Date.now();
    saveState(nextTime, true, nextBlock, homeScore, awayScore, goals, gkSaves, playerTimers, customField, customBench);
  }

  function handleResumeNow() {
    if (readOnly) return;
    lastTickMsRef.current = Date.now();
    setIsPaused(false);
    setShowResumeOptions(false);
    saveState(elapsedSeconds, false, blockIndex, homeScore, awayScore, goals, gkSaves, playerTimers, customField, customBench);
  }

  function addGoal(playerId) {
    if (readOnly) return;
    const player = getPlayer(playerId);
    const newGoal = {
      playerId,
      playerName: player?.name || '?',
      minute: Math.floor(elapsedSeconds / 60),
    };
    const newGoals = [...goals, newGoal];
    setGoals(newGoals);
    setHomeScore(prev => prev + 1);
    setShowGoalPicker(false);
  }

  function setTimedFeedback(message) {
    setSaveFeedback(message);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setSaveFeedback(''), 1800);
  }

  function addGoalkeeperSave() {
    if (readOnly) return;
    const goalkeeper = fieldAssignments.find(a => a.position === 'GK');
    if (!goalkeeper?.playerId) {
      setTimedFeedback('Assign a goalkeeper on field to record saves.');
      return;
    }
    const goalkeeperName = getPlayer(goalkeeper.playerId)?.name || 'Goalkeeper';
    setGkSaves(prev => ({
      ...prev,
      [goalkeeper.playerId]: (prev[goalkeeper.playerId] || 0) + 1,
    }));
    setTimedFeedback(`🧤 Save recorded for ${goalkeeperName}.`);
  }

  // Drag and drop handlers
  function handleDragStart(playerId, fromType) {
    if (readOnly) return;
    setDraggedPlayer({ playerId, fromType });
  }

  function handleDropOnPosition(targetPosition, targetIndex, dragInfo = draggedPlayer) {
    if (readOnly) return;
    if (!dragInfo) return;
    const { playerId, fromType } = dragInfo;
    const currentFieldArr = [...fieldAssignments];
    const currentBenchArr = [...benchIds];

    if (fromType === 'field') {
      // Swap field position or move to new position
      const existingIdx = currentFieldArr.findIndex(a => a.playerId === playerId);
      if (existingIdx === -1) return;
      const sourcePosition = currentFieldArr[existingIdx].position;

      // Check if there's already someone at target position slot
      const positionPlayers = currentFieldArr.filter(a => a.position === targetPosition);
      if (targetIndex < positionPlayers.length) {
        // Swap positions
        const targetPlayer = positionPlayers[targetIndex];
        const targetFieldIdx = currentFieldArr.findIndex(a => a.playerId === targetPlayer.playerId);
        currentFieldArr[existingIdx] = { ...currentFieldArr[existingIdx], position: targetPosition };
        currentFieldArr[targetFieldIdx] = { ...currentFieldArr[targetFieldIdx], position: sourcePosition };
      } else {
        // Just change position
        currentFieldArr[existingIdx] = { ...currentFieldArr[existingIdx], position: targetPosition };
      }
      setCustomField(currentFieldArr);
    } else if (fromType === 'bench') {
      // Move from bench to field - need to swap with someone
      // Find who to swap with: the first person in that position
      const positionPlayers = currentFieldArr.filter(a => a.position === targetPosition);
      if (positionPlayers.length > 0) {
        const targetFieldPlayer = positionPlayers[Math.min(targetIndex, positionPlayers.length - 1)];
        const targetFieldIdx = currentFieldArr.findIndex(a => a.playerId === targetFieldPlayer.playerId);

        // Move target to bench, put dragged player on field
        const newBench = currentBenchArr.filter(id => id !== playerId);
        newBench.push(targetFieldPlayer.playerId);
        currentFieldArr[targetFieldIdx] = { playerId, position: targetPosition };

        setCustomField(currentFieldArr);
        setCustomBench(newBench);
      }
    }
    setDraggedPlayer(null);
  }

  function handleDropOnBench(dragInfo = draggedPlayer) {
    if (readOnly) return;
    if (!dragInfo) return;
    const { playerId, fromType } = dragInfo;

    if (fromType === 'field' && benchIds.length > 0) {
      // Swap with first bench player
      const currentFieldArr = [...fieldAssignments];
      const currentBenchArr = [...benchIds];
      const fieldIdx = currentFieldArr.findIndex(a => a.playerId === playerId);
      if (fieldIdx === -1) return;

      const benchPlayerId = currentBenchArr[0];
      const position = currentFieldArr[fieldIdx].position;

      currentFieldArr[fieldIdx] = { playerId: benchPlayerId, position };
      const newBench = currentBenchArr.filter(id => id !== benchPlayerId);
      newBench.push(playerId);

      setCustomField(currentFieldArr);
      setCustomBench(newBench);
    }
    setDraggedPlayer(null);
  }

  function handleDropOnFieldPlayer(targetPlayerId, dragInfo = draggedPlayer) {
    if (readOnly) return;
    if (!dragInfo) return;
    const { playerId, fromType } = dragInfo;
    if (playerId === targetPlayerId) {
      setDraggedPlayer(null);
      return;
    }

    const currentFieldArr = [...fieldAssignments];
    const currentBenchArr = [...benchIds];
    const targetFieldIdx = currentFieldArr.findIndex(a => a.playerId === targetPlayerId);
    if (targetFieldIdx === -1) return;

    if (fromType === 'field') {
      const sourceFieldIdx = currentFieldArr.findIndex(a => a.playerId === playerId);
      if (sourceFieldIdx === -1) return;
      const sourcePosition = currentFieldArr[sourceFieldIdx].position;
      const targetPosition = currentFieldArr[targetFieldIdx].position;
      currentFieldArr[sourceFieldIdx] = { ...currentFieldArr[sourceFieldIdx], position: targetPosition };
      currentFieldArr[targetFieldIdx] = { ...currentFieldArr[targetFieldIdx], position: sourcePosition };
      setCustomField(currentFieldArr);
    } else if (fromType === 'bench') {
      const targetPosition = currentFieldArr[targetFieldIdx].position;
      const newBench = currentBenchArr.filter(id => id !== playerId);
      newBench.push(targetPlayerId);
      currentFieldArr[targetFieldIdx] = { playerId, position: targetPosition };
      setCustomField(currentFieldArr);
      setCustomBench(newBench);
    }

    setDraggedPlayer(null);
  }

  // Touch drag for mobile
  const touchRef = useRef(null);
  const [touchDragPlayer, setTouchDragPlayer] = useState(null);
  const [touchPos, setTouchPos] = useState(null);

  function handleTouchStart(e, playerId, fromType) {
    if (readOnly) return;
    // Prevent page scrolling while dragging players on touch devices.
    e.preventDefault();
    const touch = e.touches[0];
    touchRef.current = { playerId, fromType, startX: touch.clientX, startY: touch.clientY };
    setTouchDragPlayer({ playerId, fromType });
    setTouchPos({ x: touch.clientX, y: touch.clientY });
  }

  function handleTouchMove(e) {
    if (readOnly) return;
    if (!touchRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    setTouchPos({ x: touch.clientX, y: touch.clientY });
  }

  function handleTouchEnd(e) {
    if (readOnly) return;
    if (!touchRef.current) {
      setTouchDragPlayer(null);
      setTouchPos(null);
      touchRef.current = null;
      return;
    }

    const finalTouch = e?.changedTouches?.[0];
    const dropX = finalTouch?.clientX ?? touchPos?.x;
    const dropY = finalTouch?.clientY ?? touchPos?.y;
    if (dropX === undefined || dropY === undefined) {
      setTouchDragPlayer(null);
      setTouchPos(null);
      touchRef.current = null;
      return;
    }
    e.preventDefault();

    // Find what element is at the drop position
    const dragInfo = touchRef.current;
    const elem = document.elementFromPoint(dropX, dropY);
    if (elem) {
      const targetPlayerNode = elem.closest('[data-drop-player]');
      if (targetPlayerNode) {
        const targetPlayerId = targetPlayerNode.getAttribute('data-drop-player');
        if (targetPlayerId) {
          handleDropOnFieldPlayer(targetPlayerId, dragInfo);
        }
      } else {
        const dropZone = elem.closest('[data-drop-zone]');
        if (dropZone) {
          const zone = dropZone.getAttribute('data-drop-zone');
          if (zone === 'bench') {
            handleDropOnBench(dragInfo);
          } else if (zone.startsWith('position-')) {
            const parts = zone.split('-');
            const pos = parts[1];
            const idx = parseInt(parts[2] || '0');
            handleDropOnPosition(pos, idx, dragInfo);
          }
        }
      }
    }

    setTouchDragPlayer(null);
    setTouchPos(null);
    touchRef.current = null;
  }

  // Get subs between blocks for modal
  function getSubsBetween(currentField, targetField) {
    const prevFieldMap = new Map(currentField.map(a => [a.playerId, a.position]));
    const nextFieldMap = new Map(targetField.map(a => [a.playerId, a.position]));
    const comingOff = currentField.filter(a => !nextFieldMap.has(a.playerId));
    const comingOn = targetField.filter(a => !prevFieldMap.has(a.playerId));
    const subs = [];
    for (let i = 0; i < comingOn.length; i++) {
      subs.push({
        off: comingOff[i]?.playerId || null,
        offPosition: comingOff[i]?.position || null,
        on: comingOn[i].playerId,
        position: comingOn[i].position,
      });
    }
    return subs;
  }

  const currentSubs = pendingBlockIndex !== null && pendingBlockIndex < plan.length
    ? getSubsBetween(fieldAssignments, plan[pendingBlockIndex]?.onField || [])
    : [];
  const nextBlockIndex = Math.floor(elapsedSeconds / SUB_INTERVAL_SECONDS) + 1;
  const hasNextBlock = !gameOver && nextBlockIndex < plan.length;
  const nextBlockAtSeconds = nextBlockIndex * SUB_INTERVAL_SECONDS;
  const nextBlockSecondsRemaining = hasNextBlock ? Math.max(0, nextBlockAtSeconds - elapsedSeconds) : 0;
  const nextSubs = hasNextBlock
    ? getSubsBetween(fieldAssignments, plan[nextBlockIndex]?.onField || [])
    : [];
  const nextSubCountdownColor = !hasNextBlock
    ? 'text-slate-300'
    : nextBlockSecondsRemaining <= PRE_SUB_ALERT_SECONDS_1MIN
      ? 'text-red-500'
      : nextBlockSecondsRemaining <= PRE_SUB_ALERT_SECONDS_2MIN
        ? 'text-orange-400'
        : 'text-emerald-400';
  // Group field players by position for field layout
  const positionGroups = {};
  for (const a of fieldAssignments) {
    if (!positionGroups[a.position]) positionGroups[a.position] = [];
    positionGroups[a.position].push(a);
  }

  // Goal counts per player
  const goalCounts = {};
  for (const g of goals) {
    goalCounts[g.playerId] = (goalCounts[g.playerId] || 0) + 1;
  }
  const totalSaves = Object.values(gkSaves || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

  // Render match summary
  if (showMatchSummary) {
    return (
      <div className="h-full overflow-y-auto pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <div className="card text-center space-y-3">
          <h2 className="text-2xl font-black text-gray-900 dark:text-slate-100">Match Summary</h2>
          <div className="text-sm text-gray-500 dark:text-slate-400">Game {currentGame.gameNumber}</div>

          {/* Final Score */}
          <div className="bg-pitch-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="flex justify-center mb-1">
                  <TeamAvatar
                    src={team.logoUrl || FOOTBALL_WEST_LOGO_URL}
                    alt={`${team.name || 'Team'} logo`}
                    name={team.name}
                    sizeClass="w-8 h-8"
                    className="border-white/30"
                  />
                </div>
                <div className="text-sm font-medium opacity-80">{team.name}</div>
                <div className="text-5xl font-black">{homeScore}</div>
              </div>
              <div className="text-2xl font-bold opacity-60">-</div>
              <div className="text-center">
                <div className="flex justify-center mb-1">
                  <TeamAvatar
                    src={opponentLogo}
                    alt={`${currentGame.opponentName} logo`}
                    name={currentGame.opponentName}
                    sizeClass="w-8 h-8"
                    className="border-white/30"
                  />
                </div>
                <div className="text-sm font-medium opacity-80">{currentGame.opponentName}</div>
                <div className="text-5xl font-black">{awayScore}</div>
              </div>
            </div>
            <div className="mt-3 text-sm opacity-70">
              {formatTime(elapsedSeconds)} played · {currentGame.formation}
            </div>
          </div>
        </div>

        {/* Goals */}
        {goals.length > 0 && (
          <div className="card">
            <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">⚽ Goals</h3>
            <ul className="space-y-2">
              {goals.map((g, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">⚽</span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">{g.playerName}</span>
                  <span className="text-gray-400 dark:text-slate-500">{g.minute}&#39;</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {totalSaves > 0 && (
          <div className="card">
            <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">🧤 Saves</h3>
            <ul className="space-y-2">
              {Object.entries(gkSaves)
                .filter(([, count]) => Number(count) > 0)
                .map(([playerId, count]) => (
                  <li key={playerId} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 dark:text-slate-100">{getPlayer(playerId)?.name || '?'}</span>
                    <span className="text-gray-600 dark:text-slate-300 font-semibold">🧤 {count}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Player Time Breakdown */}
        <div className="card">
          <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">⏱ Player Time</h3>
          <ul className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {availablePlayers.map(id => {
              const player = getPlayer(id);
              const timer = playerTimers[id] || { totalSeconds: 0, positionSeconds: {} };
              const totalMin = Math.floor(timer.totalSeconds / 60);
              const playerGoals = goalCounts[id] || 0;
              const playerSaves = Number(gkSaves[id]) || 0;
              return (
                <li key={id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-slate-100">{player?.name || '?'}</span>
                      {playerGoals > 0 && (
                        <span className="text-sm">
                          {Array.from({ length: playerGoals }, () => '⚽').join('')}
                        </span>
                      )}
                      {playerSaves > 0 && (
                        <span className="text-sm font-semibold text-emerald-700">🧤 {playerSaves}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">{totalMin} min</span>
                  </div>
                  <div className="flex gap-1 h-4">
                    {['GK', 'DEF', 'MID', 'ATK'].map(pos => {
                      const secs = (timer.positionSeconds || {})[pos] || 0;
                      if (secs === 0) return null;
                      const pct = Math.max((secs / timer.totalSeconds) * 100, 8);
                      const colors = {
                        GK: 'bg-yellow-400',
                        DEF: 'bg-blue-500',
                        MID: 'bg-purple-500',
                        ATK: 'bg-red-500',
                      };
                      return (
                        <div
                          key={pos}
                          className={`${colors[pos]} rounded-sm flex items-center justify-center text-white text-[9px] font-bold`}
                          style={{ width: `${pct}%` }}
                        >
                          {Math.floor(secs / 60) > 0 ? `${pos}` : ''}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {['GK', 'DEF', 'MID', 'ATK'].map(pos => {
                      const secs = (timer.positionSeconds || {})[pos] || 0;
                      if (secs === 0) return null;
                      const colors = {
                        GK: 'text-yellow-600',
                        DEF: 'text-blue-600',
                        MID: 'text-purple-600',
                        ATK: 'text-red-600',
                      };
                      return (
                        <span key={pos} className={`text-[10px] font-medium ${colors[pos]}`}>
                          {pos}: {Math.floor(secs / 60)}m
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Position Legend */}
        <div className="card">
          <div className="flex gap-3 justify-center text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> GK</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> DEF</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> MID</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> ATK</span>
          </div>
        </div>

        {!readOnly ? (
          <button onClick={handleConfirmEndGame} className="btn-primary w-full text-lg">
            ✅ Save & Finish
          </button>
        ) : (
          <button onClick={() => setShowMatchSummary(false)} className="btn-secondary w-full text-lg">
            Back to Game
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto h-full overflow-hidden overscroll-none flex flex-col pb-0"
      role="main"
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Scoreboard */}
      <div className={`px-2 py-0.5 shrink-0 ${gameOver ? 'bg-gray-800' : isPaused ? 'bg-amber-700' : 'bg-slate-900'} text-white`}>
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[11px] font-semibold opacity-70">
            {gameOver ? 'FULL TIME' : isPaused ? 'PAUSED' : `GAME ${currentGame.gameNumber}`}
          </div>
          <div className="text-sm font-black tabular-nums">
            {formatTime(elapsedSeconds)}
            <span className="text-[10px] font-normal opacity-60 ml-1">/ {team.gameDuration}:00</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3">
          <div className="flex-1 text-right">
            <div className="text-[11px] opacity-70 truncate flex items-center justify-end gap-1">
              <span>{team.name}</span>
              <TeamAvatar
                src={team.logoUrl || FOOTBALL_WEST_LOGO_URL}
                alt={`${team.name || 'Team'} logo`}
                name={team.name}
                sizeClass="w-3.5 h-3.5"
                className="border-white/30"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (readOnly) return;
                  if (homeScore > 0) {
                    setHomeScore(s => s - 1);
                    setGoals(prev => prev.slice(0, -1));
                  }
                }}
                disabled={readOnly}
                className={`w-5 h-5 rounded-full bg-white/20 text-white text-xs font-bold active:bg-white/30 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >−</button>
              <span className="text-[28px] font-black tabular-nums leading-none">{homeScore}</span>
              <button
                onClick={() => {
                  if (readOnly) return;
                  setHomeScore(s => s + 1);
                }}
                disabled={readOnly}
                className={`w-5 h-5 rounded-full bg-white/20 text-white text-xs font-bold active:bg-white/30 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >+</button>
            </div>
          </div>
          <div className="text-lg font-bold opacity-40">-</div>
          <div className="flex-1 text-left">
            <div className="text-[11px] opacity-70 truncate flex items-center justify-start gap-1">
              <TeamAvatar
                src={opponentLogo}
                alt={`${currentGame.opponentName} logo`}
                name={currentGame.opponentName}
                sizeClass="w-3.5 h-3.5"
                className="border-white/30"
              />
              <span>{currentGame.opponentName}</span>
            </div>
            <div className="flex items-center justify-start gap-2">
              <button
                onClick={() => {
                  if (readOnly) return;
                  setAwayScore(s => Math.max(0, s - 1));
                }}
                disabled={readOnly}
                className={`w-5 h-5 rounded-full bg-white/20 text-white text-xs font-bold active:bg-white/30 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >−</button>
              <span className="text-[28px] font-black tabular-nums leading-none">{awayScore}</span>
              <button
                onClick={() => {
                  if (readOnly) return;
                  setAwayScore(s => s + 1);
                }}
                disabled={readOnly}
                className={`w-5 h-5 rounded-full bg-white/20 text-white text-xs font-bold active:bg-white/30 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Body: flex-col mobile, grid on landscape tablet */}
      <div className="game-body-wrapper flex flex-col flex-1 min-h-0" role="region" aria-label="Game field area">
      {/* Controls group - moves to sidebar on landscape tablet */}
      <div className="game-controls-group shrink-0" role="toolbar" aria-label="Game controls">
      {/* Controls */}
      <div className="px-1.5 py-0.5 bg-slate-950/95 border-y border-white/10 flex gap-1 shrink-0">
        {!readOnly && !gameOver && (
          <div className="flex gap-1 w-full">
            <button onClick={handlePause}
              className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg text-center ${isPaused ? 'bg-emerald-600 text-white active:bg-emerald-700' : 'bg-amber-500 text-white active:bg-amber-600'}`}>
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button onClick={() => setShowGoalPicker(true)}
              className="flex-1 bg-sky-600 text-white font-semibold py-1.5 rounded-lg active:bg-sky-700 text-[11px] text-center">
              ⚽ Goal
            </button>
            <button onClick={addGoalkeeperSave}
              className="flex-1 bg-indigo-600 text-white font-semibold py-1.5 rounded-lg active:bg-indigo-700 text-[11px] text-center">
              🧤 {totalSaves}
            </button>
            <button onClick={handleEndGame}
              className="flex-1 bg-rose-600 text-white font-semibold py-1.5 rounded-lg active:bg-rose-700 text-[11px] text-center">
              🏁 End
            </button>
          </div>
        )}
        {gameOver && (
          <button onClick={() => setShowMatchSummary(true)} className="btn-primary w-full text-sm">
            {readOnly ? 'View Summary' : '✅ View Summary & Finish'}
          </button>
        )}
        {readOnly && (
          <div className="w-full text-center text-[11px] text-slate-300 py-1">
            View-only mode — controls disabled
          </div>
        )}
      </div>
      {saveFeedback && (
        <div className="px-4 py-1 bg-amber-50 text-amber-700 text-xs font-medium">
          {saveFeedback}
        </div>
      )}
      {showResumeOptions && !gameOver && !readOnly && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 space-y-2">
          <p className="text-xs font-semibold text-blue-800">
            Game in progress found. Resume, end, or adjust the timer.
          </p>
          <input
            type="range"
            min={0}
            max={gameDurationSeconds}
            step={30}
            value={manualTimeSeconds}
            onChange={e => setManualTimeSeconds(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-[11px] text-blue-700">
            Current: {formatTime(elapsedSeconds)} · Selected: {formatTime(manualTimeSeconds)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleResumeNow} className="btn-primary text-xs py-2">Resume</button>
            <button onClick={applyManualTime} className="btn-secondary text-xs py-2">Set Time</button>
            <button onClick={handleEndGame} className="text-xs py-2 rounded-xl bg-red-500 text-white font-semibold">End Game</button>
          </div>
        </div>
      )}
      </div>{/* end game-controls-group */}

      {/* Soccer Field */}
      <div className="game-pitch-area px-1 py-0 flex-1 min-h-0 flex items-center justify-center">
        <div className="relative bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-800 rounded-xl overflow-hidden w-full max-w-[470px] md:max-w-[600px] max-h-full aspect-[68/105] border border-emerald-900/60 shadow-2xl touch-none">
          <div className="absolute bottom-2.5 left-2.5 z-[5] pointer-events-none">
            <div className="h-20 w-20 rounded-full bg-black/90 border border-white/25 shadow-xl flex flex-col items-center justify-center">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/75">Next Sub</span>
              <span className={`text-2xl font-black tabular-nums ${nextSubCountdownColor}`}>
                {hasNextBlock ? formatTime(nextBlockSecondsRemaining) : '--:--'}
              </span>
            </div>
          </div>
          <div className="absolute bottom-2.5 right-2.5 z-[5] pointer-events-none">
            <div className="min-w-[160px] max-w-[230px] rounded-xl bg-black/90 border border-white/20 px-2.5 py-2 text-[10px] text-white shadow-lg">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/75">Upcoming Subs</div>
              {hasNextBlock ? (
                nextSubs.length > 0 ? (
                  <div className="space-y-1.5">
                    {nextSubs.map(sub => (
                      <div key={`${sub.off || 'none'}-${sub.on}`} className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-red-400">{getPlayer(sub.off)?.name || '—'}</span>
                        <span className="shrink-0 text-slate-300 text-xs">→</span>
                        <span className="truncate font-semibold text-emerald-400">{getPlayer(sub.on)?.name || '—'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-semibold text-slate-300">No player changes scheduled</p>
                )
              ) : (
                <p className="font-semibold text-slate-300">Final block: no more subs</p>
              )}
            </div>
          </div>

          {/* Field markings */}
          <div className="absolute inset-0">
            {/* Center line */}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white/35" />
            {/* Center circle */}
            <div
              className="absolute left-1/2 top-1/2 border border-white/35 rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{
                width: `${PITCH_MARKINGS.centerCircleDiameterPct}%`,
                height: `${PITCH_MARKINGS.centerCircleDiameterPct}%`,
              }}
            />
            {/* Center dot */}
            <div className="absolute left-1/2 top-1/2 w-2 h-2 bg-white/40 rounded-full -translate-x-1 -translate-y-1" />
            {/* Top penalty area */}
            <div
              className="absolute top-0 border-b border-l border-r border-white/35"
              style={{
                left: `${(100 - PITCH_MARKINGS.penaltyAreaWidthPct) / 2}%`,
                width: `${PITCH_MARKINGS.penaltyAreaWidthPct}%`,
                height: `${PITCH_MARKINGS.penaltyAreaDepthPct}%`,
              }}
            />
            {/* Bottom penalty area */}
            <div
              className="absolute bottom-0 border-t border-l border-r border-white/35"
              style={{
                left: `${(100 - PITCH_MARKINGS.penaltyAreaWidthPct) / 2}%`,
                width: `${PITCH_MARKINGS.penaltyAreaWidthPct}%`,
                height: `${PITCH_MARKINGS.penaltyAreaDepthPct}%`,
              }}
            />
            {/* Top goal */}
            <div
              className="absolute top-0 border-b border-l border-r border-white/40"
              style={{
                left: `${(100 - PITCH_MARKINGS.goalAreaWidthPct) / 2}%`,
                width: `${PITCH_MARKINGS.goalAreaWidthPct}%`,
                height: `${PITCH_MARKINGS.goalAreaDepthPct}%`,
              }}
            />
            {/* Bottom goal */}
            <div
              className="absolute bottom-0 border-t border-l border-r border-white/40"
              style={{
                left: `${(100 - PITCH_MARKINGS.goalAreaWidthPct) / 2}%`,
                width: `${PITCH_MARKINGS.goalAreaWidthPct}%`,
                height: `${PITCH_MARKINGS.goalAreaDepthPct}%`,
              }}
            />
            {/* Penalty spots */}
            <div
              className="absolute left-1/2 w-1.5 h-1.5 bg-white/45 rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${PITCH_MARKINGS.penaltySpotDistancePct}%` }}
            />
            <div
              className="absolute left-1/2 w-1.5 h-1.5 bg-white/45 rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${100 - PITCH_MARKINGS.penaltySpotDistancePct}%` }}
            />
            {/* Outer border */}
            <div className="absolute inset-0 border border-white/35 rounded-xl" />

            {/* Position zone labels */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[15%] text-white/20 text-xs font-bold">ATK</div>
            <div className="absolute left-1/2 -translate-x-1/2 top-[42%] text-white/20 text-xs font-bold">MID</div>
            <div className="absolute left-1/2 -translate-x-1/2 top-[65%] text-white/20 text-xs font-bold">DEF</div>
            <div className="absolute left-1/2 -translate-x-1/2 top-[83%] text-white/20 text-xs font-bold">GK</div>
          </div>

          {/* Drop zones for positions */}
          {['GK', 'DEF', 'MID', 'ATK'].map(pos => {
            const yZones = { GK: '78%', DEF: '58%', MID: '38%', ATK: '14%' };
            return (
              <div
                key={pos}
                data-drop-zone={`position-${pos}-0`}
                className="absolute left-2 right-2 h-[22%] z-0"
                style={{ top: yZones[pos] }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDropOnPosition(pos, 0)}
              />
            );
          })}

          {/* Players on field */}
          {fieldAssignments.map((a) => {
            const player = getPlayer(a.playerId);
            const posIdx = getPositionIndex(a.playerId, a.position, fieldAssignments);
            const posCount = positionGroups[a.position]?.length || 1;

            // Spread players evenly across the width
            let xPct;
            if (posCount === 1) {
              xPct = 50;
            } else {
              xPct = getFormationSlotXPercent(a.position, posIdx, posCount);
            }

            const yPct = POSITION_Y_PERCENT[a.position] || 50;

            const timer = playerTimers[a.playerId];
            const timerSecs = timer?.totalSeconds || 0;
            const playerGoals = goalCounts[a.playerId] || 0;

            return (
              <div
                key={a.playerId}
                className="absolute z-10 flex flex-col items-center cursor-grab active:cursor-grabbing select-none"
                data-drop-player={a.playerId}
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                draggable={!readOnly}
                onDragStart={readOnly ? undefined : () => handleDragStart(a.playerId, 'field')}
                onDragEnd={readOnly ? undefined : () => setDraggedPlayer(null)}
                onDragOver={readOnly ? undefined : e => e.preventDefault()}
                onDrop={readOnly ? undefined : e => { e.preventDefault(); handleDropOnFieldPlayer(a.playerId); }}
                onTouchStart={readOnly ? undefined : (e) => handleTouchStart(e, a.playerId, 'field')}
              >
                <PlayerAvatar
                  player={player}
                  sizeClass="w-8 h-9 md:w-10 md:h-11"
                  variant="jersey"
                  className="shadow-lg"
                  textClassName="text-[10px] md:text-xs font-black"
                />
                <div className="bg-black/55 text-white text-[8px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 whitespace-nowrap max-w-[62px] md:max-w-[80px] truncate">
                  {player?.name?.split(' ')[0] || '?'}
                </div>
                <div className="text-[8px] md:text-[10px] text-white/85 font-mono bg-black/35 px-1 rounded">
                  {formatTime(timerSecs)}
                </div>
                {playerGoals > 0 && (
                  <div className="text-[10px] md:text-xs leading-none mt-0.5">
                    {Array.from({ length: Math.min(playerGoals, 5) }, () => '⚽').join('')}
                  </div>
                )}
              </div>
            );
          })}

          {/* Block indicator */}
          <div className="absolute top-2 right-3 bg-black/40 text-white text-[10px] font-bold px-2 py-1 rounded-full z-20">
            Block {blockIndex + 1}/{plan.length}
          </div>
        </div>
      </div>

      {/* Sub Bench */}
      <div className="game-bench-area px-1.5 pt-0 pb-0 shrink-0">
        <div
          className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-xl p-1 border border-slate-700/80 min-h-[42px]"
          data-drop-zone="bench"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleDropOnBench(); }}
        >
          {benchIds.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-0.5">
              <span className="text-[8px] tracking-[0.12em] text-slate-300 font-bold">SUB BENCH</span>
              <span className="rounded-full bg-slate-700 text-slate-100 px-1.5 py-0.5 text-[8px]">{benchIds.length}</span>
              <span className="text-[10px] text-slate-400">No substitutes available</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1 overflow-x-auto pb-0.5"
              tabIndex={0}
              role="region"
              aria-label="Substitutes bench"
            >
              <span className="shrink-0 text-[8px] tracking-[0.12em] text-slate-300 font-bold">SUB BENCH</span>
              <span className="shrink-0 rounded-full bg-slate-700 text-slate-100 px-1.5 py-0.5 text-[8px]">{benchIds.length}</span>
              {benchIds.map(id => {
                const player = getPlayer(id);
                const timer = playerTimers[id];
                const timerSecs = timer?.totalSeconds || 0;
                const playerGoals = goalCounts[id] || 0;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1 bg-slate-700/95 rounded-lg px-1.5 py-1 cursor-grab active:cursor-grabbing select-none border border-slate-600 min-w-max touch-none"
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : () => handleDragStart(id, 'bench')}
                    onDragEnd={readOnly ? undefined : () => setDraggedPlayer(null)}
                    onTouchStart={readOnly ? undefined : (e) => handleTouchStart(e, id, 'bench')}
                  >
                    <PlayerAvatar
                      player={player}
                      sizeClass="w-6 h-7 md:w-8 md:h-9"
                      variant="jersey"
                      isBench
                      className=""
                      textClassName="text-[10px] md:text-xs font-black"
                    />
                    <div>
                      <div className="text-white text-[10px] md:text-xs font-semibold leading-tight">{player?.name?.split(' ')[0] || '?'}</div>
                      <div className="text-slate-300 text-[8px] md:text-[10px] font-mono">{formatTime(timerSecs)}</div>
                    </div>
                    {playerGoals > 0 && (
                      <span className="text-[9px]">
                        {Array.from({ length: Math.min(playerGoals, 5) }, () => '⚽').join('')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>{/* end game-body-wrapper */}

      {/* Touch drag ghost */}
      {touchDragPlayer && touchPos && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{ left: touchPos.x - 20, top: touchPos.y - 20 }}
        >
          <PlayerAvatar
            player={getPlayer(touchDragPlayer.playerId)}
            sizeClass="w-10 h-10"
            className="bg-pitch-500 border-2 border-white text-white shadow-2xl opacity-80"
            textClassName="text-xs font-bold"
          />
        </div>
      )}

      {/* Goal Picker Modal */}
      {showGoalPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={() => setShowGoalPicker(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-1">⚽</div>
              <h3 className="text-xl font-black text-gray-900 dark:text-slate-100">Who scored?</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">{Math.floor(elapsedSeconds / 60)}&#39; minute</p>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {fieldAssignments.map(a => {
                const player = getPlayer(a.playerId);
                return (
                  <button
                    key={a.playerId}
                    onClick={() => addGoal(a.playerId)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-pitch-50 active:bg-pitch-100 transition-colors dark:bg-slate-900 dark:hover:bg-emerald-900/40"
                  >
                    <PlayerAvatar
                      player={player}
                      sizeClass="w-8 h-8"
                      className={posColor(a.position)}
                      textClassName="text-xs font-bold"
                    />
                    <span className="font-medium text-gray-900 dark:text-slate-100">{player?.name || '?'}</span>
                    <span className={`position-badge ${posLabelSmall(a.position)} ml-auto`}>{a.position}</span>
                  </button>
                );
              })}
              {benchIds.map(id => {
                const player = getPlayer(id);
                return (
                  <button
                    key={id}
                    onClick={() => addGoal(id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-pitch-50 active:bg-pitch-100 transition-colors dark:bg-slate-900 dark:hover:bg-emerald-900/40"
                  >
                    <PlayerAvatar
                      player={player}
                      sizeClass="w-8 h-8"
                      className="bg-gray-400 text-white dark:bg-slate-600"
                      textClassName="text-xs font-bold"
                    />
                    <span className="font-medium text-gray-900 dark:text-slate-100">{player?.name || '?'}</span>
                    <span className="position-badge pos-bench ml-auto">BENCH</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowGoalPicker(false)} className="btn-secondary w-full mt-3 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sub Alert Modal */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={subAlertType === 'due' ? undefined : dismissSubModal}>
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-1">🔄</div>
              <h3 className="text-xl font-black text-gray-900 dark:text-slate-100">
                {subAlertType === 'upcoming_2min' ? 'Sub in 2 Minutes' : subAlertType === 'upcoming' ? 'Sub Reminder — 1 Minute!' : 'Substitution Time!'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">Block {(pendingBlockIndex || 0) + 1} of {plan.length}</p>
            </div>
            {currentSubs.length > 0 ? (
              <ul className="space-y-3 mb-5">
                {currentSubs.map((sub, i) => (
                  <li key={i} className="bg-gray-50 rounded-xl p-3 dark:bg-slate-900">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-red-500 dark:text-red-300">
                        ↓ OFF: {getPlayer(sub.off)?.name || 'Unknown'}
                      </span>
                      {sub.offPosition && <span className={`position-badge ${posLabelSmall(sub.offPosition)}`}>{sub.offPosition}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-pitch-600 dark:text-emerald-300">
                        ↑ ON: {getPlayer(sub.on)?.name || 'Unknown'}
                      </span>
                      <span className={`position-badge ${posLabelSmall(sub.position)}`}>{sub.position}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center mb-5 py-3 bg-gray-50 rounded-xl dark:bg-slate-900">
                <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">No player changes for this block</p>
              </div>
            )}
            {subAlertType === 'due' ? (
              readOnly ? (
                <button onClick={dismissSubModal} className="btn-primary w-full">Close</button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={skipSubBlock} className="btn-secondary flex-1 text-sm">
                    Skip This Block
                  </button>
                  <button onClick={applySubsFromPlan} className="btn-primary flex-1 text-sm">
                    Done ✓
                  </button>
                </div>
              )
            ) : (
              <button onClick={dismissSubModal} className="btn-primary w-full">Got it! ✓</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
