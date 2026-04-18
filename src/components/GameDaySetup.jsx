import { useEffect, useState, useMemo } from 'react';
import {
  formatFormation,
} from '../utils/formations.js';
import {
  planGame,
  calculateAbsentPlayerMinutes,
  computeBenchStartCounts,
  getBenchProtectedIds,
  getSubsBetweenBlocks,
} from '../utils/subAlgorithm.js';
import { getNextUnresolvedRound } from '../utils/storage.js';
import OpponentTeamInput from './OpponentTeamInput.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

// Forced formation: 3-3-2 (3 DEF, 3 MID, 2 ATK + 1 GK)
const FORCED_FORMATION = [3, 3, 2];
const FORCED_FORMATION_STR = formatFormation(FORCED_FORMATION);

function formatRoundDateLabel(dateValue) {
  if (!dateValue) return 'Date not set';
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRoundTimeLabel(timeValue) {
  if (!timeValue) return 'Time not set';
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

// Steps: 'away_prompt' | 'select_away' | 'team_sheet'
export default function GameDaySetup({ data, onStartGame, onCancel, onUpdate, readOnly = false }) {
  const { team, players } = data;
  const activePlayers = players.filter(p => p.isActive);
  const minFieldCount = team.fieldPlayers + 1; // +1 for GK
  const gameHistory = data.gameHistory || [];
  const benchStartCounts = computeBenchStartCounts(gameHistory);
  const benchProtectedIds = getBenchProtectedIds(gameHistory);
  const nextRound = getNextUnresolvedRound(data);
  const scheduledRound = (data.seasonSchedule || []).find(item => Number(item.round) === Number(nextRound));

  const [step, setStep] = useState('away_prompt');
  const [awayPlayerIds, setAwayPlayerIds] = useState(() => new Set());
  const [opponentTeam, setOpponentTeam] = useState(() => ({
    name: scheduledRound?.opponentName || '',
    logoUrl: scheduledRound?.opponentLogoUrl || '',
    confirmed: false,
  }));
  const [preferredPlan, setPreferredPlan] = useState(null);
  const [showLineupEditor, setShowLineupEditor] = useState(false);
  const [lineupSelections, setLineupSelections] = useState({});
  const [lineupError, setLineupError] = useState('');

  // Computed: available and absent players based on away selections
  const selectedPlayers = useMemo(
    () => activePlayers.filter(p => !awayPlayerIds.has(p.id)),
    [activePlayers, awayPlayerIds],
  );
  const absentPlayers = useMemo(
    () => activePlayers.filter(p => awayPlayerIds.has(p.id)),
    [activePlayers, awayPlayerIds],
  );

  // Auto-generate the game plan from current away selections
  const gamePlan = useMemo(() => {
    if (selectedPlayers.length < minFieldCount) return null;
    return planGame(
      selectedPlayers,
      FORCED_FORMATION,
      team.gameDuration,
      team.rotateGK,
      activePlayers,
      team,
      team.fixedGKPlayerId || null,
      { benchStartCounts, benchProtectedIds },
    );
  }, [selectedPlayers, minFieldCount, team, activePlayers, benchStartCounts, benchProtectedIds]);

  const effectivePlan = preferredPlan || gamePlan;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  function toggleAwayPlayer(id) {
    setAwayPlayerIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPreferredPlan(null);
    setShowLineupEditor(false);
    setLineupSelections({});
    setLineupError('');
  }

  function handleConfirmAway() {
    const available = activePlayers.filter(p => !awayPlayerIds.has(p.id));
    if (available.length < minFieldCount) {
      alert(`Need at least ${minFieldCount} players (GK + ${team.fieldPlayers} outfield). Too many players marked as away.`);
      return;
    }
    const absentMinutes = calculateAbsentPlayerMinutes(absentPlayers, activePlayers, team);
    if (onUpdate && gamePlan) {
      onUpdate({
        ...data,
        pendingGameSetup: {
          roundNumber: nextRound,
          plan: gamePlan,
          absentPlayerIds: absentPlayers.map(p => p.id),
          absentMinutes,
        },
      });
    }
    setPreferredPlan(null);
    setShowLineupEditor(false);
    setLineupSelections({});
    setLineupError('');
    setStep('team_sheet');
  }

  function handleNoOneAway() {
    const noAwayPlan = planGame(
      activePlayers,
      FORCED_FORMATION,
      team.gameDuration,
      team.rotateGK,
      activePlayers,
      team,
      team.fixedGKPlayerId || null,
      { benchStartCounts, benchProtectedIds },
    );
    setAwayPlayerIds(new Set());
    if (onUpdate && noAwayPlan) {
      onUpdate({
        ...data,
        pendingGameSetup: {
          roundNumber: nextRound,
          plan: noAwayPlan,
          absentPlayerIds: [],
          absentMinutes: [],
        },
      });
    }
    setPreferredPlan(null);
    setShowLineupEditor(false);
    setLineupSelections({});
    setLineupError('');
    setStep('team_sheet');
  }

  function handleStart() {
    const planToUse = effectivePlan;
    if (!planToUse) {
      alert('Could not create game plan. Check player count.');
      return;
    }
    const absentMinutes = calculateAbsentPlayerMinutes(absentPlayers, activePlayers, team);
    const startingField = planToUse[0]?.onField || [];
    const startingBench = planToUse[0]?.onBench || [];
    onStartGame({
      availablePlayers: selectedPlayers.map(p => p.id),
      absentPlayers: absentPlayers.map(p => p.id),
      absentMinutes,
      formation: FORCED_FORMATION_STR,
      plan: planToUse,
      startingField,
      startingBench,
      gameNumber: nextRound,
      opponentName: opponentTeam.name.trim() || 'Opponent',
      opponentLogoUrl: opponentTeam.logoUrl || '',
    });
  }

  function clearPendingSetup() {
    if (!onUpdate || !data.pendingGameSetup) return;
    onUpdate({ ...data, pendingGameSetup: null });
    setPreferredPlan(null);
    setShowLineupEditor(false);
    setLineupSelections({});
    setLineupError('');
  }

  function posLabel(pos) {
    if (pos === 'GK') return 'GK';
    if (pos === 'DEF') return 'DEF';
    if (pos === 'MID') return 'MID';
    if (pos === 'ATK') return 'ATK';
    return pos;
  }

  function posTagColor(pos) {
    if (pos === 'GK') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
    if (pos === 'DEF') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    if (pos === 'MID') return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200';
    if (pos === 'ATK') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    return 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300';
  }

  function openLineupEditor() {
    if (!effectivePlan?.[0]) return;
    const selections = {};
    for (const assignment of effectivePlan[0].onField || []) {
      selections[assignment.playerId] = assignment.position;
    }
    for (const benchId of effectivePlan[0].onBench || []) {
      selections[benchId] = 'SUB';
    }
    setLineupSelections(selections);
    setLineupError('');
    setShowLineupEditor(true);
  }

  function cancelLineupEditor() {
    setShowLineupEditor(false);
    setLineupError('');
  }

  function confirmLineupEditor() {
    const requiredCounts = {
      GK: 1,
      DEF: FORCED_FORMATION[0],
      MID: FORCED_FORMATION[1],
      ATK: FORCED_FORMATION[2],
    };
    const counts = { GK: 0, DEF: 0, MID: 0, ATK: 0, SUB: 0 };
    for (const player of selectedPlayers) {
      const selection = lineupSelections[player.id];
      if (!selection) {
        setLineupError('Select a position for every available player.');
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(counts, selection)) {
        setLineupError('Use the position dropdowns to assign each player.');
        return;
      }
      counts[selection] += 1;
    }
    if (counts.GK !== requiredCounts.GK || counts.DEF !== requiredCounts.DEF || counts.MID !== requiredCounts.MID || counts.ATK !== requiredCounts.ATK) {
      setLineupError(`Need ${requiredCounts.GK} GK, ${requiredCounts.DEF} DEF, ${requiredCounts.MID} MID, ${requiredCounts.ATK} ATK.`);
      return;
    }
    const fixedGkAvailable = Boolean(team.fixedGKPlayerId && selectedPlayers.some(player => player.id === team.fixedGKPlayerId));
    if (!team.rotateGK && fixedGkAvailable && lineupSelections[team.fixedGKPlayerId] !== 'GK') {
      setLineupError('The fixed goalkeeper must be assigned as GK.');
      return;
    }

    const startingField = selectedPlayers
      .filter(player => lineupSelections[player.id] !== 'SUB')
      .map(player => ({ playerId: player.id, position: lineupSelections[player.id] }));
    const startingBench = selectedPlayers
      .filter(player => lineupSelections[player.id] === 'SUB')
      .map(player => player.id);

    const customPlan = planGame(
      selectedPlayers,
      FORCED_FORMATION,
      team.gameDuration,
      team.rotateGK,
      activePlayers,
      team,
      team.fixedGKPlayerId || null,
      { benchStartCounts, benchProtectedIds, startingField, startingBench },
    );
    if (!customPlan) {
      setLineupError('Unable to build a lineup with those selections.');
      return;
    }
    const absentMinutes = calculateAbsentPlayerMinutes(absentPlayers, activePlayers, team);
    if (onUpdate) {
      onUpdate({
        ...data,
        pendingGameSetup: {
          roundNumber: nextRound,
          plan: customPlan,
          absentPlayerIds: absentPlayers.map(player => player.id),
          absentMinutes,
        },
      });
    }
    setPreferredPlan(customPlan);
    setShowLineupEditor(false);
    setLineupError('');
  }

  if (readOnly) {
    return (
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto h-[calc(100dvh-var(--app-header-height)-var(--app-tabbar-height))] flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="card text-center py-8 space-y-3 w-full max-w-md">
            <div className="text-4xl">👀</div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">View-only mode</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Game setup is disabled for viewer accounts.
            </p>
          </div>
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button onClick={onCancel} className="btn-secondary w-full">Back</button>
        </div>
      </div>
    );
  }

  // --- Step: Is Anyone Away Today? ---
  if (step === 'away_prompt') {
    return (
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto h-[calc(100dvh-var(--app-header-height)-var(--app-tabbar-height))] flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="card text-center py-10 space-y-6 w-full max-w-md">
            <div className="text-6xl">📋</div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-slate-100">Game {nextRound}</h2>
            <p className="text-lg font-semibold text-gray-700 dark:text-slate-200">Is anyone away today?</p>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {activePlayers.length} active player{activePlayers.length !== 1 ? 's' : ''} · Formation 3-3-2
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {formatRoundDateTimeLabel(scheduledRound?.date, scheduledRound?.kickoffTime)}
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('select_away')} className="btn-secondary flex-1 text-lg py-4">
                Yes
              </button>
              <button onClick={handleNoOneAway} className="btn-primary flex-1 text-lg py-4">
                No
              </button>
            </div>
          </div>
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button onClick={onCancel} className="btn-secondary w-full">Cancel</button>
        </div>
      </div>
    );
  }

  // --- Step: Select Away Players ---
  if (step === 'select_away') {
    return (
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto h-[calc(100dvh-var(--app-header-height)-var(--app-tabbar-height))] flex flex-col overflow-hidden">
        <div className="px-4 pt-4 space-y-2 shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Select Away Players</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Tap players who are away today ({awayPlayerIds.size} selected as away)
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 pt-2">
          <div className="card">
            <ul className="divide-y divide-gray-100 dark:divide-slate-800 md:grid md:grid-cols-2 md:gap-x-4 md:divide-y-0">
              {activePlayers.map(p => (
                <li key={p.id}
                  onClick={() => toggleAwayPlayer(p.id)}
                  className="flex items-center gap-3 py-3 cursor-pointer">
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${awayPlayerIds.has(p.id) ? 'bg-red-500 border-red-500' : 'border-gray-300 dark:border-slate-600'}`}>
                    {awayPlayerIds.has(p.id) && <span className="text-white text-xs font-bold">✗</span>}
                  </div>
                  <PlayerAvatar
                    player={p}
                    sizeClass="w-8 h-8"
                    className={awayPlayerIds.has(p.id) ? 'bg-red-100 text-red-400 opacity-50 dark:bg-red-900/40 dark:text-red-300' : 'bg-pitch-100 text-pitch-700 dark:bg-emerald-900/40 dark:text-emerald-200'}
                    textClassName="text-sm"
                  />
                  <span className={`font-medium flex-1 ${awayPlayerIds.has(p.id) ? 'text-gray-400 dark:text-slate-500 line-through' : 'text-gray-900 dark:text-slate-100'}`}>
                    {p.name}
                  </span>
                  {awayPlayerIds.has(p.id) && (
                    <span className="text-xs text-red-500 font-semibold">Away</span>
                  )}
                </li>
              ))}
            </ul>
            {awayPlayerIds.size > 0 && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 dark:bg-amber-900/40 dark:border-amber-800">
                <p className="text-xs text-amber-700 font-semibold mb-1 dark:text-amber-300">
                  ⚠️ {awayPlayerIds.size} player{awayPlayerIds.size !== 1 ? 's' : ''} marked as away
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-200">
                  Absent players will have their scheduled minutes recorded as Sick/Injured to keep season tracking fair.
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white flex gap-3 dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => { clearPendingSetup(); setStep('away_prompt'); }} className="btn-secondary flex-1">
            ← Back
          </button>
          <button onClick={handleConfirmAway} className="btn-primary flex-1">
            Confirm
          </button>
        </div>
      </div>
    );
  }

  // --- Step: Team Sheet Display ---
  if (step === 'team_sheet') {
    const roundInfo = scheduledRound;
    const planForDisplay = effectivePlan;
    const numBlocks = planForDisplay ? planForDisplay.length : 0;

    const playerMinutes = {};
    if (planForDisplay) {
      for (const player of selectedPlayers) {
        playerMinutes[player.id] = { field: 0, bench: 0, positions: {} };
      }
      for (let blockIndex = 0; blockIndex < numBlocks; blockIndex++) {
        const block = planForDisplay[blockIndex];
        for (const { playerId, position } of block.onField) {
          if (!playerMinutes[playerId]) continue;
          playerMinutes[playerId].field += 10;
          playerMinutes[playerId].positions[position] = (playerMinutes[playerId].positions[position] || 0) + 10;
        }
        for (const benchId of block.onBench) {
          if (!playerMinutes[benchId]) continue;
          playerMinutes[benchId].bench += 10;
        }
      }
    }

    const subChanges = [];
    if (planForDisplay && planForDisplay.length > 1) {
      for (let blockIndex = 1; blockIndex < planForDisplay.length; blockIndex++) {
        const changes = getSubsBetweenBlocks(planForDisplay[blockIndex - 1], planForDisplay[blockIndex]);
        if (changes.length > 0) {
          subChanges.push({ minute: blockIndex * 10, subs: changes });
        }
      }
    }

    const getPlayer = (id) => selectedPlayers.find(player => player.id === id);

    return (
      <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Round {nextRound} Team Sheet</h2>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${roundInfo?.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {roundInfo?.homeAway === 'AWAY' ? 'Away' : 'Home'}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {formatRoundDateTimeLabel(roundInfo?.date, roundInfo?.kickoffTime)}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Formation: {FORCED_FORMATION_STR} · {team.gameDuration} min game
          </p>
          <OpponentTeamInput
            team={opponentTeam}
            onTeamChange={setOpponentTeam}
            showLogoInput={false}
          />
          {absentPlayers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 dark:bg-amber-900/40 dark:border-amber-800">
              <p className="text-xs text-amber-700 font-semibold dark:text-amber-300">
                ⚠️ Away players: {absentPlayers.map(player => player.name).join(', ')}
              </p>
            </div>
          )}
        </div>

        {showLineupEditor && (
          <div className="card border border-pitch-200 dark:border-emerald-800 bg-pitch-50/70 dark:bg-emerald-900/20 space-y-3">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Coach Preferred Lineup</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Assign each available player to GK, DEF, MID, ATK, or SUB.
              </p>
            </div>
            {lineupError && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-300">{lineupError}</p>
            )}
            <div className="space-y-2">
              {selectedPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayerAvatar
                      player={player}
                      sizeClass="w-7 h-7"
                      className="bg-pitch-100 text-pitch-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                      textClassName="text-xs"
                    />
                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{player.name}</span>
                  </div>
                  <select
                    className="input-field max-w-[9.5rem]"
                    value={lineupSelections[player.id] || ''}
                    onChange={(e) => setLineupSelections(current => ({ ...current, [player.id]: e.target.value }))}
                  >
                    <option value="">Select</option>
                    <option value="GK">Goalkeeper</option>
                    <option value="DEF">Defence</option>
                    <option value="MID">Midfield</option>
                    <option value="ATK">Attack</option>
                    <option value="SUB">Substitute</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={confirmLineupEditor} className="btn-primary flex-1">
                Confirm Lineup
              </button>
              <button onClick={cancelLineupEditor} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        )}

        {!planForDisplay ? (
          <div className="card text-center py-6 space-y-3">
            <p className="text-gray-400 text-sm dark:text-slate-500">Not enough active players to generate a team sheet. Need at least {minFieldCount}.</p>
            <button
              onClick={() => {
                clearPendingSetup();
                setStep(absentPlayers.length > 0 ? 'select_away' : 'away_prompt');
              }}
              className="btn-secondary w-full"
            >
              ← Back
            </button>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="grid grid-cols-1 gap-3 mb-3 sm:grid-cols-3">
                <button
                  onClick={() => {
                    clearPendingSetup();
                    setStep(absentPlayers.length > 0 ? 'select_away' : 'away_prompt');
                  }}
                  className="btn-secondary"
                >
                  ← Back
                </button>
                <button onClick={openLineupEditor} className="btn-secondary">
                  🧠 New Lineup
                </button>
                <button onClick={handleStart} className="btn-primary">
                  🟢 Start Game
                </button>
              </div>
              <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Starting Lineup</h3>
              <div className="space-y-2">
                {planForDisplay[0].onField.map(({ playerId, position }) => {
                  const player = getPlayer(playerId);
                  return (
                    <div key={playerId} className="flex items-center gap-3 py-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${posTagColor(position)}`}>{posLabel(position)}</span>
                      <PlayerAvatar player={player} sizeClass="w-7 h-7" className="bg-pitch-100 text-pitch-700 dark:bg-emerald-900/40 dark:text-emerald-200" textClassName="text-xs" />
                      <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{player?.name || '?'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {planForDisplay[0].onBench.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Starting on Bench</h3>
                <div className="space-y-2">
                  {planForDisplay[0].onBench.map(id => {
                    const player = getPlayer(id);
                    return (
                      <div key={id} className="flex items-center gap-3 py-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300">BENCH</span>
                        <PlayerAvatar player={player} sizeClass="w-7 h-7" className="bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300" textClassName="text-xs" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{player?.name || '?'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {subChanges.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Substitution Plan</h3>
                <div className="space-y-3">
                  {subChanges.map(({ minute, subs }) => (
                    <div key={minute} className="rounded-xl border border-gray-200 p-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-pitch-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{minute}&apos;</span>
                        <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">{subs.length} sub{subs.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-1.5">
                        {subs.map((sub, idx) => {
                          const offPlayer = getPlayer(sub.off);
                          const onPlayer = getPlayer(sub.on);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <span className="text-red-500 font-bold text-xs">↓</span>
                              <span className="text-gray-700 dark:text-slate-200">{offPlayer?.name || '?'}</span>
                              <span className="text-gray-400 dark:text-slate-500 text-xs">→</span>
                              <span className="text-emerald-600 font-bold text-xs">↑</span>
                              <span className="text-gray-700 dark:text-slate-200">{onPlayer?.name || '?'}</span>
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

            <div className="card">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Estimated Minutes</h3>
              <div className="space-y-2">
                {selectedPlayers
                  .slice()
                  .sort((a, b) => (playerMinutes[b.id]?.field || 0) - (playerMinutes[a.id]?.field || 0))
                  .map(player => {
                    const mins = playerMinutes[player.id];
                    if (!mins) return null;
                    const posEntries = Object.entries(mins.positions || {}).filter(([, value]) => value > 0);
                    return (
                      <div key={player.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar player={player} sizeClass="w-6 h-6" className="bg-pitch-100 text-pitch-700 dark:bg-emerald-900/40 dark:text-emerald-200" textClassName="text-[10px]" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{player.name}</span>
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
                            <span className="text-sm font-bold text-pitch-700 dark:text-emerald-200">{mins.field}&#39;</span>
                            {mins.bench > 0 && (
                              <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">({mins.bench}&#39; bench)</span>
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

  return null;
}
