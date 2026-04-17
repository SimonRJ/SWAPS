import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AGE_CATEGORIES,
  FIXED_GAME_DURATION,
  buildSeasonSchedule,
  generateId,
  hashPasscode,
} from '../utils/storage.js';
import { normalizeShirtNumber } from '../utils/playerUtils.js';
import OpponentTeamInput from './OpponentTeamInput.jsx';
import LogoImageInput from './LogoImageInput.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

const EDIT_SECTIONS = [
  {
    id: 'schedule',
    title: 'Schedule',
    shortDescription: 'Rounds, dates, opponents',
  },
  {
    id: 'team-info',
    title: 'Team',
    shortDescription: 'Profile and GK settings',
  },
  {
    id: 'login-details',
    title: 'Login',
    shortDescription: 'Passcode and admin code',
  },
  {
    id: 'players',
    title: 'Players',
    shortDescription: 'Squad and shirt numbers',
  },
];

const SQUAD_PREVIEW_STATS_MIN_WIDTH = 'clamp(9rem, 32vw, 12rem)';

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
  return (players || []).map((player) => ({
    ...player,
    shirtNumber: normalizeShirtNumber(player.shirtNumber),
  }));
}

function formatRoundDateLabel(dateValue) {
  if (!dateValue) return 'No date selected';
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPlayedMinutes(player) {
  return (
    (player.minutesGK || 0) +
    (player.minutesDEF || 0) +
    (player.minutesMID || 0) +
    (player.minutesATK || 0)
  );
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
    ? game.playerMinuteDeltas.find((item) => item.playerId === playerId)
    : null;

  if (delta) return getPlayerDeltaMinutes(delta);

  const timer = game.playerTimers?.[playerId];
  return Math.round(getPositionMinuteTotal(timer?.positionSeconds) / 60);
}

function buildSquadPreviewStats(players, gameHistory) {
  const goalsByPlayer = {};
  const gamesByPlayer = {};

  for (const game of gameHistory || []) {
    for (const goal of game.goals || []) {
      if (!goal.playerId) continue;
      goalsByPlayer[goal.playerId] = (goalsByPlayer[goal.playerId] || 0) + 1;
    }

    for (const player of players || []) {
      if (getGameMinutesForPlayer(game, player.id) <= 0) continue;
      gamesByPlayer[player.id] = (gamesByPlayer[player.id] || 0) + 1;
    }
  }

  return Object.fromEntries(
    (players || []).map((player) => [
      player.id,
      {
        gamesPlayed: gamesByPlayer[player.id] || 0,
        minutesPlayed: getPlayedMinutes(player),
        goals: goalsByPlayer[player.id] || 0,
        saves: player.saves || 0,
      },
    ]),
  );
}

function SectionPill({ active, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[9rem] snap-start rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? 'border-pitch-500 bg-pitch-50 shadow-sm'
          : 'border-gray-200 bg-white'
      }`}
    >
      <p className={`text-sm font-semibold ${active ? 'text-pitch-700' : 'text-gray-900'}`}>
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-gray-500">{description}</p>
    </button>
  );
}

function StatusMessage({ error, status }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (status) return <p className="text-sm text-emerald-700">{status}</p>;
  return null;
}

function StickyActions({ onCancel, saving, savingLabel, idleLabel }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-gray-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? savingLabel : idleLabel}
        </button>
      </div>
    </div>
  );
}

export default function TeamTab({ data, onUpdate }) {
  const { team, players, gameHistory } = data;

  const [newName, setNewName] = useState('');
  const [newShirtNumber, setNewShirtNumber] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [activeSection, setActiveSection] = useState('schedule');
  const [teamForm, setTeamForm] = useState(() => normalizeTeamForm(team));
  const [scheduleForm, setScheduleForm] = useState(() =>
    buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule),
  );
  const [playerForm, setPlayerForm] = useState(() => normalizePlayersForm(players));
  const [newPasscode, setNewPasscode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('all');

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
    setScheduleFilter('all');

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
    if (!editingTeam) resetEditor();
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

    setPlayerForm((current) => [...current, player]);
    setPlayersStatus('');
    setPlayersError('');
    setNewName('');
    setNewShirtNumber('');
    setShowAddPlayer(false);
  }

  function removePlayer(id) {
    if (!window.confirm('Remove this player?')) return;
    setPlayerForm((current) => current.filter((player) => player.id !== id));
    setPlayersStatus('');
    setPlayersError('');
  }

  function toggleActive(id) {
    setPlayerForm((current) =>
      current.map((player) =>
        player.id === id ? { ...player, isActive: !player.isActive } : player,
      ),
    );
    setPlayersStatus('');
    setPlayersError('');
  }

  function updateShirtNumber(id, shirtNumberInput) {
    const shirtNumber = normalizeShirtNumber(shirtNumberInput);
    setPlayerForm((current) =>
      current.map((player) => (player.id === id ? { ...player, shirtNumber } : player)),
    );
    setPlayersStatus('');
    setPlayersError('');
  }

  function updateScheduleRound(round, updates) {
    setScheduleForm((current) =>
      current.map((item) => (item.round === round ? { ...item, ...updates } : item)),
    );
    setScheduleStatus('');
    setScheduleError('');
  }

  const scheduleCounts = useMemo(() => {
    const missingOpponent = scheduleForm.filter((round) => !(round.opponentName || '').trim()).length;
    const missingDate = scheduleForm.filter((round) => !round.date).length;
    const complete = scheduleForm.filter(
      (round) => (round.opponentName || '').trim() && round.date,
    ).length;

    return {
      total: scheduleForm.length,
      missingOpponent,
      missingDate,
      complete,
    };
  }, [scheduleForm]);

  const visibleScheduleRounds = useMemo(() => {
    if (scheduleFilter === 'attention') {
      return scheduleForm.filter(
        (round) => !(round.opponentName || '').trim() || !round.date,
      );
    }
    if (scheduleFilter === 'complete') {
      return scheduleForm.filter(
        (round) => (round.opponentName || '').trim() && round.date,
      );
    }
    return scheduleForm;
  }, [scheduleFilter, scheduleForm]);

  const squadPreviewStats = useMemo(
    () => buildSquadPreviewStats(players, gameHistory),
    [players, gameHistory],
  );

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

    const hasSelectedGoalkeeper = playerForm.some(
      (player) => player.id === teamForm.fixedGKPlayerId,
    );
    const fixedGKPlayerId =
      teamForm.rotateGK || !hasSelectedGoalkeeper ? '' : teamForm.fixedGKPlayerId;

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

      setTeamForm((current) => ({
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

      setTeamForm((current) => ({ ...current, gamesPerSeason }));
      setScheduleForm(nextSchedule);
      setScheduleStatus('Season schedule saved.');
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
      const updateResult = await onUpdate(
        {
          ...data,
          team: updatedTeam,
        },
        {
          adminCode: adminCode.trim(),
          optimistic: false,
        },
      );

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
    const hasSelectedGoalkeeper = normalizedPlayers.some(
      (player) => player.id === data.team.fixedGKPlayerId,
    );

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
        setTeamForm((current) => ({ ...current, fixedGKPlayerId: '' }));
      }

      setPlayerForm(normalizedPlayers);
      setPlayersStatus('Players saved.');
    } finally {
      setSavingPlayers(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-28 pt-4 md:max-w-3xl lg:max-w-4xl">
      {!editingTeam ? (
        <>
          <section className="card overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Team</h2>
                <p className="mt-1 text-sm text-gray-500">Overview and squad summary</p>
              </div>
              <button
                type="button"
                onClick={startEditing}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                Edit Team
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Team</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{team.name}</p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Team Code</p>
                <p className="mt-1 text-base font-semibold tracking-wide text-gray-900">
                  {team.teamId || 'N/A'}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Age Category</p>
                <p className="mt-1 text-base font-semibold text-gray-900">
                  {team.ageCategory || 'U10'}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Format</p>
                <p className="mt-1 text-base font-semibold text-gray-900">
                  {team.fieldPlayers} + GK
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Games This Season</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{team.gamesPerSeason}</p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Players</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{players.length}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Squad Preview
                </h3>
                <p className="mt-1 text-xs text-gray-500">{players.length} players</p>
              </div>
            </div>

            {players.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                No players yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {players.map((player) => {
                  const stats = squadPreviewStats[player.id] || {
                    gamesPlayed: 0,
                    minutesPlayed: 0,
                    goals: 0,
                    saves: 0,
                  };

                  return (
                    <li key={player.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border text-sm font-semibold ${
                            player.isActive
                              ? 'border-gray-200 bg-gray-50 text-gray-700'
                              : 'border-gray-200 bg-gray-100 text-gray-400'
                          }`}
                        >
                          {player.shirtNumber || '-'}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate font-medium ${
                              player.isActive
                                ? 'text-gray-900'
                                : 'text-gray-400 line-through'
                            }`}
                          >
                            {player.name}
                          </p>
                          {!player.isActive && (
                            <p className="mt-0.5 text-xs text-gray-400">Inactive</p>
                          )}

                          <div
                            className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-4 text-gray-500"
                            style={{ minWidth: SQUAD_PREVIEW_STATS_MIN_WIDTH }}
                          >
                            <span>{stats.gamesPlayed > 0 ? `Played ${stats.gamesPlayed}` : ' '}</span>
                            <span>{stats.minutesPlayed > 0 ? `Minutes ${stats.minutesPlayed}` : ' '}</span>
                            <span>{stats.goals > 0 ? `Goals ${stats.goals}` : ' '}</span>
                            <span>{stats.saves > 0 ? `Saves ${stats.saves}` : ' '}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Edit Team</h2>
              <p className="mt-1 text-sm text-gray-500">
                Update one section at a time. Designed for quick mobile editing.
              </p>
            </div>
            <button
              type="button"
              onClick={cancelEditing}
              className="btn-secondary !px-4 !py-2 text-sm"
            >
              Done
            </button>
          </div>

          <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1">
            <div className="flex snap-x gap-2">
              {EDIT_SECTIONS.map((section) => (
                <SectionPill
                  key={section.id}
                  active={activeSection === section.id}
                  title={section.title}
                  description={section.shortDescription}
                  onClick={() => setActiveSection(section.id)}
                />
              ))}
            </div>
          </div>

          {activeSection === 'team-info' && (
            <form onSubmit={saveTeamInfo} className="mt-4">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Club</label>
                  <div className="input-field cursor-default bg-gray-50 font-medium text-gray-700">
                    Murdoch University Melville FC
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Team Name</label>
                  <input
                    className="input-field"
                    value={teamForm.name}
                    onChange={(e) => {
                      setTeamForm((current) => ({ ...current, name: e.target.value }));
                      setTeamInfoStatus('');
                      setTeamInfoError('');
                    }}
                  />
                </div>

                <LogoImageInput
                  label="Team Logo (optional)"
                  value={teamForm.logoUrl || ''}
                  previewName={teamForm.name || 'Team'}
                  onChange={(logoUrl) => {
                    setTeamForm((current) => ({ ...current, logoUrl }));
                    setTeamInfoStatus('');
                    setTeamInfoError('');
                  }}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Age Category</label>
                    <select
                      className="input-field"
                      value={teamForm.ageCategory}
                      onChange={(e) => {
                        setTeamForm((current) => ({
                          ...current,
                          ageCategory: e.target.value,
                        }));
                        setTeamInfoStatus('');
                        setTeamInfoError('');
                      }}
                    >
                      {AGE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Field Players</label>
                    <select
                      className="input-field"
                      value={teamForm.fieldPlayers}
                      onChange={(e) => {
                        setTeamForm((current) => ({
                          ...current,
                          fieldPlayers: Number(e.target.value),
                        }));
                        setTeamInfoStatus('');
                        setTeamInfoError('');
                      }}
                    >
                      {fieldOptions.map((count) => (
                        <option key={count} value={count}>
                          {count} + GK
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setTeamForm((current) => ({
                          ...current,
                          rotateGK: !current.rotateGK,
                        }));
                        setTeamInfoStatus('');
                        setTeamInfoError('');
                      }}
                      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                        teamForm.rotateGK ? 'bg-pitch-500' : 'bg-gray-300'
                      }`}
                      aria-pressed={teamForm.rotateGK}
                    >
                      <span
                        className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          teamForm.rotateGK ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Rotate GK position</p>
                      <p className="text-xs text-gray-500">
                        Turn off to choose one primary goalkeeper
                      </p>
                    </div>
                  </div>
                </div>

                {!teamForm.rotateGK && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Primary Goalkeeper</label>
                    {playerForm.length === 0 ? (
                      <div className="input-field cursor-default bg-gray-50 font-medium text-gray-500">
                        Please add team players first
                      </div>
                    ) : (
                      <select
                        className="input-field"
                        value={teamForm.fixedGKPlayerId || ''}
                        onChange={(e) => {
                          setTeamForm((current) => ({
                            ...current,
                            fixedGKPlayerId: e.target.value,
                          }));
                          setTeamInfoStatus('');
                          setTeamInfoError('');
                        }}
                      >
                        <option value="">Select primary goalkeeper</option>
                        {playerForm.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                            {player.isActive ? '' : ' (Inactive)'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <StatusMessage error={teamInfoError} status={teamInfoStatus} />
              </div>

              <StickyActions
                onCancel={cancelEditing}
                saving={savingTeamInfo}
                savingLabel="Saving Team..."
                idleLabel="Save Team Info"
              />
            </form>
          )}

          {activeSection === 'schedule' && (
            <form onSubmit={saveSchedule} className="mt-4">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Rounds
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{scheduleCounts.total}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Complete
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{scheduleCounts.complete}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Need Opponent
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900">
                      {scheduleCounts.missingOpponent}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Need Date
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{scheduleCounts.missingDate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Games per Season
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={teamForm.gamesPerSeason}
                      onChange={(e) => {
                        setTeamForm((current) => ({
                          ...current,
                          gamesPerSeason: Number(e.target.value),
                        }));
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
                      onChange={(e) => setScheduleFilter(e.target.value)}
                    >
                      <option value="all">All rounds</option>
                      <option value="attention">Needs attention</option>
                      <option value="complete">Complete only</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {visibleScheduleRounds.length === 0 ? (
                    <p className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                      No rounds match this filter.
                    </p>
                  ) : (
                    visibleScheduleRounds.map((round) => (
                      <div
                        key={round.round}
                        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">Round {round.round}</p>
                          {round.date && (
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                              {formatRoundDateLabel(round.date)}
                            </span>
                          )}
                        </div>

                        <OpponentTeamInput
                          team={{
                            name: round.opponentName || '',
                            logoUrl: round.opponentLogoUrl || '',
                            confirmed:
                              round.opponentConfirmed ??
                              Boolean((round.opponentName || '').trim()),
                          }}
                          onTeamChange={(nextTeam) =>
                            updateScheduleRound(round.round, {
                              opponentName: nextTeam?.name || '',
                              opponentLogoUrl: nextTeam?.logoUrl || '',
                              opponentConfirmed: Boolean(nextTeam?.confirmed),
                            })
                          }
                        />

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                          <input
                            ref={(node) => {
                              if (node) dateInputRefs.current[round.round] = node;
                              else delete dateInputRefs.current[round.round];
                            }}
                            type="date"
                            value={round.date || ''}
                            onChange={(e) =>
                              updateScheduleRound(round.round, { date: e.target.value })
                            }
                            className="input-field"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            {formatRoundDateLabel(round.date)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <StatusMessage error={scheduleError} status={scheduleStatus} />
              </div>

              <StickyActions
                onCancel={cancelEditing}
                saving={savingSchedule}
                savingLabel="Saving Schedule..."
                idleLabel="Save Schedule"
              />
            </form>
          )}

          {activeSection === 'login-details' && (
            <form onSubmit={saveLoginDetails} className="mt-4">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Team Code
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {team.teamId || 'N/A'}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    New Team Passcode
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    value={newPasscode}
                    placeholder="Enter new passcode"
                    onChange={(e) => {
                      setNewPasscode(e.target.value);
                      setLoginStatus('');
                      setLoginError('');
                    }}
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Administrator Code
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    value={adminCode}
                    placeholder="Required for passcode change"
                    onChange={(e) => {
                      setAdminCode(e.target.value);
                      setLoginStatus('');
                      setLoginError('');
                    }}
                    autoComplete="off"
                  />
                </div>

                <StatusMessage error={loginError} status={loginStatus} />
              </div>

              <StickyActions
                onCancel={cancelEditing}
                saving={savingLoginDetails}
                savingLabel="Saving Login..."
                idleLabel="Save Login Details"
              />
            </form>
          )}

          {activeSection === 'players' && (
            <form onSubmit={savePlayers} className="mt-4">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      Squad ({playerForm.length})
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">Add, disable, or renumber players</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddPlayer((current) => !current)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-pitch-600 text-xl font-bold text-white shadow-sm"
                    aria-label={showAddPlayer ? 'Close add player form' : 'Add player'}
                  >
                    {showAddPlayer ? '×' : '+'}
                  </button>
                </div>

                {showAddPlayer && (
                  <div className="rounded-2xl border border-dashed border-pitch-300 bg-pitch-50/50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="input-field flex-1"
                        placeholder="Player name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <input
                          className="input-field w-20"
                          placeholder="#"
                          inputMode="numeric"
                          maxLength={2}
                          value={newShirtNumber}
                          onChange={(e) =>
                            setNewShirtNumber(normalizeShirtNumber(e.target.value))
                          }
                          aria-label="Shirt number"
                        />
                        <button
                          type="button"
                          className="btn-primary !px-4 !py-2"
                          onClick={addPlayer}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {playerForm.length === 0 ? (
                  <p className="rounded-2xl border border-gray-200 bg-gray-50 py-6 text-center text-sm text-gray-500">
                    No players yet. Add your squad.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {playerForm.map((player) => (
                      <li key={player.id} className="py-3">
                        <div className="flex items-start gap-3">
                          <PlayerAvatar
                            player={player}
                            sizeClass="h-9 w-9"
                            className={
                              player.isActive
                                ? 'bg-pitch-100 text-pitch-700'
                                : 'bg-gray-100 text-gray-400'
                            }
                            textClassName="text-sm"
                          />

                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate font-medium ${
                                player.isActive
                                  ? 'text-gray-900'
                                  : 'text-gray-400 line-through'
                              }`}
                            >
                              {player.name}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <input
                                className="input-field w-16 !px-2 !py-1 text-sm"
                                placeholder="#"
                                inputMode="numeric"
                                maxLength={2}
                                value={player.shirtNumber || ''}
                                onChange={(e) =>
                                  updateShirtNumber(player.id, e.target.value)
                                }
                                aria-label={`${player.name} shirt number`}
                              />

                              <button
                                type="button"
                                onClick={() => toggleActive(player.id)}
                                className={`rounded-full px-3 py-1 text-xs font-medium ${
                                  player.isActive
                                    ? 'bg-pitch-100 text-pitch-700'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {player.isActive ? 'Active' : 'Inactive'}
                              </button>

                              <button
                                type="button"
                                onClick={() => removePlayer(player.id)}
                                className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <StatusMessage error={playersError} status={playersStatus} />
              </div>

              <StickyActions
                onCancel={cancelEditing}
                saving={savingPlayers}
                savingLabel="Saving Players..."
                idleLabel="Save Players"
              />
            </form>
          )}
        </section>
      )}
    </div>
  );
}
