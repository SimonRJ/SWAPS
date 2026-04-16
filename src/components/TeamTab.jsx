import { useState } from 'react';
import { AGE_CATEGORIES, FIXED_GAME_DURATION, buildSeasonSchedule, generateId, hashPasscode } from '../utils/storage.js';
import { normalizeShirtNumber } from '../utils/playerUtils.js';
import OpponentTeamInput from './OpponentTeamInput.jsx';
import LogoImageInput from './LogoImageInput.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';

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

export default function TeamTab({ data, onUpdate }) {
  const { team, players } = data;
  const [newName, setNewName] = useState('');
  const [newShirtNumber, setNewShirtNumber] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamForm, setTeamForm] = useState(normalizeTeamForm(team));
  const [scheduleForm, setScheduleForm] = useState(() => buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule));
  const [newPasscode, setNewPasscode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [teamEditError, setTeamEditError] = useState('');
  const [showAddPlayer, setShowAddPlayer] = useState(false);

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
    onUpdate({ ...data, players: [...players, player] });
    setNewName('');
    setNewShirtNumber('');
    setShowAddPlayer(false);
  }

  function removePlayer(id) {
    if (!window.confirm('Remove this player?')) return;
    onUpdate({ ...data, players: players.filter(p => p.id !== id) });
  }

  function toggleActive(id) {
    onUpdate({
      ...data,
      players: players.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p),
    });
  }

  function updateShirtNumber(id, shirtNumberInput) {
    const shirtNumber = normalizeShirtNumber(shirtNumberInput);
    onUpdate({
      ...data,
      players: players.map(p => (
        p.id === id ? { ...p, shirtNumber } : p
      )),
    });
  }

  async function saveTeam(e) {
    e.preventDefault();
    setTeamEditError('');
    const wantsPasscodeChange = Boolean(newPasscode.trim());
    if (wantsPasscodeChange && !adminCode.trim()) {
      setTeamEditError('Administrator code is required to change the team passcode.');
      return;
    }

    let updatedTeam = { ...teamForm };
    const hasSelectedGoalkeeper = players.some(p => p.id === updatedTeam.fixedGKPlayerId);
    if (!hasSelectedGoalkeeper) {
      updatedTeam.fixedGKPlayerId = '';
    }
    if (wantsPasscodeChange) {
      updatedTeam.passcodeHash = await hashPasscode(newPasscode.trim());
    }
    // Remove any legacy clear-text passcode field
    delete updatedTeam.passcode;
    const updateResult = await onUpdate({
      ...data,
      team: updatedTeam,
      seasonSchedule: buildSeasonSchedule(updatedTeam.gamesPerSeason, scheduleForm),
    }, wantsPasscodeChange
      ? { adminCode: adminCode.trim(), optimistic: false }
      : undefined);
    if (updateResult?.ok === false) {
      const errorCode = updateResult?.error?.code;
      if (errorCode === 'ADMIN_CODE_REQUIRED') {
        setTeamEditError('Administrator code is required to change the team passcode.');
      } else if (errorCode === 'INVALID_ADMIN_CODE') {
        setTeamEditError('Administrator code is incorrect.');
      } else if (errorCode === 'ADMIN_CODE_NOT_CONFIGURED') {
        setTeamEditError('Administrator code has not been configured.');
      } else {
        setTeamEditError(updateResult?.error?.message || 'Unable to save team settings.');
      }
      return;
    }

    setNewPasscode('');
    setAdminCode('');
    setTeamEditError('');
    setEditingTeam(false);
  }

  function updateScheduleRound(round, updates) {
    setScheduleForm(current => current.map(item => (
      item.round === round ? { ...item, ...updates } : item
    )));
  }

  const fieldOptions = [5, 6, 7, 8, 9, 10];

  return (
    <div className="pb-24 px-4 pt-4 max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
      {/* Team Settings */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Team Settings</h2>
          {!editingTeam && (
            <button
              onClick={() => {
                const nextTeamForm = normalizeTeamForm(team);
                setTeamForm(nextTeamForm);
                setScheduleForm(buildSeasonSchedule(nextTeamForm.gamesPerSeason, data.seasonSchedule));
                setNewPasscode('');
                setAdminCode('');
                setTeamEditError('');
                setEditingTeam(true);
              }}
              className="text-pitch-600 text-sm font-semibold">
              Edit
            </button>
          )}
        </div>

        {editingTeam ? (
          <form onSubmit={saveTeam} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
              <div className="input-field bg-gray-50 text-gray-700 font-medium cursor-default">
                Murdoch University Melville FC
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
              <input className="input-field" value={teamForm.name}
                onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <LogoImageInput
              label="Team Logo (optional)"
              value={teamForm.logoUrl || ''}
              previewName={teamForm.name || 'Team'}
              onChange={logoUrl => setTeamForm(f => ({ ...f, logoUrl }))}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Change Team Passcode (Admin only)</label>
              <input type="password" className="input-field" value={newPasscode} placeholder="Enter new passcode"
                onChange={e => {
                  setNewPasscode(e.target.value);
                  setTeamEditError('');
                }} autoComplete="new-password" />
              <p className="mt-1 text-xs text-gray-500">Leave blank to keep current passcode.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Administrator Code</label>
              <input type="password" className="input-field" value={adminCode} placeholder="Required when changing passcode"
                onChange={e => {
                  setAdminCode(e.target.value);
                  setTeamEditError('');
                }} autoComplete="off" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Age Category</label>
                <select
                  className="input-field"
                  value={teamForm.ageCategory}
                  onChange={e => setTeamForm(f => ({ ...f, ageCategory: e.target.value }))}
                >
                  {AGE_CATEGORIES.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field Players</label>
                <select className="input-field" value={teamForm.fieldPlayers}
                  onChange={e => setTeamForm(f => ({ ...f, fieldPlayers: Number(e.target.value) }))}>
                  {fieldOptions.map(n => <option key={n} value={n}>{n} + GK</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Game Minutes</label>
                <div className="input-field bg-gray-50 text-gray-700 font-medium cursor-default">
                  {FIXED_GAME_DURATION} min
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Games per Season</label>
              <input type="number" className="input-field" min={1} max={50}
                value={teamForm.gamesPerSeason}
                onChange={e => {
                  const gamesPerSeason = Number(e.target.value);
                  setTeamForm(f => ({ ...f, gamesPerSeason }));
                  setScheduleForm(prev => buildSeasonSchedule(gamesPerSeason, prev));
                }} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Season Schedule</label>
              <p className="text-xs text-gray-500">
                Optional details for each round. Leave blank if unknown and update anytime.
              </p>
              <div className="space-y-2">
                {scheduleForm.map(game => (
                  <div key={game.round} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">Round {game.round}</p>
                      <div className="flex rounded-lg overflow-hidden border border-gray-200">
                        <button
                          type="button"
                          onClick={() => updateScheduleRound(game.round, { homeAway: 'HOME' })}
                          className={`px-3 py-1 text-xs font-semibold ${game.homeAway !== 'AWAY' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-600'}`}
                        >
                          Home
                        </button>
                        <button
                          type="button"
                          onClick={() => updateScheduleRound(game.round, { homeAway: 'AWAY' })}
                          className={`px-3 py-1 text-xs font-semibold ${game.homeAway === 'AWAY' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600'}`}
                        >
                          Away
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_9rem] gap-3 items-start">
                      <OpponentTeamInput
                        label="Opponent"
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
                      <div className="relative w-full">
                        <input
                          type="date"
                          className="input-field !py-2 !px-2.5 !text-sm !rounded-lg"
                          value={game.date}
                          onChange={e => updateScheduleRound(game.round, { date: e.target.value })}
                        />
                        {!game.date && (
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                            Date
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTeamForm(f => ({ ...f, rotateGK: !f.rotateGK }))}
                className={`w-12 h-7 rounded-full transition-colors ${teamForm.rotateGK ? 'bg-pitch-500' : 'bg-gray-300'} relative flex-shrink-0`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${teamForm.rotateGK ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700">Rotate GK position</span>
            </div>
            {!teamForm.rotateGK && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Goalkeeper</label>
                {players.length === 0 ? (
                  <div className="input-field bg-gray-50 text-gray-500 font-medium cursor-default">
                    Please add team players
                  </div>
                ) : (
                  <>
                    <select
                      className="input-field"
                      value={teamForm.fixedGKPlayerId || ''}
                      onChange={e => setTeamForm(f => ({ ...f, fixedGKPlayerId: e.target.value }))}
                    >
                      <option value="">Select primary goalkeeper</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.isActive ? '' : ' (Inactive)'}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      You can still move another player into goal during a game if needed.
                    </p>
                  </>
                )}
              </div>
            )}
            {teamEditError && (
              <p className="text-sm text-red-600">{teamEditError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1">Save</button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  setTeamEditError('');
                  setNewPasscode('');
                  setAdminCode('');
                  setEditingTeam(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500">Team</span>
              <span className="font-semibold">{team.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Team code</span>
              <span className="font-semibold tracking-wide">{team.teamId || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Age category</span>
              <span className="font-semibold">{team.ageCategory || 'U10'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Field players</span>
              <span className="font-semibold">{team.fieldPlayers} + GK</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Game duration</span>
              <span className="font-semibold">{team.gameDuration} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Season games</span>
              <span className="font-semibold">{team.gamesPerSeason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rotate GK</span>
              <span className="font-semibold">{team.rotateGK ? 'Yes' : 'No'}</span>
            </div>
            {!team.rotateGK && (
              <div className="flex justify-between">
                <span className="text-gray-500">Primary GK</span>
                <span className="font-semibold">
                  {players.find(p => p.id === team.fixedGKPlayerId)?.name || 'Auto (highest GK minutes)'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Players */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">
            Players <span className="text-pitch-600">({players.length})</span>
          </h2>
          <button onClick={() => setShowAddPlayer(s => !s)}
            className="bg-pitch-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold">
            {showAddPlayer ? '×' : '+'}
          </button>
        </div>

        {showAddPlayer && (
          <form onSubmit={addPlayer} className="flex gap-2 mb-4">
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
            <button type="submit" className="btn-primary px-4 py-2">Add</button>
          </form>
        )}

        {players.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">No players yet. Add your squad!</p>
        ) : (
          <ul className="divide-y divide-gray-100 md:grid md:grid-cols-2 md:gap-x-4 md:divide-y-0">
            {players.map(p => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <PlayerAvatar
                  player={p}
                  sizeClass="w-8 h-8"
                  className={p.isActive ? 'bg-pitch-100 text-pitch-700' : 'bg-gray-100 text-gray-400'}
                  textClassName="text-sm"
                />
                <span className={`flex-1 font-medium ${p.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {p.name}
                </span>
                <input
                  className="input-field w-16 !py-1 !px-2 text-sm"
                  placeholder="#"
                  inputMode="numeric"
                  maxLength={2}
                  value={p.shirtNumber || ''}
                  onChange={e => updateShirtNumber(p.id, e.target.value)}
                  aria-label={`${p.name} shirt number`}
                />
                <button onClick={() => toggleActive(p.id)}
                  className={`text-xs px-2 py-1 rounded-full font-medium ${p.isActive ? 'bg-pitch-100 text-pitch-700' : 'bg-gray-100 text-gray-500'}`}>
                  {p.isActive ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => removePlayer(p.id)}
                  className="text-red-400 p-1 text-lg leading-none">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
