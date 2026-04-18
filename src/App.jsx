import { useState, useCallback, useEffect } from 'react';
import { buildSeasonSchedule, migrateData } from './utils/storage.js';
import Login from './components/Login.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import CreateTeamPanel from './components/CreateTeamPanel.jsx';
import TabNav from './components/TabNav.jsx';
import TeamTab from './components/TeamTab.jsx';
import GameTab from './components/GameTab.jsx';
import StatsTab from './components/StatsTab.jsx';
import ClubLogo from './components/ClubLogo.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { FOOTBALL_WEST_LOGO_URL } from './utils/clubLogos.js';
import { loginWithSession, saveTeamData, viewTeamData } from './utils/netlifyData.js';
import { LAST_TEAM_ID_KEY } from './utils/storageKeys.js';
import { applyBlockMinutes } from './utils/subAlgorithm.js';
import { buildMatchReport } from './utils/matchReport.js';

const SESSION_KEY = 'soccerSubsSession';
const THEME_KEY = 'soccerSubsTheme';
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // ignore
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function secondsToMinutes(seconds) {
  return Math.round((seconds || 0) / 60);
}

function applyTrackedMinutes(players, playerTimers) {
  return players.map(player => {
    const timer = playerTimers?.[player.id];
    if (!timer?.positionSeconds) return player;
    const gkMinutes = secondsToMinutes(timer.positionSeconds.GK);
    const defMinutes = secondsToMinutes(timer.positionSeconds.DEF);
    const midMinutes = secondsToMinutes(timer.positionSeconds.MID);
    const atkMinutes = secondsToMinutes(timer.positionSeconds.ATK);
    return {
      ...player,
      minutesGK: (player.minutesGK || 0) + gkMinutes,
      minutesDEF: (player.minutesDEF || 0) + defMinutes,
      minutesMID: (player.minutesMID || 0) + midMinutes,
      minutesATK: (player.minutesATK || 0) + atkMinutes,
    };
  });
}

function getCancelledDetails(data) {
  return Array.isArray(data?.cancelledGameDetails) ? data.cancelledGameDetails : [];
}

