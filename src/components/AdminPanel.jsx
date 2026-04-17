import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDefaultData } from '../utils/storage.js';
import LogoImageInput from './LogoImageInput.jsx';
import { FOOTBALL_WEST_CLUBS, getClubById } from '../utils/clubLogos.js';
import {
  createTeam,
  deleteTeamByAdmin,
  listRecoverableTeamCodes,
  listSecurityLogs,
  listTeamCodes,
  restoreFromSecurityLog,
} from '../utils/netlifyData.js';

const MIN_TEAM_CODE_LENGTH = 3;
const MAX_TEAM_CODE_LENGTH = 24;

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_TEAM_CODE_LENGTH);
}

function formatLogTime(timestamp) {
  const value = new Date(timestamp || '');
  if (Number.isNaN(value.getTime())) return 'Unknown time';
  return value.toLocaleString();
}

export default function AdminPanel({ onBack }) {
  const [teamName, setTeamName] = useState('');
  const [createTeamCode, setCreateTeamCode] = useState('');
  const [clubId, setClubId] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [autoClubLogoUrl, setAutoClubLogoUrl] = useState('');
  const [createPasscode, setCreatePasscode] = useState('');
  const [teamCodes, setTeamCodes] = useState([]);
  const [loadingTeamCodes, setLoadingTeamCodes] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [deleteSucceeded, setDeleteSucceeded] = useState(false);
  const [securityTeamId, setSecurityTeamId] = useState('');
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityLogs, setSecurityLogs] = useState([]);
  const [recoverableTeamCodes, setRecoverableTeamCodes] = useState([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityStatus, setSecurityStatus] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [restoringLogId, setRestoringLogId] = useState('');

  const refreshTeamCodes = useCallback(async () => {
    setLoadingTeamCodes(true);
    try {
      const [codes, recoverableCodes] = await Promise.all([listTeamCodes(), listRecoverableTeamCodes()]);
      const nextCodes = Array.isArray(codes) ? codes : [];
      const nextRecoverableCodes = Array.isArray(recoverableCodes) ? recoverableCodes : [];
      setTeamCodes(nextCodes);
      setRecoverableTeamCodes(nextRecoverableCodes);
      setDeleteTeamId(prev => (prev ? prev : nextCodes[0] || ''));
      setSecurityTeamId(prev => (prev ? prev : nextRecoverableCodes[0] || nextCodes[0] || ''));
    } catch {
      setTeamCodes([]);
      setRecoverableTeamCodes([]);
    } finally {
      setLoadingTeamCodes(false);
    }
  }, []);

  useEffect(() => {
    refreshTeamCodes();
  }, [refreshTeamCodes]);

  const selectedClub = getClubById(clubId);
  const sortedTeamCodes = useMemo(() => [...teamCodes].sort((a, b) => a.localeCompare(b)), [teamCodes]);
  const sortedRecoverableTeamCodes = useMemo(
    () => [...recoverableTeamCodes].sort((a, b) => a.localeCompare(b)),
    [recoverableTeamCodes],
  );

  async function handleCreate(e) {
    e.preventDefault();
    const normalizedTeamCode = normalizeTeamCode(createTeamCode);
    const finalTeamName = (teamName || selectedClub?.name || '').trim();

    if (!finalTeamName) {
      setError('Enter a team name.');
      setStatus('');
      return;
    }
    if (!normalizedTeamCode) {
      setError('Create a team code.');
      setStatus('');
      return;
    }
    if (normalizedTeamCode.length < MIN_TEAM_CODE_LENGTH) {
      setError(`Team code must be at least ${MIN_TEAM_CODE_LENGTH} characters.`);
      setStatus('');
      return;
    }
    if (!createPasscode.trim()) {
      setError('Enter a passcode.');
      setStatus('');
      return;
    }

    setCreateLoading(true);
    setError('');
    setStatus('');

    try {
      const baseData = await getDefaultData({
        name: finalTeamName,
        clubId: selectedClub?.id || '',
        logoUrl: teamLogoUrl || selectedClub?.logoUrl || '',
      }, createPasscode.trim());

      await createTeam({
        teamId: normalizedTeamCode,
        data: {
          ...baseData,
          team: {
            ...baseData.team,
            teamId: normalizedTeamCode,
          },
        },
      });

      setStatus(`Team ${normalizedTeamCode} created successfully.`);
      setCreateTeamCode('');
      setCreatePasscode('');
      setDeleteStatus('');
      setDeleteSucceeded(false);
      await refreshTeamCodes();
      setDeleteTeamId(normalizedTeamCode);
    } catch (createError) {
      if (createError?.code === 'TEAM_EXISTS') {
        setError('Team code already exists. Choose another code.');
      } else {
        setError(createError.message || 'Unable to create team.');
      }
      setStatus('');
    } finally {
      setCreateLoading(false);
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
    if (!window.confirm(`Delete team "${normalizedTeamId}"? This cannot be undone.`)) {
      return;
    }

    setDeleteLoading(true);
    setDeleteStatus('');
    setDeleteSucceeded(false);
    setError('');
    setStatus('');

    try {
      await deleteTeamByAdmin(normalizedTeamId, deletePassword.trim());
      await refreshTeamCodes();
      setDeleteStatus(`Team ${normalizedTeamId} was deleted.`);
      setDeleteSucceeded(true);
      setDeletePassword('');
      setDeleteTeamId('');
    } catch (deleteError) {
      setDeleteStatus(deleteError.message || 'Unable to delete team.');
      setDeleteSucceeded(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLoadSecurityLogs(e) {
    e.preventDefault();
    const normalizedTeamId = normalizeTeamCode(securityTeamId);
    if (!normalizedTeamId) {
      setSecurityError('Select a team code.');
      setSecurityStatus('');
      setSecurityLogs([]);
      return;
    }
    if (!securityPassword.trim()) {
      setSecurityError('Enter the administrator password.');
      setSecurityStatus('');
      setSecurityLogs([]);
      return;
    }

    setSecurityLoading(true);
    setSecurityError('');
    setSecurityStatus('');
    try {
      const entries = await listSecurityLogs(normalizedTeamId, securityPassword.trim());
      setSecurityLogs(entries);
      setSecurityStatus(entries.length > 0 ? `Loaded ${entries.length} log entries.` : 'No security log entries yet.');
    } catch (loadError) {
      setSecurityLogs([]);
      setSecurityError(loadError.message || 'Unable to load security logs.');
    } finally {
      setSecurityLoading(false);
    }
  }

  async function handleRestoreLog(logId) {
    const normalizedTeamId = normalizeTeamCode(securityTeamId);
    if (!normalizedTeamId || !logId) return;
    if (!securityPassword.trim()) {
      setSecurityError('Enter the administrator password before restoring.');
      return;
    }
    if (!window.confirm('Restore this snapshot? Current team data will be overwritten.')) return;

    setRestoringLogId(logId);
    setSecurityError('');
    setSecurityStatus('');
    try {
      await restoreFromSecurityLog(normalizedTeamId, logId, securityPassword.trim());
      const refreshed = await listSecurityLogs(normalizedTeamId, securityPassword.trim());
      setSecurityLogs(refreshed);
      setSecurityStatus('Snapshot restored successfully.');
    } catch (restoreError) {
      setSecurityError(restoreError.message || 'Unable to restore from security log.');
    } finally {
      setRestoringLogId('');
    }
  }

  return (
    <div className="min-h-[100svh] bg-gray-100 dark:bg-slate-950 px-4 py-6 sm:py-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-lg sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">Admin</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Team Management</h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-700 hover:bg-gray-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to Login
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Club</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Team Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Team name"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Create Team Code</label>
            <input
              type="text"
              className="input-field uppercase"
              placeholder="Example: RANGERS-U10"
              value={createTeamCode}
              onChange={e => setCreateTeamCode(normalizeTeamCode(e.target.value))}
              autoComplete="off"
              maxLength={MAX_TEAM_CODE_LENGTH}
            />
          </div>

          <LogoImageInput
            label="Team Logo (optional)"
            value={teamLogoUrl}
            onChange={setTeamLogoUrl}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Choose a Passcode</label>
            <input
              type="password"
              className="input-field"
              placeholder="4+ characters"
              value={createPasscode}
              onChange={e => setCreatePasscode(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {status && <p className="text-sm text-green-700">{status}</p>}

          <button type="submit" disabled={createLoading} className="btn-primary w-full">
            {createLoading ? 'Creating...' : 'Create Team'}
          </button>
        </form>

        <form onSubmit={handleDeleteTeam} className="mt-6 border-t border-gray-200 pt-5 space-y-3 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-slate-400">Delete Team</p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Team Code</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Official Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="Administrator password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              autoComplete="off"
            />
          </div>

          {deleteStatus && (
            <p className={`text-sm ${deleteSucceeded ? 'text-green-700' : 'text-red-600'}`}>
              {deleteStatus}
            </p>
          )}

          <button
            type="submit"
            disabled={deleteLoading}
            className="w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {deleteLoading ? 'Removing...' : 'Delete Team'}
          </button>
        </form>

        <form onSubmit={handleLoadSecurityLogs} className="mt-6 border-t border-gray-200 pt-5 space-y-3 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-slate-400">Security Log</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Tracks key team changes and lets an admin restore earlier snapshots.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Team Code</label>
            <select
              className="input-field uppercase"
              value={securityTeamId}
              onChange={e => setSecurityTeamId(normalizeTeamCode(e.target.value))}
              disabled={loadingTeamCodes || securityLoading || restoringLogId}
            >
              <option value="">
                {loadingTeamCodes ? 'Loading team codes...' : 'Select team code'}
              </option>
              {sortedRecoverableTeamCodes.map(code => (
                <option key={`security-${code}`} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Official Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="Administrator password"
              value={securityPassword}
              onChange={e => setSecurityPassword(e.target.value)}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={securityLoading}
            className="btn-primary w-full"
          >
            {securityLoading ? 'Loading Logs...' : 'Load Security Log'}
          </button>

          {securityError && <p className="text-sm text-red-600 dark:text-red-300">{securityError}</p>}
          {securityStatus && <p className="text-sm text-green-700 dark:text-emerald-300">{securityStatus}</p>}

          {securityLogs.length > 0 && (
            <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-slate-800 dark:bg-slate-900">
              {securityLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">{formatLogTime(log.timestamp)}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{log.summary || 'Team update'}</p>
                  {Array.isArray(log.details) && log.details.length > 0 && (
                    <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">{log.details.join(' · ')}</p>
                  )}
                  {log.snapshotKey && (
                    <button
                      type="button"
                      onClick={() => handleRestoreLog(log.id)}
                      disabled={restoringLogId === log.id}
                      className="mt-2 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                    >
                      {restoringLogId === log.id ? 'Restoring...' : 'Restore This Snapshot'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
