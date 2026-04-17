import { useState, useCallback, useEffect } from 'react';
import { migrateData } from './utils/storage.js';
import Login from './components/Login.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import TabNav from './components/TabNav.jsx';
import TeamTab from './components/TeamTab.jsx';
import GameTab from './components/GameTab.jsx';
import StatsTab from './components/StatsTab.jsx';
import ClubLogo from './components/ClubLogo.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { FOOTBALL_WEST_LOGO_URL } from './utils/clubLogos.js';
import { loginWithSession, saveTeamData } from './utils/netlifyData.js';

const SESSION_KEY = 'soccerSubsSession';
const THEME_KEY = 'soccerSubsTheme';

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

export default function App() {
  const [data, setData] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [session, setSession] = useState(() => readStoredSession());
  const [checkingSession, setCheckingSession] = useState(() => Boolean(readStoredSession()));
  const [syncError, setSyncError] = useState('');
  const [authScreen, setAuthScreen] = useState('login');
  const [activeTab, setActiveTab] = useState('game');
  const [theme, setTheme] = useState(() => getInitialTheme());
  const isDarkTheme = theme === 'dark';
  const isLiveGameScreen = activeTab === 'game' && Boolean(data?.currentGame);
  const hasLiveGame = Boolean(data?.currentGame);
  const switchToGame = useCallback(() => setActiveTab('game'), []);
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    if (!session) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    setCheckingSession(true);
    (async () => {
      try {
        const loginData = await loginWithSession(session);
        if (cancelled) return;
        setData(migrateData(loginData));
        setLoggedIn(true);
      } catch {
        if (cancelled) return;
        setSession(null);
        sessionStorage.removeItem(SESSION_KEY);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(loginSession));
  }, []);

  const handleUpdate = useCallback(async (newData, options = {}) => {
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

  function handleLogout() {
    if (!window.confirm('Log out? Your team data stays saved on Netlify.')) return;
    setLoggedIn(false);
    setData(null);
    setSession(null);
    setSyncError('');
    setAuthScreen('login');
    sessionStorage.removeItem(SESSION_KEY);
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
    return (
      <div className="relative">
        <Login onLogin={handleLogin} onOpenAdmin={() => setAuthScreen('admin')} />
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
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDarkTheme} onToggle={toggleTheme} />
            <button onClick={handleLogout} className="text-pitch-200 text-xs font-medium">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        className={isLiveGameScreen ? 'overflow-hidden' : undefined}
        style={isLiveGameScreen ? { height: 'calc(100dvh - var(--app-header-height) - var(--app-tabbar-height))' } : undefined}
      >
        {syncError && (
          <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-3">
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{syncError}</p>
          </div>
        )}
        {activeTab === 'team' && (
          <TeamTab data={data} onUpdate={handleUpdate} />
        )}
        {/* When a live game exists, keep GameTab mounted (hidden) so the timer
            and substitute countdown continue running across tab switches. */}
        {hasLiveGame ? (
          <div style={{ display: activeTab === 'game' ? undefined : 'none', height: '100%' }}>
            <GameTab data={data} onUpdate={handleUpdate} onSwitchToGame={switchToGame} />
          </div>
        ) : (
          activeTab === 'game' && <GameTab data={data} onUpdate={handleUpdate} />
        )}
        {activeTab === 'stats' && (
          <StatsTab data={data} onUpdate={handleUpdate} />
        )}
      </main>
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