function buildLogoutEndGameData(data) {
  const { currentGame, players, team } = data;
  if (!currentGame) return data;
  const plan = Array.isArray(currentGame.plan) ? currentGame.plan : [];
  const availablePlayers = Array.isArray(currentGame.availablePlayers) ? currentGame.availablePlayers : [];
  const absentMinutes = currentGame.absentMinutes || [];

  let updatedPlayers = [...players];
  const finalBlockIndex = currentGame.blockIndex || 0;
  const elapsedSeconds = currentGame.elapsedSeconds || 0;
  const blocksPlayed = finalBlockIndex + 1;
  const totalBlocks = plan.length;

  const playerTimers = currentGame.playerTimers || {};
  const hasTrackedMinutes = Object.values(playerTimers).some(t => (t?.totalSeconds || 0) > 0);

  if (hasTrackedMinutes) {
    updatedPlayers = applyTrackedMinutes(updatedPlayers, playerTimers);
  } else {
    for (let i = 0; i < Math.min(blocksPlayed, totalBlocks); i++) {
      const block = plan[i];
      let blockMinutes = 10;
      if (i === totalBlocks - 1) {
        const remainingMinutes = team.gameDuration - (totalBlocks - 1) * 10;
        blockMinutes = remainingMinutes;
      }
      updatedPlayers = applyBlockMinutes(updatedPlayers, block.onField, blockMinutes);
    }
  }

  if (absentMinutes && absentMinutes.length > 0) {
    updatedPlayers = updatedPlayers.map(p => {
      const absentEntry = absentMinutes.find(a => a.playerId === p.id);
      if (absentEntry) {
        return {
          ...p,
          minutesSickInjured: (p.minutesSickInjured || 0) + absentEntry.minutesSickInjured,
        };
      }
      return p;
    });
  }

  const gkSaves = currentGame.gkSaves || {};
  updatedPlayers = updatedPlayers.map(player => ({
    ...player,
    saves: (player.saves || 0) + (Number(gkSaves[player.id]) || 0),
  }));

  const availableSet = new Set(availablePlayers);
  updatedPlayers = updatedPlayers.map(player => {
    if (!availableSet.has(player.id)) return player;
    const original = players.find(p => p.id === player.id) || player;
    const fieldMinutesThisGame =
      ((player.minutesGK || 0) - (original.minutesGK || 0)) +
      ((player.minutesDEF || 0) - (original.minutesDEF || 0)) +
      ((player.minutesMID || 0) - (original.minutesMID || 0)) +
      ((player.minutesATK || 0) - (original.minutesATK || 0));
    const benchMinutesThisGame = Math.max(0, team.gameDuration - fieldMinutesThisGame);
    return {
      ...player,
      minutesBench: (player.minutesBench || 0) + benchMinutesThisGame,
    };
  });

  const playerMinuteDeltas = players.map(original => {
    const updated = updatedPlayers.find(p => p.id === original.id) || original;
    return {
      playerId: original.id,
      minutesGK: (updated.minutesGK || 0) - (original.minutesGK || 0),
      minutesDEF: (updated.minutesDEF || 0) - (original.minutesDEF || 0),
      minutesMID: (updated.minutesMID || 0) - (original.minutesMID || 0),
      minutesATK: (updated.minutesATK || 0) - (original.minutesATK || 0),
      minutesSickInjured: (updated.minutesSickInjured || 0) - (original.minutesSickInjured || 0),
      minutesBench: (updated.minutesBench || 0) - (original.minutesBench || 0),
      saves: (updated.saves || 0) - (original.saves || 0),
    };
  });

  const resolvedGoals = currentGame.goals ?? [];
  const resolvedSaves = currentGame.gkSaves ?? {};
  const resolvedLog = currentGame.gameLog ?? [];
  const reportGame = {
    ...currentGame,
    goals: resolvedGoals,
    gkSaves: resolvedSaves,
    gameLog: resolvedLog,
  };
  const matchReport = buildMatchReport({ game: reportGame, players, team });

  const historyEntry = {
    gameNumber: currentGame.gameNumber,
    date: new Date().toLocaleDateString(),
    formation: currentGame.formation,
    playerCount: availablePlayers.length,
    absentCount: (currentGame.absentPlayers || []).length,
    elapsedSeconds,
    opponentName: currentGame.opponentName || 'Opponent',
    opponentLogoUrl: currentGame.opponentLogoUrl || '',
    homeScore: currentGame.homeScore ?? 0,
    awayScore: currentGame.awayScore ?? 0,
    goals: resolvedGoals,
    gkSaves: resolvedSaves,
    gameLog: resolvedLog,
    playerTimers,
    absentMinutes: currentGame.absentMinutes || [],
    playerMinuteDeltas,
    availablePlayers: currentGame.availablePlayers || [],
    absentPlayers: currentGame.absentPlayers || [],
    startingField: currentGame.startingField || [],
    startingBenchIds: Array.isArray(currentGame.startingBench)
      ? currentGame.startingBench.filter(id => typeof id === 'string')
      : [],
    startingBench: Array.isArray(currentGame.startingBench)
      ? currentGame.startingBench.filter(id => typeof id === 'string')
      : [],
    matchReport,
  };

  const updatedCancelled = getCancelledDetails(data)
    .filter(item => Number(item.round) !== Number(currentGame.gameNumber));

  return {
    ...data,
    players: updatedPlayers,
    currentGame: null,
    pendingGameSetup: null,
    gameHistory: [...(data.gameHistory || []), historyEntry],
    cancelledGameDetails: updatedCancelled,
    cancelledGames: updatedCancelled.length,
    seasonSchedule: buildSeasonSchedule(team.gamesPerSeason, data.seasonSchedule),
  };
}

