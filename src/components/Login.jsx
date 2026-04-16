import { useCallback, useEffect, useMemo, useState } from 'react';
import { listTeamCodes, loginWithPasscode } from '../utils/netlifyData.js';
import loginBackground from '../assets/login-bg.png';

const MAX_TEAM_CODE_LENGTH = 24;

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_TEAM_CODE_LENGTH);
}

export default function Login({ onLogin, onOpenAdmin }) {
  const [teamId, setTeamId] = useState('');
  const [loginPasscode, setLoginPasscode] = useState('');
  const [teamCodes, setTeamCodes] = useState([]);
  const [loadingTeamCodes, setLoadingTeamCodes] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    try {
      const response = await loginWithPasscode(normalizedTeamId, loginPasscode.trim());
      onLogin(response);
    } catch (loginError) {
      setError(loginError.message || 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#101914]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(5, 10, 8, 0.18), rgba(5, 10, 8, 0.62)), url(${loginBackground})`,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl border border-white/35 bg-black/45 p-4 text-white shadow-2xl backdrop-blur-sm sm:p-5"
        >
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/75">SWAPS</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">Team Login</h1>
          <p className="mt-1 text-sm text-white/85">Use your team code and passcode to continue.</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/95">Team Code</label>
              <select
                className="w-full rounded-xl border border-white/35 bg-white/95 px-3 py-2.5 text-base font-semibold uppercase text-gray-900 focus:outline-none focus:ring-2 focus:ring-pitch-400"
                value={teamId}
                onChange={e => setTeamId(normalizeTeamCode(e.target.value))}
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
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white/95">Team Passcode</label>
              <input
                type="password"
                className="w-full rounded-xl border border-white/35 bg-white/95 px-3 py-2.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-pitch-400"
                placeholder="Enter passcode"
                value={loginPasscode}
                onChange={e => setLoginPasscode(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && <p className="text-sm font-medium text-red-200">{error}</p>}

            {!loadingTeamCodes && sortedTeamCodes.length === 0 && (
              <p className="text-xs text-white/80">No teams found. Ask an admin to create one.</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-pitch-600 py-2.5 text-base font-semibold text-white transition-colors hover:bg-pitch-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Checking...' : 'Log In'}
            </button>
          </div>
        </form>
      </div>

      <button
        type="button"
        onClick={onOpenAdmin}
        className="absolute bottom-[max(0.8rem,env(safe-area-inset-bottom))] right-[max(0.8rem,env(safe-area-inset-right))] z-20 rounded-md border border-white/45 bg-black/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        Admin
      </button>
    </div>
  );
}
