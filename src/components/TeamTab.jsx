import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function TeamTab({ data, onUpdate }) {
  const { team, players } = data;
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

  function updateAllScheduleRounds(updater) {
    setScheduleForm(current => current.map((item, index) => updater(item, index)));
    setScheduleStatus('');
    setScheduleError('');
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
    <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4">
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
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Squad Preview</h3>
            {players.length === 0 ? (
              <p className="text-sm text-gray-500">No players yet.</p>
            ) : (
              <ul className="space-y-2">
                {players.slice(0, 6).map(player => (
                  <li key={player.id} className="flex items-center gap-2 text-sm">
                    <PlayerAvatar
                      player={player}
                      sizeClass="w-7 h-7"
                      className={player.isActive ? 'bg-pitch-100 text-pitch-700' : 'bg-gray-100 text-gray-400'}
                      textClassName="text-xs"
                    />
                    <span className={player.isActive ? 'text-gray-800 font-medium' : 'text-gray-400 line-through'}>
                      {player.name}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">{player.shirtNumber || '-'}</span>
                  </li>
                ))}
              </ul>
            )}
            {players.length > 6 && (
              <p className="mt-3 text-xs text-gray-500">+ {players.length - 6} more players</p>
            )}
          </div>
        </>
      ) : (
        <div className="card space-y-4">
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
                className={`rounded-xl border p-3 text-left transition ${activeSection === section.id
                  ? 'border-pitch-500 bg-pitch-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <p className={`text-sm font-semibold ${activeSection === section.id ? 'text-pitch-700' : 'text-gray-900'}`}>
                  {section.title}
                </p>
                <p className="text-xs text-gray-500 mt-1">{section.description}</p>
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
            <form onSubmit={saveSchedule} className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Rounds</p>
                    <p className="text-base font-semibold text-gray-900">{scheduleCounts.total}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Complete</p>
                    <p className="text-base font-semibold text-emerald-700">{scheduleCounts.complete}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Need Opponent</p>
                    <p className="text-base font-semibold text-amber-700">{scheduleCounts.missingOpponent}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Need Date</p>
                    <p className="text-base font-semibold text-blue-700">{scheduleCounts.missingDate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Games per Season</label>
                    <input
                      type="number"
                      className="input-field"
                      min={1}
                      max={50}
                      value={teamForm.gamesPerSeason}
                      onChange={e => {
                        const gamesPerSeason = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                        setTeamForm(current => ({ ...current, gamesPerSeason }));
                        setScheduleForm(current => buildSeasonSchedule(gamesPerSeason, current));
                        setFocusedRound(current => Math.max(1, Math.min(gamesPerSeason, current)));
                        setScheduleStatus('');
                        setScheduleError('');
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Filter Rounds</label>
                    <select
                      className="input-field"
                      value={scheduleFilter}
                      onChange={e => setScheduleFilter(e.target.value)}
                    >
                      <option value="all">All rounds</option>
                      <option value="attention">Needs setup</option>
                      <option value="complete">Complete only</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={() => updateAllScheduleRounds((item, index) => ({ ...item, homeAway: index % 2 === 0 ? 'HOME' : 'AWAY' }))}
                  >
                    Alternate Home/Away
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={() => updateAllScheduleRounds(item => ({ ...item, homeAway: 'HOME' }))}
                  >
                    Set All Home
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={() => updateAllScheduleRounds(item => ({ ...item, homeAway: 'AWAY' }))}
                  >
                    Set All Away
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={() => updateAllScheduleRounds(item => ({ ...item, date: '' }))}
                  >
                    Clear All Dates
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFocusedRound(current => Math.max(1, current - 1))}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Prev
                  </button>
                  <div className="flex-1">
                    <label className="sr-only" htmlFor="round-jump">Jump to round</label>
                    <select
                      id="round-jump"
                      className="input-field !py-2 !text-sm"
                      value={focusedRound}
                      onChange={e => setFocusedRound(Number(e.target.value))}
                    >
                      {scheduleForm.map(game => (
                        <option key={game.round} value={game.round}>Jump to Round {game.round}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFocusedRound(current => Math.min(teamForm.gamesPerSeason, current + 1))}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
                <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
                  {visibleScheduleRounds.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                      No rounds match this filter.
                    </div>
                  ) : visibleScheduleRounds.map(game => {
                    const hasOpponent = Boolean((game.opponentName || '').trim());
                    const isComplete = hasOpponent && Boolean(game.date);
                    const isFocused = focusedRound === game.round;
                    return (
                      <div
                        key={game.round}
                        className={`rounded-xl border p-3 space-y-3 transition ${isFocused
                          ? 'border-pitch-400 bg-pitch-50/40'
                          : 'border-gray-200 bg-white'}`
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Round {game.round}</p>
                            <p className={`text-xs font-medium ${isComplete ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {isComplete ? 'Ready for match day' : 'Needs setup'}
                            </p>
                          </div>
                          <div className="flex rounded-lg overflow-hidden border border-gray-200 bg-white">
                            <button
                              type="button"
                              onClick={() => updateScheduleRound(game.round, { homeAway: 'HOME' })}
                              className={`px-3 py-1 text-xs font-semibold ${game.homeAway !== 'AWAY' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-600'}`}
                            >
                              Home
                            </button>
                            <button
                              type="button"
                              onClick={() => updateScheduleRound(game.round, { homeAway: 'AWAY' })}
                              className={`px-3 py-1 text-xs font-semibold ${game.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
                            >
                              Away
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_11rem] gap-3 items-start">
                          <OpponentTeamInput
                            label="Opponent"
                            showLogoInput={false}
                            team={{
                              name: game.opponentName || '',
                              logoUrl: game.opponentLogoUrl || '',
                              confirmed: true,
                            }}
                            onTeamChange={next => updateScheduleRound(game.round, {
                              opponentName: next.name,
                              opponentLogoUrl: next.logoUrl || '',
                            })}
                          />
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                              type="date"
                              className="input-field !py-2 !px-2.5 !text-sm !rounded-lg"
                              value={game.date}
                              onChange={e => updateScheduleRound(game.round, { date: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                            onClick={() => updateScheduleRound(game.round, { opponentName: '', opponentLogoUrl: '', date: '' })}
                          >
                            Clear Round
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {scheduleError && <p className="text-sm text-red-600">{scheduleError}</p>}
              {scheduleStatus && <p className="text-sm text-emerald-700">{scheduleStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingSchedule}>
                {savingSchedule ? 'Saving Schedule...' : 'Save Season Schedule'}
              </button>
            </form>
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
            <form onSubmit={savePlayers} className="space-y-3 rounded-xl border border-gray-200 p-4">
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
                <ul className="divide-y divide-gray-100 max-h-[52vh] overflow-y-auto pr-1">
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
