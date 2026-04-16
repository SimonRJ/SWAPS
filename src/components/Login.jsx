import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDefaultData } from '../utils/storage.js';
import LogoImageInput from './LogoImageInput.jsx';
import TeamAvatar from './TeamAvatar.jsx';
import { FOOTBALL_WEST_CLUBS, getClubById } from '../utils/clubLogos.js';
import { createTeam, deleteTeamByAdmin, listTeamCodes, loginWithPasscode } from '../utils/netlifyData.js';
import wizardHero from '../assets/wizard-hero.svg';

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'create'
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [createTeamCode, setCreateTeamCode] = useState('');
  const [clubId, setClubId] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [autoClubLogoUrl, setAutoClubLogoUrl] = useState('');
  const [loginPasscode, setLoginPasscode] = useState('');
  const [createPasscode, setCreatePasscode] = useState('');
  const [teamCodes, setTeamCodes] = useState([]);
  const [loadingTeamCodes, setLoadingTeamCodes] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [deleteSucceeded, setDeleteSucceeded] = useState(false);

  const refreshTeamCodes = useCallback(async () => {
    setLoadingTeamCodes(true);
    try {
      const codes = await listTeamCodes();
      setTeamCodes(Array.isArray(codes) ? codes : []);
    } catch {
      setTeamCodes([]);
    } finally {
      setLoadingTeamCodes(false);
    }
  }, []);

  useEffect(() => {
    refreshTeamCodes();
  }, [refreshTeamCodes]);

  useEffect(() => {
    if (!deleteTeamId && teamId) {
      setDeleteTeamId(teamId);
    }
  }, [teamId, deleteTeamId]);

  const selectedClub = getClubById(clubId);
  const loginLogoUrl = teamLogoUrl || selectedClub?.logoUrl || '/favicon.svg';
  const loginLogoName = teamName || selectedClub?.name || 'Soccer Subs';
  const sortedTeamCodes = useMemo(() => [...teamCodes].sort((a, b) => a.localeCompare(b)), [teamCodes]);

  async function handleLogin(e) {
    e.preventDefault();
    const normalizedTeamId = normalizeTeamCode(teamId);
    if (!normalizedTeamId) {
      setError('Select your team code.');
      return;
    }
    if (!loginPasscode.trim()) {
      setError('Enter your team passcode.');
      return;
    }
    setLoading(true);
    setError('');
    setDeleteStatus('');
    setDeleteSucceeded(false);
    try {
      const response = await loginWithPasscode(normalizedTeamId, loginPasscode.trim());
      onLogin(response);
    } catch (loginError) {
      setError(loginError.message || 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const normalizedTeamCode = normalizeTeamCode(createTeamCode);
    const finalTeamName = (teamName || selectedClub?.name || '').trim();
    if (!finalTeamName) { setError('Enter a team name.'); return; }
    if (!normalizedTeamCode) { setError('Create a team code.'); return; }
    if (normalizedTeamCode.length < 3) { setError('Team code must be at least 3 characters.'); return; }
    if (!createPasscode.trim()) { setError('Enter a passcode.'); return; }
    setLoading(true);
    setError('');
    setDeleteStatus('');
    setDeleteSucceeded(false);
    try {
      const baseData = await getDefaultData({
        name: finalTeamName,
        clubId: selectedClub?.id || '',
        logoUrl: teamLogoUrl || selectedClub?.logoUrl || '',
      }, createPasscode.trim());
      const created = await createTeam({
        teamId: normalizedTeamCode,
        data: {
          ...baseData,
          team: {
            ...baseData.team,
            teamId: normalizedTeamCode,
          },
        },
      });
      setTeamCodes(prev => {
        const next = new Set(prev);
        next.add(normalizedTeamCode);
        return Array.from(next);
      });
      setTeamId(normalizedTeamCode);
      setDeleteTeamId(normalizedTeamCode);
      onLogin(created);
    } catch (createError) {
      if (createError?.code === 'TEAM_EXISTS') {
        setError('Team code already exists. Choose another code.');
      } else {
        setError(createError.message || 'Unable to create team.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTeam(e) {
    e.preventDefault();
    const normalizedTeamId = normalizeTeamCode(deleteTeamId);
    if (!normalizedTeamId) {
      setDeleteStatus('Select a team code to delete.');
      setDeleteSucceeded(false);
      return;
    }
    if (!deletePassword.trim()) {
      setDeleteStatus('Enter the administrator password.');
      setDeleteSucceeded(false);
      return;
    }
    if (!window.confirm(`Delete team "${normalizedTeamId}"? This cannot be undone.`)) return;
    setDeleteLoading(true);
    setDeleteStatus('');
    setError('');
    setDeleteSucceeded(false);
    try {
      await deleteTeamByAdmin(normalizedTeamId, deletePassword.trim());
      await refreshTeamCodes();
      setDeleteStatus(`Team ${normalizedTeamId} was deleted.`);
      setDeleteSucceeded(true);
      setDeletePassword('');
      if (teamId === normalizedTeamId) {
        setTeamId('');
      }
      if (createTeamCode === normalizedTeamId) {
        setCreateTeamCode('');
      }
      setDeleteTeamId('');
    } catch (deleteError) {
      setDeleteStatus(deleteError.message || 'Unable to delete team.');
      setDeleteSucceeded(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,_#1b5e20_0%,_#12281f_48%,_#0b1016_100%)] flex items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-6xl grid gap-4 sm:gap-6 lg:grid-cols-[1.1fr_1fr] items-center">
        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-4 sm:p-6 text-white shadow-2xl">
          <img
            src={wizardHero}
            alt="AI-generated 3D wizard with a soccer ball"
            className="w-full rounded-2xl border border-white/20 shadow-2xl"
          />
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pitch-100 font-semibold">
            AI 3D Hero Artwork
          </p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-black leading-tight">
            Welcome to SWAPS
          </h1>
          <p className="mt-2 text-sm sm:text-base text-pitch-50/90">
            Build your team, manage substitutions, and stay game-ready from kickoff to final whistle.
          </p>
        </div>
        <div className="w-full max-w-xl mx-auto bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-5 sm:p-8 border border-white/40">
          <div className="mb-5 flex items-center justify-center">
            <TeamAvatar
              src={loginLogoUrl}
              alt={`${loginLogoName} logo`}
              name={loginLogoName}
              sizeClass="w-24 h-24 sm:w-32 sm:h-32"
              className="shadow-lg ring-4 ring-pitch-100"
            />
          </div>
          <div className="mb-6">
            <p className="text-sm font-semibold text-pitch-700 uppercase tracking-[0.15em]">Team Access</p>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Log in or create your team</h2>
          </div>

          <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-pitch-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => { setMode('login'); setError(''); setDeleteStatus(''); setDeleteSucceeded(false); }}
            >Log In</button>
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'create' ? 'bg-pitch-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => { setMode('create'); setError(''); setDeleteStatus(''); setDeleteSucceeded(false); }}
            >Create Team</button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Code</label>
                <select
                  className="input-field uppercase"
                  value={teamId}
                  onChange={e => {
                    const value = normalizeTeamCode(e.target.value);
                    setTeamId(value);
                    setDeleteTeamId(value);
                  }}
                  disabled={loadingTeamCodes}
                >
                  <option value="">
                    {loadingTeamCodes ? 'Loading team codes...' : 'Select your team code'}
                  </option>
                  {sortedTeamCodes.map(code => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                {!loadingTeamCodes && sortedTeamCodes.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">No teams found yet. Create a new team first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Passcode</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter passcode"
                  value={loginPasscode}
                  onChange={e => setLoginPasscode(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Checking...' : 'Log In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
                <select
                  className="input-field"
                  value={clubId}
                  onChange={e => {
                    const nextId = e.target.value;
                    const nextClub = getClubById(nextId);
                    const nextClubLogoUrl = nextClub?.logoUrl || '';
                    setClubId(nextId);
                    if (nextClub) {
                      setTeamName(nextClub.name);
                      if (!teamLogoUrl || teamLogoUrl === autoClubLogoUrl) {
                        setTeamLogoUrl(nextClubLogoUrl);
                      }
                    }
                    setAutoClubLogoUrl(nextClubLogoUrl);
                  }}
                >
                  <option value="">Select a Football West club (optional)</option>
                  {FOOTBALL_WEST_CLUBS.map(club => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Select a club above or enter a custom team name"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Create Team Code</label>
                <input
                  type="text"
                  className="input-field uppercase"
                  placeholder="Example: RANGERS-U10"
                  value={createTeamCode}
                  onChange={e => setCreateTeamCode(normalizeTeamCode(e.target.value))}
                  autoComplete="off"
                  maxLength={24}
                />
                <p className="mt-1 text-xs text-gray-500">Use letters, numbers, and hyphens.</p>
              </div>
              <LogoImageInput
                label="Team Logo (optional)"
                value={teamLogoUrl}
                onChange={setTeamLogoUrl}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Choose a Passcode</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="4+ characters"
                  value={createPasscode}
                  onChange={e => setCreatePasscode(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Creating...' : 'Create Team'}
              </button>
              <p className="text-xs text-gray-500">
                Your custom team code will be used for all future logins from the dropdown.
              </p>
            </form>
          )}

          <form onSubmit={handleDeleteTeam} className="mt-8 pt-5 border-t border-gray-200 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-500">Administrator controls</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delete Team</label>
              <select
                className="input-field uppercase"
                value={deleteTeamId}
                onChange={e => setDeleteTeamId(normalizeTeamCode(e.target.value))}
                disabled={loadingTeamCodes || deleteLoading}
              >
                <option value="">
                  {loadingTeamCodes ? 'Loading team codes...' : 'Select team code to remove'}
                </option>
                {sortedTeamCodes.map(code => (
                  <option key={`delete-${code}`} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Official Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="Administrator password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                autoComplete="off"
              />
            </div>
            {deleteStatus && <p className={`text-sm ${deleteSucceeded ? 'text-green-600' : 'text-red-500'}`}>{deleteStatus}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={deleteLoading}
                className="text-xs font-semibold px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                {deleteLoading ? 'Removing...' : 'Delete Team'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
