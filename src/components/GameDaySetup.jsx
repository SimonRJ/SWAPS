import { useEffect, useState, useMemo } from 'react';
import {
  formatFormation,
  getFormationSlotXPercent,
  POSITION_Y_PERCENT,
} from '../utils/formations.js';
import { planGame, calculateAbsentPlayerMinutes, computeBenchStartCounts, getBenchProtectedIds } from '../utils/subAlgorithm.js';
import { getNextUnresolvedRound } from '../utils/storage.js';
import OpponentTeamInput from './OpponentTeamInput.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

// Forced formation: 3-3-2 (3 DEF, 3 MID, 2 ATK + 1 GK)
const FORCED_FORMATION = [3, 3, 2];
const FORCED_FORMATION_STR = formatFormation(FORCED_FORMATION);
const INITIAL_PLAY_TIME = '00:00';

const PITCH_MARKINGS = {
  penaltyAreaDepthPct: 15.7,
  penaltyAreaWidthPct: 59.3,
  goalAreaDepthPct: 5.2,
  goalAreaWidthPct: 26.9,
  centerCircleDiameterPct: 26.9,
  penaltySpotDistancePct: 10.5,
};

// Steps: 'away_prompt' | 'select_away' | 'team_sheet'
export default function GameDaySetup({ data, onStartGame, onCancel, onUpdate }) {
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  function toggleAwayPlayer(id) {
    setAwayPlayerIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
    setStep('team_sheet');
  }

  function handleStart() {
    if (!gamePlan) {
      alert('Could not create game plan. Check player count.');
      return;
    }
    const absentMinutes = calculateAbsentPlayerMinutes(absentPlayers, activePlayers, team);
    const startingField = gamePlan[0]?.onField || [];
    const startingBench = gamePlan[0]?.onBench || [];
    onStartGame({
      availablePlayers: selectedPlayers.map(p => p.id),
      absentPlayers: absentPlayers.map(p => p.id),
      absentMinutes,
      formation: FORCED_FORMATION_STR,
      plan: gamePlan,
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
  }

  // --- Step: Is Anyone Away Today? ---
  if (step === 'away_prompt') {
    return (
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto h-[calc(100dvh-var(--app-header-height)-var(--app-tabbar-height))] flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="card text-center py-10 space-y-6 w-full max-w-md">
            <div className="text-6xl">📋</div>
            <h2 className="text-2xl font-black text-gray-900">Game {nextRound}</h2>
            <p className="text-lg font-semibold text-gray-700">Is anyone away today?</p>
            <p className="text-sm text-gray-500">
              {activePlayers.length} active player{activePlayers.length !== 1 ? 's' : ''} · Formation 3-3-2
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
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white">
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
          <h2 className="text-xl font-bold text-gray-900">Select Away Players</h2>
          <p className="text-sm text-gray-500">
            Tap players who are away today ({awayPlayerIds.size} selected as away)
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 pt-2">
          <div className="card">
            <ul className="divide-y divide-gray-100 md:grid md:grid-cols-2 md:gap-x-4 md:divide-y-0">
              {activePlayers.map(p => (
                <li key={p.id}
                  onClick={() => toggleAwayPlayer(p.id)}
                  className="flex items-center gap-3 py-3 cursor-pointer">
                  <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${awayPlayerIds.has(p.id) ? 'bg-red-500 border-red-500' : 'border-gray-300'}`}>
                    {awayPlayerIds.has(p.id) && <span className="text-white text-xs font-bold">✗</span>}
                  </div>
                  <PlayerAvatar
                    player={p}
                    sizeClass="w-8 h-8"
                    className={awayPlayerIds.has(p.id) ? 'bg-red-100 text-red-400 opacity-50' : 'bg-pitch-100 text-pitch-700'}
                    textClassName="text-sm"
                  />
                  <span className={`font-medium flex-1 ${awayPlayerIds.has(p.id) ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {p.name}
                  </span>
                  {awayPlayerIds.has(p.id) && (
                    <span className="text-xs text-red-500 font-semibold">Away</span>
                  )}
                </li>
              ))}
            </ul>
            {awayPlayerIds.size > 0 && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700 font-semibold mb-1">
                  ⚠️ {awayPlayerIds.size} player{awayPlayerIds.size !== 1 ? 's' : ''} marked as away
                </p>
                <p className="text-xs text-amber-600">
                  Absent players will have their scheduled minutes recorded as Sick/Injured to keep season tracking fair.
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-white flex gap-3">
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
    const field = gamePlan?.[0]?.onField || [];
    const bench = gamePlan?.[0]?.onBench || [];
    const positionGroups = {};
    for (const assignment of field) {
      if (!positionGroups[assignment.position]) positionGroups[assignment.position] = [];
      positionGroups[assignment.position].push(assignment);
    }

    return (
      <div className="max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto game-timer-mobile-height px-1 pt-0 pb-0 overflow-hidden overscroll-none flex flex-col">
        <div className="px-2 py-1 shrink-0 rounded-lg bg-slate-900 text-white">
          <div className="flex items-center justify-between text-[11px] font-semibold opacity-80">
            <span>READY TO START</span>
            <span>GAME {nextRound} · 3-3-2</span>
          </div>
          <div className="flex items-center justify-center gap-3 mt-0.5">
            <span className="text-xs truncate max-w-[44%]">{team.name}</span>
            <span className="text-sm font-black">0 - 0</span>
            <span className="text-xs truncate max-w-[44%]">{opponentTeam.name || 'Opponent'}</span>
          </div>
        </div>
        <div className="shrink-0">
          <OpponentTeamInput
            team={opponentTeam}
            onTeamChange={setOpponentTeam}
            showLogoInput={false}
          />
        </div>
        {absentPlayers.length > 0 && (
          <div className="mx-1 mb-0.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 shrink-0">
            <p className="text-[10px] text-amber-700 font-semibold">
              ⚠️ {absentPlayers.length} away: {absentPlayers.map(p => p.name.split(' ')[0]).join(', ')}
            </p>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="px-1 py-0 flex-1 min-h-0 flex items-center justify-center">
            <div className="relative bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-800 rounded-xl overflow-hidden w-full max-w-[470px] md:max-w-[600px] max-h-full aspect-[68/105] border border-emerald-900/60 shadow-2xl touch-none">
              <div className="absolute inset-0">
                <div className="absolute left-0 right-0 top-1/2 h-px bg-white/35" />
                <div
                  className="absolute left-1/2 top-1/2 border border-white/35 rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{
                    width: `${PITCH_MARKINGS.centerCircleDiameterPct}%`,
                    height: `${PITCH_MARKINGS.centerCircleDiameterPct}%`,
                  }}
                />
                <div className="absolute left-1/2 top-1/2 w-2 h-2 bg-white/40 rounded-full -translate-x-1 -translate-y-1" />
                <div
                  className="absolute top-0 border-b border-l border-r border-white/35"
                  style={{
                    left: `${(100 - PITCH_MARKINGS.penaltyAreaWidthPct) / 2}%`,
                    width: `${PITCH_MARKINGS.penaltyAreaWidthPct}%`,
                    height: `${PITCH_MARKINGS.penaltyAreaDepthPct}%`,
                  }}
                />
                <div
                  className="absolute bottom-0 border-t border-l border-r border-white/35"
                  style={{
                    left: `${(100 - PITCH_MARKINGS.penaltyAreaWidthPct) / 2}%`,
                    width: `${PITCH_MARKINGS.penaltyAreaWidthPct}%`,
                    height: `${PITCH_MARKINGS.penaltyAreaDepthPct}%`,
                  }}
                />
                <div
                  className="absolute top-0 border-b border-l border-r border-white/40"
                  style={{
                    left: `${(100 - PITCH_MARKINGS.goalAreaWidthPct) / 2}%`,
                    width: `${PITCH_MARKINGS.goalAreaWidthPct}%`,
                    height: `${PITCH_MARKINGS.goalAreaDepthPct}%`,
                  }}
                />
                <div
                  className="absolute bottom-0 border-t border-l border-r border-white/40"
                  style={{
                    left: `${(100 - PITCH_MARKINGS.goalAreaWidthPct) / 2}%`,
                    width: `${PITCH_MARKINGS.goalAreaWidthPct}%`,
                    height: `${PITCH_MARKINGS.goalAreaDepthPct}%`,
                  }}
                />
                <div
                  className="absolute left-1/2 w-1.5 h-1.5 bg-white/45 rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{ top: `${PITCH_MARKINGS.penaltySpotDistancePct}%` }}
                />
                <div
                  className="absolute left-1/2 w-1.5 h-1.5 bg-white/45 rounded-full -translate-x-1/2 -translate-y-1/2"
                  style={{ top: `${100 - PITCH_MARKINGS.penaltySpotDistancePct}%` }}
                />
                <div className="absolute inset-0 border border-white/35 rounded-xl" />
                <div className="absolute left-1/2 -translate-x-1/2 top-[15%] text-white/20 text-xs font-bold">ATK</div>
                <div className="absolute left-1/2 -translate-x-1/2 top-[42%] text-white/20 text-xs font-bold">MID</div>
                <div className="absolute left-1/2 -translate-x-1/2 top-[65%] text-white/20 text-xs font-bold">DEF</div>
                <div className="absolute left-1/2 -translate-x-1/2 top-[83%] text-white/20 text-xs font-bold">GK</div>
              </div>
              {field.map((assignment) => {
                const player = selectedPlayers.find(p => p.id === assignment.playerId);
                const group = positionGroups[assignment.position] || [];
                const posIdx = group.findIndex(item => item.playerId === assignment.playerId);
                const posCount = group.length || 1;
                const xPct = posCount === 1 ? 50 : getFormationSlotXPercent(assignment.position, posIdx, posCount);
                const yPct = POSITION_Y_PERCENT[assignment.position] || 50;
                return (
                  <div
                    key={assignment.playerId}
                    className="absolute z-10 flex flex-col items-center select-none"
                    style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}
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
                      {INITIAL_PLAY_TIME}
                    </div>
                  </div>
                );
              })}
              <div className="absolute top-2 right-3 bg-black/40 text-white text-[10px] font-bold px-2 py-1 rounded-full z-20">
                Block 1/{gamePlan?.length || 1}
              </div>
            </div>
          </div>
          <div className="px-1.5 pt-0 pb-0 shrink-0">
            <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-xl p-1 border border-slate-700/80 min-h-[42px]">
              {bench.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-0.5">
                  <span className="text-[8px] tracking-[0.12em] text-slate-300 font-bold">SUB BENCH</span>
                  <span className="rounded-full bg-slate-700 text-slate-100 px-1.5 py-0.5 text-[8px]">{bench.length}</span>
                  <span className="text-[10px] text-slate-400">No substitutes today</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  <span className="shrink-0 text-[8px] tracking-[0.12em] text-slate-300 font-bold">SUB BENCH</span>
                  <span className="shrink-0 rounded-full bg-slate-700 text-slate-100 px-1.5 py-0.5 text-[8px]">{bench.length}</span>
                  {bench.map(id => {
                    const player = selectedPlayers.find(p => p.id === id);
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-1 bg-slate-700/95 rounded-lg px-1.5 py-1 select-none border border-slate-600 min-w-max touch-none"
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
                          <div className="text-slate-300 text-[8px] md:text-[10px] font-mono">{INITIAL_PLAY_TIME}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 shrink-0 pt-1 pb-1">
          <button
            onClick={() => {
              clearPendingSetup();
              setStep(absentPlayers.length > 0 ? 'select_away' : 'away_prompt');
            }}
            className="btn-secondary flex-1"
          >
            ← Back
          </button>
          <button onClick={handleStart} className="btn-primary flex-1">
            🟢 Start Game
          </button>
        </div>
      </div>
    );
  }

  return null;
}
