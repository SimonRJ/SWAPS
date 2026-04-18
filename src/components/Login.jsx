import { useCallback, useEffect, useMemo, useState } from 'react';
import { listTeamCodes, loginWithPasscode, loginViewOnly } from '../utils/netlifyData.js';
import loginBackground from '../assets/login-bg.png';

const MAX_TEAM_CODE_LENGTH = 24;
const TEAM_CODES_KEY = 'soccerSubsTeamCodes';
const LAST_TEAM_ID_KEY = 'soccerSubsLastTeamId';

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_TEAM_CODE_LENGTH);
}

function normalizeTeamCodes(codes) {
  return Array.from(new Set((Array.isArray(codes) ? codes : [])
    .map(code => normalizeTeamCode(code))
    .filter(Boolean)));
}

function readCachedTeamCodes() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TEAM_CODES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeTeamCodes(parsed);
  } catch {
    return [];
  }
}

function readLastTeamId() {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeTeamCode(localStorage.getItem(LAST_TEAM_ID_KEY));
  } catch {
    return '';
  }
}

function writeCachedTeamCodes(codes) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TEAM_CODES_KEY, JSON.stringify(codes));
  } catch {
    // ignore
  }
}

export default function Login({
  onLogin,
  onOpenAdmin,
  onOpenCreateTeam,
  initialTeamId = '',
  sessionError = '',
  onRetrySession,
}) {
  const canRetrySession = typeof onRetrySession === 'function';
  const [teamId, setTeamId] = useState(() => normalizeTeamCode(initialTeamId || readLastTeamId()));
  const [loginPasscode, setLoginPasscode] = useState('');
  const [teamCodes, setTeamCodes] = useState(() => readCachedTeamCodes());
  const [loadingTeamCodes, setLoadingTeamCodes] = useState(() => readCachedTeamCodes().length === 0);
  const [teamCodeError, setTeamCodeError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshTeamCodes = useCallback(async () => {
    setLoadingTeamCodes(true);
    setTeamCodeError('');
    try {
      const codes = await listTeamCodes();
      const normalized = normalizeTeamCodes(codes);
      setTeamCodes(normalized);
      writeCachedTeamCodes(normalized);
    } catch {
      const cached = readCachedTeamCodes();
      if (cached.length > 0) {
        setTeamCodes(cached);
      }
      setTeamCodeError('Unable to load team codes. You can still enter your team code manually.');
    } finally {
      setLoadingTeamCodes(false);
    }
  }, []);

  useEffect(() => {
    refreshTeamCodes();
  }, [refreshTeamCodes]);

  const availableTeamCodes = useMemo(() => {
    const codes = new Set(teamCodes);
    const initial = normalizeTeamCode(initialTeamId);
    if (initial) codes.add(initial);
    if (teamId) codes.add(teamId);
    return [...codes].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [initialTeamId, teamCodes, teamId]);

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

  async function handleViewOnly() {
    const normalizedTeamId = normalizeTeamCode(teamId);
    if (!normalizedTeamId) {
      setError('Select your team code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await loginViewOnly(normalizedTeamId);
      onLogin(response);
    } catch (loginError) {
      setError(loginError.message || 'Unable to open view-only team.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#101914]">
      <div className="absolute inset-0 flex items-start justify-center" aria-hidden="true">
        <img
          src={loginBackground}
          alt=""
          className="h-full w-full object-contain object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(5,10,8,0.10)] to-[rgba(5,10,8,0.65)]" />
      </div>

      <div className="relative z-10 flex h-full items-end justify-center px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-xs rounded-2xl border border-white/35 bg-black/45 p-3 text-white shadow-2xl backdrop-blur-sm sm:p-4"
        >
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/75">SWAPS</p>
          <h1 className="mt-0.5 text-xl font-bold leading-tight">Team Login</h1>
          <p className="mt-0.5 text-xs text-white/85">Use your team code and passcode to continue.</p>

          <div className="mt-3 space-y-2.5">
            <div>
              <label htmlFor="team-code" className="mb-0.5 block text-xs font-medium text-white/95">Team Code</label>
              <input
                id="team-code"
                list="team-code-options"
                className="w-full rounded-xl border border-white/35 bg-white/95 px-3 py-2 text-sm font-semibold uppercase text-gray-900 focus:outline-none focus:ring-2 focus:ring-pitch-400 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                value={teamId}
                onChange={e => setTeamId(normalizeTeamCode(e.target.value))}
                placeholder={loadingTeamCodes ? 'Loading team codes...' : 'Select or enter your team code'}
                autoComplete="off"
              />
              <datalist id="team-code-options">
                {availableTeamCodes.map(code => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="team-passcode" className="mb-0.5 block text-xs font-medium text-white/95">Team Passcode</label>
              <input
                id="team-passcode"
                type="password"
                className="w-full rounded-xl border border-white/35 bg-white/95 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-pitch-400 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                placeholder="Enter passcode"
                value={loginPasscode}
                onChange={e => setLoginPasscode(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {sessionError && (
              <div className="rounded-xl border border-red-200/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                <p>{sessionError}</p>
                {canRetrySession && (
                  <button
                    type="button"
                    onClick={onRetrySession}
                    disabled={loading}
                    aria-disabled={loading}
                    className="mt-2 rounded-full border border-red-200/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-100 transition hover:bg-red-500/20 disabled:opacity-60"
                  >
                    Retry session
                  </button>
                )}
              </div>
            )}
            {teamCodeError && <p className="text-xs text-amber-100">{teamCodeError}</p>}
            {error && <p className="text-sm font-medium text-red-200">{error}</p>}

            {!loadingTeamCodes && availableTeamCodes.length === 0 && (
              <p className="text-xs text-white/80">No teams found. Ask an admin to create one.</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-pitch-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-pitch-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Checking...' : 'Log In'}
            </button>
            <button
              type="button"
              onClick={handleViewOnly}
              disabled={loading}
              className="w-full rounded-xl border border-white/40 bg-white/15 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              View Only (No Passcode)
            </button>
          </div>
        </form>
      </div>

      <div className="absolute bottom-[max(0.8rem,env(safe-area-inset-bottom))] left-[max(0.8rem,env(safe-area-inset-left))] right-[max(0.8rem,env(safe-area-inset-right))] z-20 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenCreateTeam}
          className="rounded-md border border-white/45 bg-black/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          Create Team
        </button>
        <button
          type="button"
          onClick={onOpenAdmin}
          className="rounded-md border border-white/45 bg-black/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          Admin
        </button>
      </div>
    </div>
  );
}
