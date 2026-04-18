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
import TeamAvatar from './TeamAvatar.jsx';

const EDIT_SECTIONS = [
  {
    id: 'schedule',
    title: 'Season Schedule',
    description: 'Set rounds, opponents, dates, and venues.',
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

function normalizeScheduleForm(gamesPerSeason, seasonSchedule) {
  return buildSeasonSchedule(gamesPerSeason, seasonSchedule).map((round) => ({
    ...round,
    venue: round.venue || '',
    location: round.location || '',
    opponentName: round.opponentName || '',
    opponentLogoUrl: round.opponentLogoUrl || '',
    opponentConfirmed: round.opponentConfirmed ?? Boolean((round.opponentName || '').trim()),
  }));
}

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

function getVenueClasses(venue, expanded = false) {
  if (venue === 'away') {
    return expanded
      ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/40'
      : 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-900/30';
  }
  if (venue === 'home') {
    return expanded
      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/40'
      : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-900/30';
  }
  return expanded ? 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900' : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900';
}

function getVenueBadgeClasses(venue) {
  if (venue === 'away') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  if (venue === 'home') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200';
}

function getRoundStatus(round) {
  const hasOpponent = Boolean((round.opponentName || '').trim());
  const hasDate = Boolean(round.date);
  const hasVenue = Boolean(round.venue);
  const hasLocation = Boolean((round.location || '').trim());

  if (hasOpponent && hasDate && hasVenue && hasLocation) return 'Complete';
  if (hasOpponent || hasDate || hasVenue || hasLocation) return 'In progress';
  return 'Not set';
}

function ScheduleRoundTile({ round, isExpanded, onOpen, onClose, onChange }) {
  const venue = round.venue || '';
  const status = getRoundStatus(round);
  const opponentName = (round.opponentName || '').trim() || 'Opponent not set';
  const locationText = (round.location || '').trim() || 'Location not set';
  const dateLabel = formatRoundDateLabel(round.date);
  const dateInputId = `round-date-${round.round}`;
  const dateButtonText = round.date ? dateLabel : 'Date';
  const dateButtonAriaLabel = round.date ? `Select date: ${dateLabel}` : 'Select date';
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateInputRef = useRef(null);
  const handleOpenRound = () => {
    setShowDatePicker(false);
    onOpen();
  };
  const handleCloseRound = () => {
    setShowDatePicker(false);
    onClose();
  };

  useEffect(() => {
    if (!showDatePicker) return;
    const input = dateInputRef.current;
    input?.focus();
    input?.showPicker?.();
  }, [showDatePicker]);

  return (
    <div className={`rounded-2xl border shadow-sm transition ${getVenueClasses(venue, isExpanded)}`}>
      {!isExpanded ? (
        <button type="button" onClick={handleOpenRound} className="w-full p-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100">Round {round.round}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getVenueBadgeClasses(venue)}`}
                >
                  {venue ? venue.charAt(0).toUpperCase() + venue.slice(1) : 'Venue'}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <TeamAvatar
                  src={round.opponentLogoUrl || ''}
                  alt={`${opponentName} logo`}
                  name={opponentName}
                  sizeClass="w-11 h-11"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{opponentName}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{formatRoundDateLabel(round.date)}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-slate-300">
                <p>
                  <span className="font-semibold text-gray-700 dark:text-slate-200">Location:</span> {locationText}
                </p>
                <p>
                  <span className="font-semibold text-gray-700 dark:text-slate-200">Status:</span> {status}
                </p>
              </div>
            </div>

            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/80 dark:bg-slate-800/80 text-lg text-gray-500 dark:text-slate-400 shadow-sm">
              ›
            </div>
          </div>
        </button>
      ) : (
        <div className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-gray-900 dark:text-slate-100">Round {round.round}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getVenueBadgeClasses(venue)}`}
                >
                  {venue ? venue.charAt(0).toUpperCase() + venue.slice(1) : 'Venue'}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-slate-400">{dateLabel}</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Edit the details for this round.</p>
            </div>

            <button
              type="button"
              onClick={handleCloseRound}
              className="rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 shadow-sm"
            >
              Back
            </button>
          </div>

          <div className="space-y-4">
            <OpponentTeamInput
              label="Opponent Team"
              team={{
                name: round.opponentName || '',
                logoUrl: round.opponentLogoUrl || '',
                confirmed:
                  round.opponentConfirmed ?? Boolean((round.opponentName || '').trim()),
              }}
              showLogoInput={false}
              hidePreview
              compact
              logoInline
              onTeamChange={(nextTeam) =>
                onChange({
                  opponentName: nextTeam?.name || '',
                  opponentLogoUrl: nextTeam?.logoUrl || '',
                  opponentConfirmed: Boolean(nextTeam?.confirmed),
                })
              }
            />

            <LogoImageInput
              label="Opponent Logo Upload"
              helperText=""
              value={round.opponentLogoUrl || ''}
              previewName={round.opponentName || 'Opponent'}
              hidePreview
              compact
              onChange={(logoUrl) => onChange({ opponentLogoUrl: logoUrl })}
            />

            <div>
              <label htmlFor={dateInputId} className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Date of Match
              </label>
              {showDatePicker ? (
                <input
                  ref={dateInputRef}
                  id={dateInputId}
                  type="date"
                  value={round.date || ''}
                  onChange={(e) => {
                    onChange({ date: e.target.value });
                    setShowDatePicker(false);
                  }}
                  className="input-field max-w-[12rem]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  aria-label={dateButtonAriaLabel}
                  className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {dateButtonText}
                </button>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">Home or Away</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ venue: 'home' })}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    venue === 'home'
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200'
                  }`}
                >
                  Home
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ venue: 'away' })}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    venue === 'away'
                      ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                      : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200'
                  }`}
                >
                  Away
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Location</label>
              <input
                type="text"
                value={round.location || ''}
                onChange={(e) => onChange({ location: e.target.value })}
                placeholder="Enter field, oval, address, or venue"
                className="input-field"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleCloseRound} className="btn-secondary flex-1">
                Back
              </button>
              <button type="button" onClick={handleCloseRound} className="btn-primary flex-1">
                Save Round
              </button>
            </div>
          </div>
        </div>
      )}
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
    normalizeScheduleForm(team.gamesPerSeason, data.seasonSchedule),
  );
  const [playerForm, setPlayerForm] = useState(() => normalizePlayersForm(players));

  const [newPasscode, setNewPasscode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [expandedScheduleRound, setExpandedScheduleRound] = useState(null);

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
    setScheduleForm(normalizeScheduleForm(baseTeamForm.gamesPerSeason, data.seasonSchedule));
    setPlayerForm(normalizePlayersForm(players));
    setNewName('');
    setNewShirtNumber('');
    setShowAddPlayer(false);
    setNewPasscode('');
    setAdminCode('');
    setScheduleFilter('all');
    setExpandedScheduleRound(null);
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
    const missingOpponent = scheduleForm.filter(
      (round) => !(round.opponentName || '').trim(),
    ).length;

    const missingDate = scheduleForm.filter((round) => !round.date).length;

    const complete = scheduleForm.filter(
      (round) =>
        (round.opponentName || '').trim() &&
        round.date &&
        round.venue &&
        (round.location || '').trim(),
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
        (round) =>
          !(round.opponentName || '').trim() ||
          !round.date ||
          !round.venue ||
          !(round.location || '').trim(),
      );
    }

    if (scheduleFilter === 'complete') {
      return scheduleForm.filter(
        (round) =>
          (round.opponentName || '').trim() &&
          round.date &&
          round.venue &&
          (round.location || '').trim(),
      );
    }

    return scheduleForm;
  }, [scheduleFilter, scheduleForm]);

  const squadPreviewStats = useMemo(
    () => buildSquadPreviewStats(players, gameHistory),
    [players, gameHistory],
  );

  useEffect(() => {
    if (
      expandedScheduleRound &&
      !visibleScheduleRounds.some((round) => round.round === expandedScheduleRound)
    ) {
      setExpandedScheduleRound(null);
    }
  }, [expandedScheduleRound, visibleScheduleRounds]);

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
      setTeamInfoError('');
    } finally {
      setSavingTeamInfo(false);
    }
  }

  async function saveSchedule(e) {
    e.preventDefault();

    const gamesPerSeason = Math.max(1, Math.min(50, Number(teamForm.gamesPerSeason) || 1));
    const nextSchedule = normalizeScheduleForm(gamesPerSeason, scheduleForm);

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
      setExpandedScheduleRound(null);
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
      const updateResult = await onUpdate(
        {
          ...data,
          team: updatedTeam,
        },
        {
          adminCode: adminCode.trim(),
          passcode: newPasscode.trim(),
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
      setPlayersError('');
    } finally {
      setSavingPlayers(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-4 md:max-w-3xl lg:max-w-4xl">
      {!editingTeam ? (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Team</h2>
              <button
                type="button"
                onClick={startEditing}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                Team Edit
              </button>
            </div>

            <div className="space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-slate-400">Team</span>
                <span className="text-right font-semibold">{team.name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-slate-400">Team code</span>
                <span className="text-right font-semibold tracking-wide">
                  {team.teamId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-slate-400">Age category</span>
                <span className="text-right font-semibold">{team.ageCategory || 'U10'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-slate-400">Field players</span>
                <span className="text-right font-semibold">{team.fieldPlayers} + GK</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-slate-400">Games this season</span>
                <span className="text-right font-semibold">{team.gamesPerSeason}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-slate-400">Players</span>
                <span className="text-right font-semibold">{players.length}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Squad Preview
              </h3>
            </div>

            {players.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">No players yet.</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  <span className="flex-1" aria-hidden="true" />
                  <div
                    className="grid grid-cols-2 justify-items-center gap-x-3 text-center"
                    style={{ minWidth: SQUAD_PREVIEW_STATS_MIN_WIDTH }}
                  >
                    <span>Games Played</span>
                    <span>Goals</span>
                  </div>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                  {players.map((player) => {
                    const stats = squadPreviewStats[player.id] || {
                      gamesPlayed: 0,
                      minutesPlayed: 0,
                      goals: 0,
                      saves: 0,
                    };

                    return (
                      <li key={player.id} className="flex items-center gap-3 py-3 text-sm">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border text-sm font-semibold ${
                              player.isActive
                                ? 'border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-200'
                                : 'border-gray-200 dark:border-slate-800 bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                            }`}
                          >
                            {player.shirtNumber || '-'}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`truncate font-medium ${
                                  player.isActive
                                    ? 'text-gray-900 dark:text-slate-100'
                                    : 'text-gray-400 dark:text-slate-500 line-through'
                                }`}
                              >
                                {player.name}
                              </p>
                              {stats.saves > 0 && (
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 shrink-0">
                                  🧤 {stats.saves}
                                </span>
                              )}
                            </div>
                            {!player.isActive && (
                              <p className="text-xs text-gray-400 dark:text-slate-500">Inactive</p>
                            )}
                          </div>
                        </div>

                        <div
                          className="grid grid-cols-2 justify-items-center gap-x-3 text-[11px] leading-4 text-gray-600 dark:text-slate-300 font-semibold text-center"
                          style={{ minWidth: SQUAD_PREVIEW_STATS_MIN_WIDTH }}
                        >
                          <span className="tabular-nums w-full text-center">{stats.gamesPlayed}</span>
                          <span className="tabular-nums w-full text-center">{stats.goals}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Team Edit</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Choose a section, update details, and save that section only.
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EDIT_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  activeSection === section.id
                    ? 'border-pitch-500 bg-pitch-50 dark:bg-emerald-900/40'
                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-gray-300 dark:border-slate-600'
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    activeSection === section.id ? 'text-pitch-700 dark:text-emerald-200' : 'text-gray-900 dark:text-slate-100'
                  }`}
                >
                  {section.title}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{section.description}</p>
              </button>
            ))}
          </div>

          {activeSection === 'team-info' && (
            <form onSubmit={saveTeamInfo} className="space-y-3 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Club</label>
                <div className="input-field cursor-default bg-gray-50 dark:bg-slate-900 font-medium text-gray-700 dark:text-slate-200">
                  Murdoch University Melville FC
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Team Name</label>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Age Category
                  </label>
                  <select
                    className="input-field"
                    value={teamForm.ageCategory}
                    onChange={(e) => {
                      setTeamForm((current) => ({ ...current, ageCategory: e.target.value }));
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
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Field Players
                  </label>
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

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTeamForm((current) => ({ ...current, rotateGK: !current.rotateGK }));
                    setTeamInfoStatus('');
                    setTeamInfoError('');
                  }}
                  className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                    teamForm.rotateGK ? 'bg-pitch-500' : 'bg-gray-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${
                      teamForm.rotateGK ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700 dark:text-slate-200">Rotate GK position</span>
              </div>

              {!teamForm.rotateGK && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Primary Goalkeeper
                  </label>
                  {playerForm.length === 0 ? (
                    <div className="input-field cursor-default bg-gray-50 dark:bg-slate-900 font-medium text-gray-500 dark:text-slate-400">
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

              {teamInfoError && <p className="text-sm text-red-600 dark:text-red-300">{teamInfoError}</p>}
              {teamInfoStatus && <p className="text-sm text-emerald-700 dark:text-emerald-300">{teamInfoStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingTeamInfo}>
                {savingTeamInfo ? 'Saving Team Info...' : 'Save Team Info'}
              </button>
            </form>
          )}

          {activeSection === 'schedule' && (
            <form onSubmit={saveSchedule} className="space-y-4 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Season Schedule</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    Tap a round tile to open it and edit the details.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400">ROUNDS</p>
                  <p className="text-xl font-bold">{scheduleCounts.total}</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400">COMPLETE</p>
                  <p className="text-xl font-bold">{scheduleCounts.complete}</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400">NEED OPPONENT</p>
                  <p className="text-xl font-bold">{scheduleCounts.missingOpponent}</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-slate-400">NEED DATE</p>
                  <p className="text-xl font-bold">{scheduleCounts.missingDate}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
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
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Filter</label>
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
                  <p className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 px-3 py-2 text-sm text-gray-600 dark:text-slate-300">
                    No rounds match this filter.
                  </p>
                ) : (
                  visibleScheduleRounds.map((round) => (
                    <ScheduleRoundTile
                      key={round.round}
                      round={round}
                      isExpanded={expandedScheduleRound === round.round}
                      onOpen={() => setExpandedScheduleRound(round.round)}
                      onClose={() => setExpandedScheduleRound(null)}
                      onChange={(updates) => updateScheduleRound(round.round, updates)}
                    />
                  ))
                )}
              </div>

              {scheduleError && <p className="text-sm text-red-600 dark:text-red-300">{scheduleError}</p>}
              {scheduleStatus && <p className="text-sm text-emerald-700 dark:text-emerald-300">{scheduleStatus}</p>}

              <button type="submit" className="btn-primary w-full" disabled={savingSchedule}>
                {savingSchedule ? 'Saving Schedule...' : 'Save Schedule'}
              </button>
            </form>
          )}

          {activeSection === 'login-details' && (
            <form onSubmit={saveLoginDetails} className="space-y-3 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Team Code
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-slate-100">{team.teamId || 'N/A'}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
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
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
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

              {loginError && <p className="text-sm text-red-600 dark:text-red-300">{loginError}</p>}
              {loginStatus && <p className="text-sm text-emerald-700 dark:text-emerald-300">{loginStatus}</p>}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={savingLoginDetails}
              >
                {savingLoginDetails ? 'Saving Login Details...' : 'Save Login Details'}
              </button>
            </form>
          )}

          {activeSection === 'players' && (
            <form onSubmit={savePlayers} className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                  Squad ({playerForm.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddPlayer((current) => !current)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-pitch-600 text-xl font-bold text-white"
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
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="input-field w-20"
                    placeholder="#"
                    inputMode="numeric"
                    maxLength={2}
                    value={newShirtNumber}
                    onChange={(e) => setNewShirtNumber(normalizeShirtNumber(e.target.value))}
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
              )}

              {playerForm.length === 0 ? (
                <p className="py-3 text-center text-sm text-gray-500 dark:text-slate-400">
                  No players yet. Add your squad.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                    <span className="w-8" aria-hidden="true" />
                    <span className="flex-1">Player</span>
                    <span className="w-16 text-center">Shirt Number</span>
                    <span className="w-6" aria-hidden="true" />
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-slate-800 pb-20">
                    {playerForm.map((player) => (
                      <li key={player.id} className="flex items-center gap-3 py-3">
                        <PlayerAvatar
                          player={player}
                          sizeClass="w-8 h-8"
                          className={
                            player.isActive
                              ? 'bg-pitch-100 text-pitch-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                          }
                          textClassName="text-sm"
                        />
                        <span
                          className={`flex-1 font-medium ${
                            player.isActive
                              ? 'text-gray-900 dark:text-slate-100'
                              : 'text-gray-400 dark:text-slate-500 line-through'
                          }`}
                        >
                          {player.name}
                        </span>
                        <input
                          className="input-field w-16 !px-2 !py-1 text-sm text-center"
                          placeholder="#"
                          inputMode="numeric"
                          maxLength={2}
                          value={player.shirtNumber || ''}
                          onChange={(e) => updateShirtNumber(player.id, e.target.value)}
                          aria-label={`${player.name} shirt number`}
                        />
                        <button
                          type="button"
                          onClick={() => removePlayer(player.id)}
                          className="p-1 text-lg leading-none text-red-400 dark:text-red-300"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {playersError && <p className="text-sm text-red-600 dark:text-red-300">{playersError}</p>}
              {playersStatus && <p className="text-sm text-emerald-700 dark:text-emerald-300">{playersStatus}</p>}

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