export default function App() {
  const [data, setData] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [session, setSession] = useState(() => readStoredSession());
  const [checkingSession, setCheckingSession] = useState(() => Boolean(readStoredSession()));
  const [syncError, setSyncError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [authScreen, setAuthScreen] = useState('login');
  const [activeTab, setActiveTab] = useState('game');
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const isDarkTheme = theme === 'dark';
  const isLiveGameScreen = activeTab === 'game' && Boolean(data?.currentGame);
  const hasLiveGame = Boolean(data?.currentGame);
  const isViewOnly = Boolean(session?.viewOnly);
  const switchToGame = useCallback(() => setActiveTab('game'), []);
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  const fetchSessionData = useCallback(async () => {
    if (!session) {
      throw new Error('No session available.');
    }
    return session.viewOnly
      ? await viewTeamData(session.teamId)
      : await loginWithSession(session);
  }, [session]);

  const finalizeSessionLogin = useCallback((loginData) => {
    if (!loginData || !session) return;
    setData(migrateData(loginData));
    setLoggedIn(true);
    setSyncError('');
    setSessionError('');
    try {
      localStorage.setItem(LAST_TEAM_ID_KEY, session.teamId);
    } catch {
      // ignore
    }
  }, [session]);

  const handleSessionRestoreFailure = useCallback((error) => {
    const status = error?.status;
    if (status === HTTP_UNAUTHORIZED || status === HTTP_NOT_FOUND) {
      // Auth failures or missing teams require clearing the saved session; other errors can be retried.
      setLoggedIn(false);
      setData(null);
      setSession(null);
      setSyncError('');
      setAuthScreen('login');
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      setSessionError(error?.message || 'Unable to load team data. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setCheckingSession(false);
      setSessionError('');
      return;
    }
    let cancelled = false;
    setCheckingSession(true);
    setSessionError('');
    (async () => {
      try {
        const loginData = await fetchSessionData();
        if (cancelled) return;
        finalizeSessionLogin(loginData);
      } catch (error) {
        if (cancelled) return;
        handleSessionRestoreFailure(error);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSessionData, finalizeSessionLogin, handleSessionRestoreFailure, session]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeTab, loggedIn]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDarkTheme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [isDarkTheme, theme]);

  const handleLogin = useCallback(({ data: loginData, session: loginSession }) => {
    const migrated = migrateData(loginData);
    setData(migrated);
    setSession(loginSession);
    setLoggedIn(true);
    setAuthScreen('login');
    setSyncError('');
    setSessionError('');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(loginSession));
    try {
      localStorage.setItem(LAST_TEAM_ID_KEY, loginSession.teamId);
    } catch {
      // ignore
    }
  }, []);

  const handleUpdate = useCallback(async (newData, options = {}) => {
    if (session?.viewOnly) {
      return {
        ok: false,
        error: new Error('View-only mode.'),
      };
    }
    const optimistic = options?.optimistic !== false;
    if (optimistic) {
      setData(newData);
    }
    if (!session) return;
    try {
      const updatedSession = await saveTeamData(session, newData, options);
      setSyncError('');
      if (!optimistic) {
        setData(newData);
      }
      if (updatedSession.passcodeHash !== session.passcodeHash) {
        setSession(updatedSession);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
      }
      return { ok: true };
    } catch (error) {
      console.error(error);
      setSyncError(error?.message || 'Could not sync latest change to Netlify. Refresh and try again.');
      return {
        ok: false,
        error,
      };
    }
  }, [session]);

  useEffect(() => {
    if (!session?.viewOnly || !loggedIn) return undefined;
    let cancelled = false;
    const refreshIntervalMs = hasLiveGame ? 2000 : 10000;
    const interval = setInterval(async () => {
      try {
        const latest = await viewTeamData(session.teamId);
        if (!cancelled) setData(migrateData(latest));
      } catch {
        // ignore view-only refresh errors
      }
    }, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session, loggedIn, hasLiveGame]);

  function performLogout() {
    setLoggedIn(false);
    setData(null);
    setSession(null);
    setSyncError('');
    setSessionError('');
    setAuthScreen('login');
    sessionStorage.removeItem(SESSION_KEY);
  }

  const retrySessionLogin = useCallback(async () => {
    if (!session || checkingSession) return;
    setCheckingSession(true);
    setSessionError('');
    try {
      const loginData = await fetchSessionData();
      finalizeSessionLogin(loginData);
    } catch (error) {
      handleSessionRestoreFailure(error);
    } finally {
      setCheckingSession(false);
    }
  }, [checkingSession, fetchSessionData, finalizeSessionLogin, handleSessionRestoreFailure, session]);

  function handleLogout() {
    if (!isViewOnly && data?.currentGame) {
      setLogoutError('');
      setShowLogoutWarning(true);
      return;
    }
    if (!window.confirm('Log out? Your team data stays saved on Netlify.')) return;
    performLogout();
  }

  function handleCancelLogout() {
    setShowLogoutWarning(false);
    setLogoutError('');
    setActiveTab('game');
  }

  async function handleConfirmLogout() {
    if (logoutInProgress) return;
    setLogoutInProgress(true);
    setLogoutError('');
    try {
      if (data?.currentGame) {
        const updatedData = buildLogoutEndGameData(data);
        const updateResult = await handleUpdate(updatedData, { optimistic: false });
        if (updateResult?.ok === false) {
          setLogoutError(updateResult?.error?.message || 'Unable to save match stats. Try again.');
          setLogoutInProgress(false);
          return;
        }
      }
      setShowLogoutWarning(false);
      performLogout();
    } catch (error) {
      setLogoutError(error?.message || 'Unable to save match stats. Try again.');
    } finally {
      setLogoutInProgress(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-[100svh] bg-gray-50 dark:bg-slate-950 flex items-center justify-center px-4">
        <p className="text-sm text-gray-600 dark:text-slate-300">Loading team data...</p>
      </div>
    );
  }

  if (!loggedIn) {
    if (authScreen === 'admin') {
      return (
        <div className="relative">
          <AdminPanel onBack={() => setAuthScreen('login')} />
          <div className="fixed right-3 top-3 z-50">
            <ThemeToggle isDark={isDarkTheme} onToggle={toggleTheme} className="text-white" />
          </div>
        </div>
      );
    }
    if (authScreen === 'create-team') {
      return (
        <div className="relative">
          <CreateTeamPanel onBack={() => setAuthScreen('login')} />
          <div className="fixed right-3 top-3 z-50">
            <ThemeToggle isDark={isDarkTheme} onToggle={toggleTheme} className="text-white" />
          </div>
        </div>
      );
    }
    return (
      <div className="relative">
        <Login
          onLogin={handleLogin}
          onOpenAdmin={() => setAuthScreen('admin')}
          onOpenCreateTeam={() => setAuthScreen('create-team')}
          sessionError={sessionError}
          onRetrySession={session ? retrySessionLogin : undefined}
          initialTeamId={session?.teamId}
        />
        <div className="fixed right-3 top-3 z-50">
          <ThemeToggle isDark={isDarkTheme} onToggle={toggleTheme} className="text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${isLiveGameScreen ? 'h-dvh overflow-hidden' : 'min-h-screen'} bg-gray-50 dark:bg-slate-950`}>
      {/* Header */}
      <header className="bg-pitch-700 text-white px-3 pt-safe-top sticky top-0 z-40 shadow-md">
        <div className="flex items-center justify-between max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto py-1">
          <div className="flex items-center gap-2">
            <ClubLogo
              sizeClass="w-6 h-6"
              logoUrl={data?.team?.logoUrl || FOOTBALL_WEST_LOGO_URL}
              alt={`${data?.team?.name || 'Team'} logo`}
              name={data?.team?.name || 'Team'}
            />
            <span className="font-semibold text-sm tracking-tight">{data?.team?.name || 'Soccer Subs'}</span>
            {isViewOnly && (
              <span className="text-[10px] uppercase tracking-[0.16em] bg-white/15 px-2 py-0.5 rounded-full">
                View Only
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDarkTheme} onToggle={toggleTheme} />
            <button onClick={handleLogout} className="text-pitch-200 text-xs font-medium">
              Logout
            </button>
          </div>
        </div>
      </header>

      {showLogoutWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-warning-title"
          >
            <h2 id="logout-warning-title" className="text-base font-semibold text-gray-900 dark:text-slate-100">
              End match early?
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
              This will end the current match and save stats. Are you sure you want to end this match early?
            </p>
            {logoutError && (
              <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-300">{logoutError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleCancelLogout}
                className="flex-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                disabled={logoutInProgress}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 rounded-full bg-pitch-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pitch-500 disabled:opacity-70"
                disabled={logoutInProgress}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main
        className={isLiveGameScreen ? 'overflow-hidden' : undefined}
        style={isLiveGameScreen ? { height: 'calc(100dvh - var(--app-header-height) - var(--app-tabbar-height))' } : undefined}
      >
        {syncError && (
          <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-3">
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-300">{syncError}</p>
          </div>
        )}
        {activeTab === 'team' && (
          <TeamTab data={data} onUpdate={handleUpdate} readOnly={isViewOnly} />
        )}
        {/* When a live game exists, keep GameTab mounted (hidden) so the timer
            and substitute countdown continue running across tab switches. */}
        {hasLiveGame ? (
          <div style={{ display: activeTab === 'game' ? undefined : 'none', height: '100%' }}>
            <GameTab
              data={data}
              onUpdate={handleUpdate}
              onSwitchToGame={switchToGame}
              sessionTeamId={session?.teamId}
              readOnly={isViewOnly}
            />
          </div>
        ) : (
          activeTab === 'game' && (
            <GameTab
              data={data}
              onUpdate={handleUpdate}
              sessionTeamId={session?.teamId}
              readOnly={isViewOnly}
            />
          )
        )}
        {activeTab === 'stats' && (
          <StatsTab data={data} onUpdate={handleUpdate} sessionTeamId={session?.teamId} readOnly={isViewOnly} />
        )}
      </main>
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
