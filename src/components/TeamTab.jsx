import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AGE_CATEGORIES, FIXED_GAME_DURATION, buildSeasonSchedule, generateId, hashPasscode } from '../utils/storage.js';
import { normalizeShirtNumber } from '../utils/playerUtils.js';
import OpponentTeamInput from './OpponentTeamInput.jsx';
import LogoImageInput from './LogoImageInput.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

const EDIT_SECTIONS = [
  {
    id: 'schedule',
    title: 'Season Schedule',
    description: 'Set rounds, opponents, and dates.',
  },
  {
    id: 'team-info',
    title: 'Team Info',
    description: 'Update profile, formation settings, and goalkeeper mode.',
  },
  {
    id: 'login-details',
    title: 'Login Details',
    description: 'Change team passcode with administrator code.',
  },
  {
    id: 'players',
    title: 'Players',
    description: 'Manage squad list, shirt numbers, and player status.',
  },
];

const SCROLLABLE_EDITOR_MAX_HEIGHT = 'calc(100vh - var(--app-header-height) - var(--app-tabbar-height) - 2rem)';
const SQUAD_PREVIEW_STATS_MIN_WIDTH = 'clamp(11rem, 35vw, 14rem)';

function normalizeTeamForm(team) {
  return {
    ...team,
    clubId: team.clubId || '',
    logoUrl: team.logoUrl || '',
    ageCategory: team.ageCategory || 'U10',
    fixedGKPlayerId: team.fixedGKPlayerId ?? '',
    gameDuration: FIXED_GAME_DURATION,
  };
}

function normalizePlayersForm(players) {
  return (players || []).map(player => ({
    ...player,
    shirtNumber: normalizeShirtNumber(player.shirtNumber),
  }));
}

