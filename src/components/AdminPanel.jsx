import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDefaultData } from '../utils/storage.js';
import LogoImageInput from './LogoImageInput.jsx';
import { getClubById } from '../utils/clubLogos.js';
import {
  createTeam,
  completeAdminRequest,
  deleteTeamByAdmin,
  listAdminRequests,
  listAdminTeams,
  listSecurityLogs,
  listTeamCodes,
  restoreFromSecurityLog,
  submitAdminRequest,
  updateAdminTeamLimit,
} from '../utils/netlifyData.js';

const MIN_TEAM_CODE_LENGTH = 3;
const MAX_TEAM_CODE_LENGTH = 24;
const FIXED_CLUB_ID = 'murdoch-melville';
const FIXED_CLUB = {
  id: FIXED_CLUB_ID,
  name: 'Murdoch University Melville FC',
  logoUrl: getClubById(FIXED_CLUB_ID)?.logoUrl || 'https://mumfc.com.au/favicon.ico',
};

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
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [createPasscode, setCreatePasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [teamCodes, setTeamCodes] = useState([]);
  const [loadingTeamCodes, setLoadingTeamCodes] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [limitError, setLimitError] = useState('');
  const [limitStatus, setLimitStatus] = useState('');
  const [limitRequesting, setLimitRequesting] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [deleteSucceeded, setDeleteSucceeded] = useState(false);
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityUnlocked, setSecurityUnlocked] = useState(false);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [securityTeams, setSecurityTeams] = useState([]);
  const [activeSecurityTeamId, setActiveSecurityTeamId] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityStatus, setSecurityStatus] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [restoringLogId, setRestoringLogId] = useState('');
  const [requestEntries, setRequestEntries] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsStatus, setRequestsStatus] = useState('');
  const [requestsError, setRequestsError] = useState('');
  const [maxTeams, setMaxTeams] = useState(10);
  const [maxTeamsInput, setMaxTeamsInput] = useState('10');
  const [maxTeamsStatus, setMaxTeamsStatus] = useState('');
  const [maxTeamsError, setMaxTeamsError] = useState('');

  const refreshTeamCodes = useCallback(async () => {
    setLoadingTeamCodes(true);
    try {
      const codes = await listTeamCodes();
      const nextCodes = Array.isArray(codes) ? codes : [];
      setTeamCodes(nextCodes);
      setDeleteTeamId(prev => (prev ? prev : nextCodes[0] || ''));
    } catch {
      setTeamCodes([]);
    } finally {
      setLoadingTeamCodes(false);
    }
  }, []);

  const refreshAdminOverview = useCallback(async (adminPassword) => {
    const overview = await listAdminTeams(adminPassword);
    const teams = Array.isArray(overview?.teams) ? overview.teams : [];
    const nextMaxTeams = Number(overview?.maxTeams) || 10;
    setSecurityTeams(teams);
    setMaxTeams(nextMaxTeams);
    setMaxTeamsInput(String(nextMaxTeams));
    return teams;
  }, []);

  useEffect(() => {
    refreshTeamCodes();
  }, [refreshTeamCodes]);

  const selectedClub = FIXED_CLUB;
  const sortedTeamCodes = useMemo(() => [...teamCodes].sort((a, b) => a.localeCompare(b)), [teamCodes]);
  const passcodeByTeamId = useMemo(
    () => new Map((securityTeams || []).map(teamEntry => [teamEntry.teamId, teamEntry.passcode || ''])),
    [securityTeams],
  );

  async function handleCreate(e) {
    e.preventDefault();
    const normalizedTeamCode = normalizeTeamCode(createTeamCode);
    const finalTeamName = teamName.trim();
    const trimmedPasscode = createPasscode.trim();

    if (!finalTeamName) {
      setError('Enter a team name.');
      setStatus('');
      setLimitError('');
      return;
    }
    if (!normalizedTeamCode) {
      setError('Create a team code.');
      setStatus('');
      setLimitError('');
      return;
    }
    if (normalizedTeamCode.length < MIN_TEAM_CODE_LENGTH) {
      setError(`Team code must be at least ${MIN_TEAM_CODE_LENGTH} characters.`);
      setStatus('');
      setLimitError('');
      return;
    }
    if (!trimmedPasscode) {
      setError('Enter a passcode.');
      setStatus('');
      setLimitError('');
      return;
    }
    if (trimmedPasscode.length < 4 || trimmedPasscode.length > 12) {
      setError('Passcode must be 4 - 12 characters.');
      setStatus('');
      setLimitError('');
      return;
    }
    if (trimmedPasscode !== confirmPasscode.trim()) {
      setError('Passcodes do not match.');
      setStatus('');
      setLimitError('');
      return;
    }

    setCreateLoading(true);
    setError('');
    setStatus('');
    setLimitError('');
    setLimitStatus('');

    try {
      const baseData = await getDefaultData({
        name: finalTeamName,
        clubId: selectedClub?.id || '',
        logoUrl: teamLogoUrl || selectedClub?.logoUrl || '',
      }, trimmedPasscode);

      await createTeam({
        teamId: normalizedTeamCode,
        passcode: trimmedPasscode,
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
      setConfirmPasscode('');
      setDeleteStatus('');
      setDeleteSucceeded(false);
      setLimitError('');
      setLimitStatus('');
      await refreshTeamCodes();
      setDeleteTeamId(normalizedTeamCode);
      if (securityUnlocked && securityPassword.trim()) {
        try {
          await refreshAdminOverview(securityPassword.trim());
        } catch {
          // ignore refresh errors
        }
      }
    } catch (createError) {
      if (createError?.code === 'TEAM_EXISTS') {
        setError('Team code already exists. Choose another code.');
      } else if (createError?.code === 'TEAM_LIMIT_REACHED') {
        const maxTeamsReached = createError?.details?.maxTeams ?? createError?.maxTeams ?? null;
        const limitMessage = maxTeamsReached
          ? `Maximum allowable teams (${maxTeamsReached}) have been created.`
          : 'Maximum allowable teams have been created.';
        setError(createError.message || limitMessage);
        setLimitError(limitMessage);
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
    if (!securityUnlocked) {
      setDeleteStatus('Unlock the security log to delete a team.');
      setDeleteSucceeded(false);
      return;
    }
    if (!securityPassword.trim()) {
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
      await deleteTeamByAdmin(normalizedTeamId, securityPassword.trim());
      await refreshTeamCodes();
      setDeleteStatus(`Team ${normalizedTeamId} was deleted.`);
      setDeleteSucceeded(true);
      setDeleteTeamId('');
      if (securityUnlocked && securityPassword.trim()) {
        try {
          await refreshAdminOverview(securityPassword.trim());
        } catch {
          // ignore refresh errors
        }
      }
    } catch (deleteError) {
      setDeleteStatus(deleteError.message || 'Unable to delete team.');
      setDeleteSucceeded(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleUnlockSecurity(e) {
    e.preventDefault();
    if (!securityPassword.trim()) {
      setSecurityError('Enter the administrator password.');
      setSecurityStatus('');
      return;
    }

    setSecurityLoading(true);
    setSecurityError('');
    setSecurityStatus('');
    try {
      await refreshAdminOverview(securityPassword.trim());
      setSecurityUnlocked(true);
      setSecurityStatus('Security log unlocked.');
    } catch (loadError) {
      setSecurityUnlocked(false);
      setSecurityTeams([]);
      setSecurityError(loadError.message || 'Unable to unlock security log.');
    } finally {
      setSecurityLoading(false);
    }
  }

  async function handleLoadSecurityLogs(teamId) {
    const normalizedTeamId = normalizeTeamCode(teamId);
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
      setActiveSecurityTeamId(normalizedTeamId);
      setSecurityStatus(entries.length > 0 ? `Loaded ${entries.length} log entries.` : 'No security log entries yet.');
    } catch (loadError) {
      setSecurityLogs([]);
      setSecurityError(loadError.message || 'Unable to load security logs.');
    } finally {
      setSecurityLoading(false);
    }
  }

  async function handleLoadRequests() {
    if (!securityPassword.trim()) {
      setRequestsError('Enter the administrator password.');
      return;
    }
    setRequestsLoading(true);
    setRequestsError('');
    setRequestsStatus('');
    try {
      const entries = await listAdminRequests(securityPassword.trim());
      setRequestEntries(entries);
      setRequestsStatus(entries.length > 0 ? `Loaded ${entries.length} request(s).` : 'No requests yet.');
    } catch (loadError) {
      setRequestsError(loadError.message || 'Unable to load requests.');
    } finally {
      setRequestsLoading(false);
    }
  }

  async function handleCompleteRequest(requestId) {
    if (!securityPassword.trim()) {
      setRequestsError('Enter the administrator password.');
      return;
    }
    try {
      await completeAdminRequest(requestId, securityPassword.trim());
      setRequestEntries(prev => prev.map(entry => (
        entry.id === requestId
          ? { ...entry, status: 'completed', completedAt: new Date().toISOString() }
          : entry
      )));
    } catch (completeError) {
      setRequestsError(completeError.message || 'Unable to mark request completed.');
    }
  }

  async function handleUpdateTeamLimit(e) {
    e.preventDefault();
    if (!securityPassword.trim()) {
      setMaxTeamsError('Enter the administrator password.');
      setMaxTeamsStatus('');
      return;
    }
    const desiredMax = Number(maxTeamsInput);
    if (!Number.isFinite(desiredMax) || desiredMax <= 0) {
      setMaxTeamsError('Enter a valid maximum team count.');
      setMaxTeamsStatus('');
      return;
    }
    setMaxTeamsError('');
    setMaxTeamsStatus('');
    try {
      const updatedMax = await updateAdminTeamLimit(desiredMax, securityPassword.trim());
      setMaxTeams(updatedMax);
      setMaxTeamsInput(String(updatedMax));
      setMaxTeamsStatus('Maximum team count updated.');
    } catch (updateError) {
      setMaxTeamsError(updateError.message || 'Unable to update maximum team count.');
    }
  }

  async function handleSendLimitRequest() {
    if (!createTeamCode && !teamName) {
      setLimitError('Add a team name or code before requesting.');
      return;
    }
    setLimitRequesting(true);
    setLimitError('');
    setLimitStatus('');
    try {
      await submitAdminRequest({
        requestType: 'team_limit',
        teamName: teamName.trim(),
        description: `Request to create team ${normalizeTeamCode(createTeamCode) || '(new team)'}.`,
        details: [
          teamName.trim() ? `Team name: ${teamName.trim()}` : '',
          createTeamCode ? `Team code: ${normalizeTeamCode(createTeamCode)}` : '',
        ].filter(Boolean),
      });
      setLimitStatus('Admin has been notified of request.');
    } catch (requestError) {
      setLimitError(requestError.message || 'Unable to send request.');
    } finally {
      setLimitRequesting(false);
    }
  }

  async function handleRestoreLog(logId) {
    const normalizedTeamId = normalizeTeamCode(activeSecurityTeamId);
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
            <div className="input-field flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{selectedClub?.name}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-slate-400">Fixed</span>
            </div>
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
              placeholder="4 - 12 characters"
              value={createPasscode}
              onChange={e => setCreatePasscode(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Confirm Passcode</label>
            <input
              type="password"
              className="input-field"
              placeholder="Re-enter passcode"
              value={confirmPasscode}
              onChange={e => setConfirmPasscode(e.target.value)}
              autoComplete="new-password"
              onCopy={e => e.preventDefault()}
              onCut={e => e.preventDefault()}
              onPaste={e => e.preventDefault()}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {status && <p className="text-sm text-green-700">{status}</p>}
          {limitError && <p className="text-sm text-red-600">{limitError}</p>}
          {limitStatus && <p className="text-sm text-green-700">{limitStatus}</p>}

          <button type="submit" disabled={createLoading} className="btn-primary w-full">
            {createLoading ? 'Creating...' : 'Create Team'}
          </button>
          {limitError && (
            <button
              type="button"
              onClick={handleSendLimitRequest}
              disabled={limitRequesting}
              className="w-full rounded-xl border border-pitch-300 px-4 py-2 text-sm font-semibold text-pitch-700 transition-colors hover:bg-pitch-50 disabled:opacity-60"
            >
              {limitRequesting ? 'Requesting...' : 'Send request to admin'}
            </button>
          )}
        </form>

        <div className="mt-6 border-t border-gray-200 pt-5 space-y-4 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-slate-400">Security Log</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Tracks key team changes, admin requests, and lets an admin restore earlier snapshots.
            </p>
          </div>

          {!securityUnlocked ? (
            <form onSubmit={handleUnlockSecurity} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Administrator Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Administrator password"
                  value={securityPassword}
                  onChange={e => setSecurityPassword(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button type="submit" disabled={securityLoading} className="btn-primary w-full">
                {securityLoading ? 'Unlocking...' : 'Unlock Security Log'}
              </button>
              {securityError && <p className="text-sm text-red-600 dark:text-red-300">{securityError}</p>}
              {securityStatus && <p className="text-sm text-green-700 dark:text-emerald-300">{securityStatus}</p>}
            </form>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-slate-400">Teams & Passcodes</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {securityTeams.length} team{securityTeams.length === 1 ? '' : 's'} · max {maxTeams}
                  </p>
                </div>
                {securityTeams.length === 0 ? (
                  <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">No teams found yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {securityTeams.map(teamEntry => (
                      <div key={teamEntry.teamId} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{teamEntry.teamId}</p>
                          <button
                            type="button"
                            onClick={() => handleLoadSecurityLogs(teamEntry.teamId)}
                            disabled={securityLoading}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              activeSecurityTeamId === teamEntry.teamId
                                ? 'bg-pitch-600 text-white'
                                : 'border border-pitch-200 text-pitch-700 hover:bg-pitch-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/40'
                            }`}
                          >
                            {activeSecurityTeamId === teamEntry.teamId ? 'Viewing Logs' : 'View Logs'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-slate-300">
                          Passcode: {teamEntry.passcode || 'Not stored'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
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
              </div>

              <form onSubmit={handleDeleteTeam} className="space-y-3">
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

              <form onSubmit={handleUpdateTeamLimit} className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-slate-400">Team Limit</p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Maximum Teams Allowed</label>
                  <input
                    type="number"
                    min={1}
                    className="input-field"
                    value={maxTeamsInput}
                    onChange={e => setMaxTeamsInput(e.target.value)}
                  />
                </div>
                {maxTeamsError && <p className="text-sm text-red-600 dark:text-red-300">{maxTeamsError}</p>}
                {maxTeamsStatus && <p className="text-sm text-green-700 dark:text-emerald-300">{maxTeamsStatus}</p>}
                <button type="submit" className="btn-primary w-full">Update Team Limit</button>
              </form>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-slate-400">Requests</p>
                  <button
                    type="button"
                    onClick={handleLoadRequests}
                    disabled={requestsLoading}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {requestsLoading ? 'Loading...' : 'Load Requests'}
                  </button>
                </div>
                {requestsError && <p className="text-sm text-red-600 dark:text-red-300">{requestsError}</p>}
                {requestsStatus && <p className="text-sm text-green-700 dark:text-emerald-300">{requestsStatus}</p>}
                {requestEntries.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                    {requestEntries.map(request => {
                      const passcode = passcodeByTeamId.get(request.teamId) || '';
                      return (
                        <div key={request.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                              {request.type === 'delete_game' ? 'Delete game request' : 'Team request'}
                            </p>
                            <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              request.status === 'completed'
                                ? 'text-emerald-600 dark:text-emerald-300'
                                : 'text-amber-600 dark:text-amber-300'
                            }`}>
                              {request.status === 'completed' ? 'Completed' : 'Open'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">
                            Team: {request.teamId || 'Unknown'}{request.teamName ? ` · ${request.teamName}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">
                            Passcode: {passcode || 'Not stored'}
                          </p>
                          {request.description && (
                            <p className="mt-2 text-xs text-gray-700 dark:text-slate-200">{request.description}</p>
                          )}
                          {Array.isArray(request.details) && request.details.length > 0 && (
                            <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">{request.details.join(' · ')}</p>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-slate-400">
                            <span>{formatLogTime(request.createdAt)}</span>
                            <button
                              type="button"
                              onClick={() => handleCompleteRequest(request.id)}
                              disabled={request.status === 'completed'}
                              className="rounded-lg border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                            >
                              {request.status === 'completed' ? 'Completed' : 'Mark Complete'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
