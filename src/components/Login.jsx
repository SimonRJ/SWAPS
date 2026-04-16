import { useState } from 'react';
import { getDefaultData } from '../utils/storage.js';
import LogoImageInput from './LogoImageInput.jsx';
import TeamAvatar from './TeamAvatar.jsx';
import { FOOTBALL_WEST_CLUBS, getClubById } from '../utils/clubLogos.js';
import { createTeam, loginWithPasscode } from '../utils/netlifyData.js';
import wizardHero from '../assets/wizard-hero.svg';

function createTeamId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'create'
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [clubId, setClubId] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [autoClubLogoUrl, setAutoClubLogoUrl] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!teamId.trim()) {
      setError('Enter your team code.');
      return;
    }
    if (!passcode.trim()) {
      setError('Enter your team passcode.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await loginWithPasscode(teamId.trim().toUpperCase(), passcode.trim());
      onLogin(response);
    } catch (loginError) {
      setError(loginError.message || 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const selectedClub = getClubById(clubId);
    const finalTeamName = (teamName || selectedClub?.name || '').trim();
    if (!finalTeamName) { setError('Enter a team name.'); return; }
    if (!passcode.trim()) { setError('Enter a passcode.'); return; }
    setLoading(true);
    setError('');
    try {
      const baseData = await getDefaultData({
        name: finalTeamName,
        clubId: selectedClub?.id || '',
        logoUrl: teamLogoUrl || selectedClub?.logoUrl || '',
      }, passcode.trim());
      let created = null;
      let attempts = 0;
      while (!created && attempts < 5) {
        const generatedTeamId = createTeamId();
        attempts += 1;
        try {
          created = await createTeam({
            teamId: generatedTeamId,
            data: {
              ...baseData,
              team: {
                ...baseData.team,
                teamId: generatedTeamId,
              },
            },
          });
        } catch (createError) {
          if (createError.code !== 'TEAM_EXISTS') throw createError;
        }
      }
      if (!created) {
        throw new Error('Could not create a unique team code. Please try again.');
      }
      onLogin(created);
    } catch (createError) {
      setError(createError.message || 'Unable to create team.');
    } finally {
      setLoading(false);
    }
  }

  const selectedClub = getClubById(clubId);
  const loginLogoUrl = teamLogoUrl || selectedClub?.logoUrl || '/favicon.svg';
  const loginLogoName = teamName || selectedClub?.name || 'Soccer Subs';

  return (
    <div className="min-h-[100svh] bg-gradient-to-br from-pitch-900 via-pitch-800 to-pitch-700 flex items-center justify-center px-4 py-4 sm:py-8">
      <div className="w-full max-w-6xl grid gap-4 sm:gap-6 lg:grid-cols-[1.1fr_1fr] items-center">
        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 sm:p-6 text-white">
          <img
            src={wizardHero}
            alt="Wizard holding a soccer ball and wizard staff"
            className="w-full rounded-2xl border border-white/20 shadow-2xl"
          />
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pitch-100 font-semibold">
            Soccer Team Planner
          </p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-black leading-tight">
            Substitute Wizardry and Planning
          </h1>
        </div>
        <div className="w-full max-w-xl mx-auto bg-white rounded-3xl shadow-2xl p-5 sm:p-8 border border-white/40">
          <div className="mb-5 flex items-center justify-center">
            <TeamAvatar
              src={loginLogoUrl}
              alt={`${loginLogoName} logo`}
              name={loginLogoName}
              sizeClass="w-24 h-24 sm:w-32 sm:h-32"
              className="shadow-lg"
            />
          </div>
          <div className="mb-6">
            <p className="text-sm font-semibold text-pitch-700 uppercase tracking-[0.15em]">Welcome</p>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Sign in to continue</h2>
          </div>

          <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-pitch-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => { setMode('login'); setError(''); }}
            >Log In</button>
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'create' ? 'bg-pitch-600 text-white' : 'bg-white text-gray-600'}`}
              onClick={() => { setMode('create'); setError(''); }}
            >New Team</button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Code</label>
                <input
                  type="text"
                  className="input-field uppercase"
                  placeholder="Enter team code"
                  value={teamId}
                  onChange={e => setTeamId(e.target.value.replace(/\s+/g, '').toUpperCase())}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Passcode</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter passcode"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
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
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Creating...' : 'Create Team'}
              </button>
              <p className="text-xs text-gray-500">
                A team code will be generated and shown after team creation so families can join from their devices.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