function formatRoundDateLabel(dateValue) {
  if (!dateValue) return 'date required';
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPlayedMinutes(player) {
  return (player.minutesGK || 0) + (player.minutesDEF || 0) + (player.minutesMID || 0) + (player.minutesATK || 0);
}

function getPositionMinuteTotal(values = {}) {
  return (values.GK || 0) + (values.DEF || 0) + (values.MID || 0) + (values.ATK || 0);
}

function getPlayerDeltaMinutes(delta) {
  return getPositionMinuteTotal({
    GK: delta?.minutesGK,
    DEF: delta?.minutesDEF,
    MID: delta?.minutesMID,
    ATK: delta?.minutesATK,
  });
}

function getGameMinutesForPlayer(game, playerId) {
  const delta = Array.isArray(game.playerMinuteDeltas)
    ? game.playerMinuteDeltas.find(item => item.playerId === playerId)
    : null;
  if (delta) {
    return getPlayerDeltaMinutes(delta);
  }

  const timer = game.playerTimers?.[playerId];
  return Math.round(getPositionMinuteTotal(timer?.positionSeconds) / 60);
}

function buildSquadPreviewStats(players, gameHistory) {
  const goalsByPlayer = {};
  const gamesByPlayer = {};

  for (const game of gameHistory || []) {
    for (const goal of (game.goals || [])) {
      if (!goal.playerId) continue;
      goalsByPlayer[goal.playerId] = (goalsByPlayer[goal.playerId] || 0) + 1;
    }

    for (const player of players || []) {
      if (getGameMinutesForPlayer(game, player.id) <= 0) continue;
      gamesByPlayer[player.id] = (gamesByPlayer[player.id] || 0) + 1;
    }
  }

  return Object.fromEntries((players || []).map(player => [
    player.id,
    {
      gamesPlayed: gamesByPlayer[player.id] || 0,
      minutesPlayed: getPlayedMinutes(player),
      goals: goalsByPlayer[player.id] || 0,
      saves: player.saves || 0,
    },
  ]));
}

export default function TeamTab({ data, onUpdate }) {
  const { team, players, gameHistory } = data;
  const [newName, setNewName] = useState('');
  const [newShirtNumber, setNewShirtNumber] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [activeSection, setActiveSection] = useState('schedule');
  const [teamForm, setTeamForm] = useState(() => normalizeTeamForm(team));
  const [scheduleForm, setScheduleForm] = useState(() => buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule));
  const [playerForm, setPlayerForm] = useState(() => normalizePlayersForm(players));
  const [newPasscode, setNewPasscode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [focusedRound, setFocusedRound] = useState(1);

  const [teamInfoError, setTeamInfoError] = useState('');
  const [teamInfoStatus, setTeamInfoStatus] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [playersError, setPlayersError] = useState('');
  const [playersStatus, setPlayersStatus] = useState('');

  const [savingTeamInfo, setSavingTeamInfo] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingLoginDetails, setSavingLoginDetails] = useState(false);
  const [savingPlayers, setSavingPlayers] = useState(false);
  const dateInputRefs = useRef({});

  const fieldOptions = [5, 6, 7, 8, 9, 10];

  const resetEditor = useCallback(() => {
    const baseTeamForm = normalizeTeamForm(team);
    setTeamForm(baseTeamForm);
    setScheduleForm(buildSeasonSchedule(baseTeamForm.gamesPerSeason, data.seasonSchedule));
    setPlayerForm(normalizePlayersForm(players));
    setNewName('');
    setNewShirtNumber('');
    setShowAddPlayer(false);
    setNewPasscode('');
    setAdminCode('');
    setTeamInfoError('');
    setTeamInfoStatus('');
    setScheduleError('');
    setScheduleStatus('');
    setLoginError('');
    setLoginStatus('');
    setPlayersError('');
    setPlayersStatus('');
  }, [team, data.seasonSchedule, players]);

  useEffect(() => {
    if (!editingTeam) {
      resetEditor();
    }
  }, [editingTeam, resetEditor]);

  function startEditing() {
    resetEditor();
    setActiveSection('schedule');
    setEditingTeam(true);
  }

  function cancelEditing() {
    setEditingTeam(false);
  }

  function addPlayer(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const player = {
      id: generateId(),
      name,
      shirtNumber: normalizeShirtNumber(newShirtNumber),
      minutesGK: 0,
      minutesDEF: 0,
      minutesMID: 0,
      minutesATK: 0,
      minutesSickInjured: 0,
      minutesBench: 0,
      saves: 0,
      isActive: true,
    };
    setPlayerForm(current => [...current, player]);
    setPlayersStatus('');
    setPlayersError('');
    setNewName('');
    setNewShirtNumber('');
    setShowAddPlayer(false);
  }

  function removePlayer(id) {
    if (!window.confirm('Remove this player?')) return;
    setPlayerForm(current => current.filter(player => player.id !== id));
    setPlayersStatus('');
    setPlayersError('');
  }

  function toggleActive(id) {
    setPlayerForm(current => current.map(player => (
      player.id === id ? { ...player, isActive: !player.isActive } : player
    )));
    setPlayersStatus('');
    setPlayersError('');
  }

  function updateShirtNumber(id, shirtNumberInput) {
    const shirtNumber = normalizeShirtNumber(shirtNumberInput);
    setPlayerForm(current => current.map(player => (
      player.id === id ? { ...player, shirtNumber } : player
    )));
    setPlayersStatus('');
    setPlayersError('');
  }

  function updateScheduleRound(round, updates) {
    setScheduleForm(current => current.map(item => (
      item.round === round ? { ...item, ...updates } : item
    )));
    setScheduleStatus('');
    setScheduleError('');
  }

  function openRoundDatePicker(round) {
    const input = dateInputRefs.current[round];
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.click();
  }

  const scheduleCounts = useMemo(() => {
    const missingOpponent = scheduleForm.filter(round => !(round.opponentName || '').trim()).length;
    const missingDate = scheduleForm.filter(round => !round.date).length;
    const complete = scheduleForm.filter(round => (round.opponentName || '').trim() && round.date).length;
    return {
      total: scheduleForm.length,
      missingOpponent,
      missingDate,
      complete,
    };
  }, [scheduleForm]);

  const visibleScheduleRounds = useMemo(() => {
    if (scheduleFilter === 'attention') {
      return scheduleForm.filter(round => !(round.opponentName || '').trim() || !round.date);
    }
    if (scheduleFilter === 'complete') {
      return scheduleForm.filter(round => (round.opponentName || '').trim() && round.date);
    }
    return scheduleForm;
  }, [scheduleFilter, scheduleForm]);

  const squadPreviewStats = useMemo(
    () => buildSquadPreviewStats(players, gameHistory),
    [players, gameHistory],
  );
  const isScrollableEditorSection = editingTeam && (activeSection === 'schedule' || activeSection === 'players');

  useEffect(() => {
    if (focusedRound > teamForm.gamesPerSeason) {
      setFocusedRound(teamForm.gamesPerSeason);
    }
    if (focusedRound < 1) {
      setFocusedRound(1);
    }
  }, [focusedRound, teamForm.gamesPerSeason]);

  async function saveTeamInfo(e) {
    e.preventDefault();
    const name = teamForm.name.trim();
    if (!name) {
      setTeamInfoError('Team name is required.');
      setTeamInfoStatus('');
      return;
    }

    setSavingTeamInfo(true);
    setTeamInfoError('');
    setTeamInfoStatus('');

    const hasSelectedGoalkeeper = playerForm.some(player => player.id === teamForm.fixedGKPlayerId);
    const fixedGKPlayerId = teamForm.rotateGK || !hasSelectedGoalkeeper ? '' : teamForm.fixedGKPlayerId;

    const updatedTeam = {
      ...data.team,
      name,
      clubId: teamForm.clubId || '',
      logoUrl: teamForm.logoUrl || '',
      ageCategory: teamForm.ageCategory,
      fieldPlayers: Number(teamForm.fieldPlayers) || data.team.fieldPlayers,
      rotateGK: Boolean(teamForm.rotateGK),
      fixedGKPlayerId,
      gameDuration: FIXED_GAME_DURATION,
    };
    delete updatedTeam.passcode;

    try {
      const updateResult = await onUpdate({
        ...data,
        team: updatedTeam,
      });
      if (updateResult?.ok === false) {
        setTeamInfoError(updateResult?.error?.message || 'Unable to save team info.');
        setTeamInfoStatus('');
        return;
      }

      setTeamForm(current => ({
        ...current,
        name: updatedTeam.name,
        clubId: updatedTeam.clubId,
        logoUrl: updatedTeam.logoUrl,
        ageCategory: updatedTeam.ageCategory,
        fieldPlayers: updatedTeam.fieldPlayers,
        rotateGK: updatedTeam.rotateGK,
        fixedGKPlayerId: updatedTeam.fixedGKPlayerId,
      }));
      setTeamInfoStatus('Team info saved.');
      setTeamInfoError('');
    } finally {
      setSavingTeamInfo(false);
    }
  }

  async function saveSchedule(e) {
    e.preventDefault();
    const gamesPerSeason = Math.max(1, Math.min(50, Number(teamForm.gamesPerSeason) || 1));
    const nextSchedule = buildSeasonSchedule(gamesPerSeason, scheduleForm);

    setSavingSchedule(true);
    setScheduleError('');
    setScheduleStatus('');

    const updatedTeam = {
      ...data.team,
      gamesPerSeason,
      gameDuration: FIXED_GAME_DURATION,
    };

    try {
      const updateResult = await onUpdate({
        ...data,
        team: updatedTeam,
        seasonSchedule: nextSchedule,
      });
      if (updateResult?.ok === false) {
        setScheduleError(updateResult?.error?.message || 'Unable to save season schedule.');
        setScheduleStatus('');
        return;
      }

      setTeamForm(current => ({ ...current, gamesPerSeason }));
      setScheduleForm(nextSchedule);
      setScheduleStatus('Season schedule saved.');
      setScheduleError('');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function saveLoginDetails(e) {
    e.preventDefault();
    if (!newPasscode.trim()) {
      setLoginError('Enter a new team passcode.');
      setLoginStatus('');
      return;
    }
    if (!adminCode.trim()) {
      setLoginError('Administrator code is required to change the team passcode.');
      setLoginStatus('');
      return;
    }

    setSavingLoginDetails(true);
    setLoginError('');
    setLoginStatus('');

    const updatedTeam = {
      ...data.team,
      passcodeHash: await hashPasscode(newPasscode.trim()),
      gameDuration: FIXED_GAME_DURATION,
    };
    delete updatedTeam.passcode;

    try {
      const updateResult = await onUpdate({
        ...data,
        team: updatedTeam,
      }, {
        adminCode: adminCode.trim(),
        optimistic: false,
      });

      if (updateResult?.ok === false) {
        const errorCode = updateResult?.error?.code;
        if (errorCode === 'ADMIN_CODE_REQUIRED') {
          setLoginError('Administrator code is required to change the team passcode.');
        } else if (errorCode === 'INVALID_ADMIN_CODE') {
          setLoginError('Administrator code is incorrect.');
        } else if (errorCode === 'ADMIN_CODE_NOT_CONFIGURED') {
          setLoginError('Administrator code has not been configured.');
        } else {
          setLoginError(updateResult?.error?.message || 'Unable to save login details.');
        }
        setLoginStatus('');
        return;
      }

      setNewPasscode('');
      setAdminCode('');
      setLoginStatus('Login details saved.');
      setLoginError('');
    } finally {
      setSavingLoginDetails(false);
    }
  }

  async function savePlayers(e) {
    e.preventDefault();
    setSavingPlayers(true);
    setPlayersError('');
    setPlayersStatus('');

    const normalizedPlayers = normalizePlayersForm(playerForm);
    const hasSelectedGoalkeeper = normalizedPlayers.some(player => player.id === data.team.fixedGKPlayerId);
    const updatedTeam = hasSelectedGoalkeeper
      ? data.team
      : { ...data.team, fixedGKPlayerId: '' };

    try {
      const updateResult = await onUpdate({
        ...data,
        team: updatedTeam,
        players: normalizedPlayers,
      });
      if (updateResult?.ok === false) {
        setPlayersError(updateResult?.error?.message || 'Unable to save players.');
        setPlayersStatus('');
        return;
      }

      if (!hasSelectedGoalkeeper) {
        setTeamForm(current => ({ ...current, fixedGKPlayerId: '' }));
      }
      setPlayerForm(normalizedPlayers);
      setPlayersStatus('Players saved.');
      setPlayersError('');
    } finally {
      setSavingPlayers(false);
    }
  }

  return (
    <div className="px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4 pb-24">
      {!editingTeam ? (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">Team</h2>
              <button type="button" onClick={startEditing} className="btn-primary !py-2 !px-4 text-sm">
                Team Edit
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Team</span>
                <span className="font-semibold text-right">{team.name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Team code</span>
                <span className="font-semibold tracking-wide text-right">{team.teamId || 'N/A'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Age category</span>
                <span className="font-semibold text-right">{team.ageCategory || 'U10'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Field players</span>
                <span className="font-semibold text-right">{team.fieldPlayers} + GK</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Games this season</span>
                <span className="font-semibold text-right">{team.gamesPerSeason}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Players</span>
                <span className="font-semibold text-right">{players.length}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Squad Preview</h3>
              <span className="text-xs font-medium text-gray-500">{players.length} players</span>
            </div>
            {players.length === 0 ? (
              <p className="text-sm text-gray-500">No players yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {players.map(player => {
                  const stats = squadPreviewStats[player.id] || {
                    gamesPlayed: 0,
                    minutesPlayed: 0,
                    goals: 0,
                    saves: 0,
                  };

                  return (
                    <li key={player.id} className="flex items-center gap-3 py-3 text-sm">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border text-sm font-semibold ${player.isActive
                          ? 'border-gray-200 bg-gray-50 text-gray-700'
                          : 'border-gray-200 bg-gray-100 text-gray-400'}`}
                        >
                          {player.shirtNumber || '-'}
                        </span>
                        <div className="min-w-0">
                          <p className={`truncate font-medium ${player.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                            {player.name}
                          </p>
                          {!player.isActive && (
                            <p className="text-xs text-gray-400">Inactive</p>
                          )}
                        </div>
                      </div>
                      <div
                        className="grid grid-cols-2 justify-items-end gap-x-3 gap-y-1 text-[11px] leading-4 text-gray-500"
                        style={{ minWidth: SQUAD_PREVIEW_STATS_MIN_WIDTH }}
                      >
                        <span aria-hidden={stats.gamesPlayed <= 0 || undefined}>{stats.gamesPlayed > 0 ? `Played ${stats.gamesPlayed}` : ''}</span>
                        <span aria-hidden={stats.minutesPlayed <= 0 || undefined}>{stats.minutesPlayed > 0 ? `Minutes ${stats.minutesPlayed}` : ''}</span>
                        <span aria-hidden={stats.goals <= 0 || undefined}>{stats.goals > 0 ? `Goals ${stats.goals}` : ''}</span>
                        <span aria-hidden={stats.saves <= 0 || undefined}>{stats.saves > 0 ? `Saves ${stats.saves}` : ''}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div
          className={`card ${isScrollableEditorSection
            ? 'flex min-h-0 flex-col gap-4 overflow-hidden'
            : 'space-y-4'} min-h-0`}
          style={isScrollableEditorSection ? { maxHeight: SCROLLABLE_EDITOR_MAX_HEIGHT } : undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Team Edit</h2>
              <p className="text-sm text-gray-500">Choose a section, update details, and save that section only.</p>
            </div>
            <button type="button" onClick={cancelEditing} className="btn-secondary !py-2 !px-4 text-sm">
              Done
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EDIT_SECTIONS.map(section => (
              <button
                key={section.id}
  type="button"
  onClick={() => setActiveSection(section.id)}
  className={`rounded-xl border p-3 text-left transition ${
    activeSection === section.id
      ? 'border-pitch-500 bg-pitch-50'
      : 'border-gray-300 bg-white hover:border-gray-300'
  }`}
>
  <p className={`text-sm font-semibold ${
    activeSection === section.id ? 'text-pitch-700' : 'text-gray-900'
  }`}>
    {section.title}
  </p>

  <p className="text-xs text-gray-500 mt-1">
    {section.description}
  </p>
              </button>
            ))}
          </div>

          {activeSection === 'team-info' && (
            <form onSubmit={saveTeamInfo} className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
                <div className="input-field bg-gray-50 text-gray-700 font-medium cursor-default">
                  Murdoch University Melville FC
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                <input
                  className="input-field"
                  value={teamForm.name}
                  onChange={e => {
                    setTeamForm(current => ({ ...current, name: e.target.value }));
                    setTeamInfoStatus('');
                    setTeamInfoError('');
                  }}
                />
              </div>

              <LogoImageInput
                label="Team Logo (optional)"
                value={teamForm.logoUrl || ''}
                previewName={teamForm.name || 'Team'}
                onChange={logoUrl => {
                  setTeamForm(current => ({ ...current, logoUrl }));
                  setTeamInfoStatus('');
                  setTeamInfoError('');
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age Category</label>
                  <select
                    className="input-field"
                    value={teamForm.ageCategory}
                    onChange={e => {
                      setTeamForm(current => ({ ...current, ageCategory: e.target.value }));
                      setTeamInfoStatus('');
                      setTeamInfoError('');
                    }}
                  >
                    {AGE_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Field Players</label>
                  <select
                    className="input-field"
                    value={teamForm.fieldPlayers}
                    onChange={e => {
                      setTeamForm(current => ({ ...current, fieldPlayers: Number(e.target.value) }));
                      setTeamInfoStatus('');
                      setTeamInfoError('');
                    }}
                  >
                    {fieldOptions.map(count => (
                      <option key={count} value={count}>{count} + GK</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTeamForm(current => ({ ...current, rotateGK: !current.rotateGK }));
                    setTeamInfoStatus('');
                    setTeamInfoError('');
                  }}
                  className={`w-12 h-7 rounded-full transition-colors ${teamForm.rotateGK ? 'bg-pitch-500' : 'bg-gray-300'} relative flex-shrink-0`}
                >
                  <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${teamForm.rotateGK ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-gray-700">Rotate GK position</span>
              </div>

              {!teamForm.rotateGK && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Goalkeeper</label>
                  {playerForm.length === 0 ? (
                    <div className="input-field bg-gray-50 text-gray-500 font-medium cursor-default">
                      Please add team players first
                    </div>
                  ) : (
                    <select
                      className="input-field"
                      value={teamForm.fixedGKPlayerId || ''}
                      onChange={e => {
                        setTeamForm(current => ({ ...current, fixedGKPlayerId: e.target.value }));
                        setTeamInfoStatus('');
                        setTeamInfoError('');
                      }}
                    >
                      <option value="">Select primary goalkeeper</option>
                      {playerForm.map(player => (
                        <option key={player.id} value={player.id}>
                          {player.name}{player.isActive ? '' : ' (Inactive)'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {teamInfoError && <p className="text-sm text-red-600">{teamInfoError}</p>}
              {teamInfoStatus && <p className="text-sm text-emerald-700">{teamInfoStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingTeamInfo}>
                {savingTeamInfo ? 'Saving Team Info...' : 'Save Team Info'}
              </button>
            </form>
          )}

          {activeSection === 'schedule' && (
            <div className="flex flex-1 min-h-0 flex-col gap-4 rounded-xl border border-gray-200 p-4 overflow-hidden">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500">ROUNDS</p>
                  <p className="text-xl font-bold">{scheduleCounts.total}</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500">COMPLETE</p>
                  <p className="text-xl font-bold">{scheduleCounts.complete}</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500">NEED OPPONENT</p>
                  <p className="text-xl font-bold">{scheduleCounts.missingOpponent}</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500">NEED DATE</p>
                  <p className="text-xl font-bold">{scheduleCounts.missingDate}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Games per Season</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={teamForm.gamesPerSeason}
                    onChange={e => {
                      setTeamForm(current => ({ ...current, gamesPerSeason: Number(e.target.value) }));
                      setScheduleStatus('');
                      setScheduleError('');
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Filter</label>
                  <select
                    className="input-field"
                    value={scheduleFilter}
                    onChange={e => setScheduleFilter(e.target.value)}
                  >
                    <option value="all">All rounds</option>
                    <option value="attention">Needs attention</option>
                    <option value="complete">Complete only</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1 pb-20"
                {visibleScheduleRounds.length === 0 ? (
                  <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    No rounds match this filter.
                  </p>
                ) : (
                  visibleScheduleRounds.map(round => (
                    <div key={round.round} className="space-y-3 rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">Round {round.round}</p>
                        <button
                          type="button"
                          className="text-xs font-medium text-pitch-700"
                          onClick={() => openRoundDatePicker(round.round)}
                        >
                          Pick date
                        </button>
                      </div>

                      <OpponentTeamInput
                        team={{
                          name: round.opponentName || '',
                          logoUrl: round.opponentLogoUrl || '',
                          confirmed: round.opponentConfirmed ?? Boolean((round.opponentName || '').trim()),
                        }}
                        onTeamChange={(nextTeam) => updateScheduleRound(round.round, {
                          opponentName: nextTeam?.name || '',
                          opponentLogoUrl: nextTeam?.logoUrl || '',
                          opponentConfirmed: Boolean(nextTeam?.confirmed),
                        })}
                      />

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                        <input
                          ref={node => {
                            if (node) {
                              dateInputRefs.current[round.round] = node;
                            } else {
                              delete dateInputRefs.current[round.round];
                            }
                          }}
                          type="date"
                          value={round.date || ''}
                          onChange={e => updateScheduleRound(round.round, { date: e.target.value })}
                          className="input-field"
                        />
                        <p className="mt-1 text-xs text-gray-500">{formatRoundDateLabel(round.date)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {scheduleError && <p className="text-sm text-red-600">{scheduleError}</p>}
              {scheduleStatus && <p className="text-sm text-emerald-700">{scheduleStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingSchedule}>
                {savingSchedule ? 'Saving Schedule...' : 'Save Schedule'}
              </button>
            </div>
          )}


          {activeSection === 'login-details' && (
            <form onSubmit={saveLoginDetails} className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team Code</p>
                <p className="text-sm font-semibold text-gray-800 mt-1">{team.teamId || 'N/A'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Team Passcode</label>
                <input
                  type="password"
                  className="input-field"
                  value={newPasscode}
                  placeholder="Enter new passcode"
                  onChange={e => {
                    setNewPasscode(e.target.value);
                    setLoginStatus('');
                    setLoginError('');
                  }}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Administrator Code</label>
                <input
                  type="password"
                  className="input-field"
                  value={adminCode}
                  placeholder="Required for passcode change"
                  onChange={e => {
                    setAdminCode(e.target.value);
                    setLoginStatus('');
                    setLoginError('');
                  }}
                  autoComplete="off"
                />
              </div>

              {loginError && <p className="text-sm text-red-600">{loginError}</p>}
              {loginStatus && <p className="text-sm text-emerald-700">{loginStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingLoginDetails}>
                {savingLoginDetails ? 'Saving Login Details...' : 'Save Login Details'}
              </button>
            </form>
          )}

          {activeSection === 'players' && (
            <form onSubmit={savePlayers} className="flex flex-1 min-h-0 flex-col space-y-3 overflow-hidden">

              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Squad ({playerForm.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddPlayer(current => !current)}
                  className="bg-pitch-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold"
                >
                  {showAddPlayer ? '×' : '+'}
                </button>
              </div>

              {showAddPlayer && (
                <div className="flex gap-2">
                  <input
                    className="input-field flex-1"
                    placeholder="Player name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="input-field w-20"
                    placeholder="#"
                    inputMode="numeric"
                    maxLength={2}
                    value={newShirtNumber}
                    onChange={e => setNewShirtNumber(normalizeShirtNumber(e.target.value))}
                    aria-label="Shirt number"
                  />
                  <button type="button" className="btn-primary !py-2 !px-4" onClick={addPlayer}>Add</button>
                </div>
              )}

              {playerForm.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-3">No players yet. Add your squad.</p>
              ) : (
<ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100 pb-20">

                  {playerForm.map(player => (
                    <li key={player.id} className="flex items-center gap-3 py-3">
                      <PlayerAvatar
                        player={player}
                        sizeClass="w-8 h-8"
                        className={player.isActive ? 'bg-pitch-100 text-pitch-700' : 'bg-gray-100 text-gray-400'}
                        textClassName="text-sm"
                      />
                      <span className={`flex-1 font-medium ${player.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                        {player.name}
                      </span>
                      <input
                        className="input-field w-16 !py-1 !px-2 text-sm"
                        placeholder="#"
                        inputMode="numeric"
                        maxLength={2}
                        value={player.shirtNumber || ''}
                        onChange={e => updateShirtNumber(player.id, e.target.value)}
                        aria-label={`${player.name} shirt number`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleActive(player.id)}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${player.isActive ? 'bg-pitch-100 text-pitch-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {player.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button type="button" onClick={() => removePlayer(player.id)} className="text-red-400 p-1 text-lg leading-none">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {playersError && <p className="text-sm text-red-600">{playersError}</p>}
              {playersStatus && <p className="text-sm text-emerald-700">{playersStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingPlayers}>
                {savingPlayers ? 'Saving Players...' : 'Save Players'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
