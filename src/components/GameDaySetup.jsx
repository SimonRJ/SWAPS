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

  function posLabel(pos) {
    if (pos === 'GK') return 'GK';
    if (pos === 'DEF') return 'DEF';
    if (pos === 'MID') return 'MID';
    if (pos === 'ATK') return 'ATK';
    return pos;
  }

  function posTagColor(pos) {
    if (pos === 'GK') return 'bg-yellow-100 text-yellow-800';
    if (pos === 'DEF') return 'bg-blue-100 text-blue-800';
    if (pos === 'MID') return 'bg-purple-100 text-purple-800';
    if (pos === 'ATK') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-600';
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
    const roundInfo = scheduledRound;
    const numBlocks = gamePlan ? gamePlan.length : 0;

    const playerMinutes = {};
    if (gamePlan) {
      for (const player of selectedPlayers) {
        playerMinutes[player.id] = { field: 0, bench: 0, positions: {} };
      }
      for (let blockIndex = 0; blockIndex < numBlocks; blockIndex++) {
        const block = gamePlan[blockIndex];
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
    if (gamePlan && gamePlan.length > 1) {
      for (let blockIndex = 1; blockIndex < gamePlan.length; blockIndex++) {
        const changes = getSubsBetweenBlocks(gamePlan[blockIndex - 1], gamePlan[blockIndex]);
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
            <h2 className="text-lg font-bold text-gray-900">Round {nextRound} Team Sheet</h2>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${roundInfo?.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {roundInfo?.homeAway === 'AWAY' ? 'Away' : 'Home'}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Formation: {FORCED_FORMATION_STR} · {team.gameDuration} min game
          </p>
          <OpponentTeamInput
            team={opponentTeam}
            onTeamChange={setOpponentTeam}
            showLogoInput={false}
          />
          {absentPlayers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700 font-semibold">
                ⚠️ Away players: {absentPlayers.map(player => player.name).join(', ')}
              </p>
            </div>
          )}
        </div>

        {!gamePlan ? (
          <div className="card text-center py-6 space-y-3">
            <p className="text-gray-400 text-sm">Not enough active players to generate a team sheet. Need at least {minFieldCount}.</p>
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
              <div className="flex gap-3 mb-3">
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

            <div className="card">
              <h3 className="font-bold text-gray-900 mb-3">Estimated Minutes</h3>
              <div className="space-y-2">
                {selectedPlayers
                  .slice()
                  .sort((a, b) => (playerMinutes[b.id]?.field || 0) - (playerMinutes[a.id]?.field || 0))
                  .map(player => {
                    const mins = playerMinutes[player.id];
                    if (!mins) return null;
                    const posEntries = Object.entries(mins.positions || {}).filter(([, value]) => value > 0);
                    return (
                      <div key={player.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar player={player} sizeClass="w-6 h-6" className="bg-pitch-100 text-pitch-700" textClassName="text-[10px]" />
                          <span className="text-sm font-semibold text-gray-900">{player.name}</span>
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

  return null;
}
