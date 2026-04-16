import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDefaultData } from '../utils/storage.js';
import LogoImageInput from './LogoImageInput.jsx';
import { FOOTBALL_WEST_CLUBS, getClubById } from '../utils/clubLogos.js';
import { createTeam, deleteTeamByAdmin, listTeamCodes } from '../utils/netlifyData.js';

const MIN_TEAM_CODE_LENGTH = 3;
const MAX_TEAM_CODE_LENGTH = 24;

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_TEAM_CODE_LENGTH);
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

  useEffect(() => {
    refreshTeamCodes();
  }, [refreshTeamCodes]);

  const selectedClub = getClubById(clubId);
  const sortedTeamCodes = useMemo(() => [...teamCodes].sort((a, b) => a.localeCompare(b)), [teamCodes]);

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

  return (
    <div className="min-h-[100svh] bg-gray-100 px-4 py-6 sm:py-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-lg sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Admin</p>
            <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-700 hover:bg-gray-100"
          >
            Back to Login
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Club</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Team Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Team name"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Create Team Code</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Choose a Passcode</label>
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

        <form onSubmit={handleDeleteTeam} className="mt-6 border-t border-gray-200 pt-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">Delete Team</p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Team Code</label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Official Password</label>
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
      </div>
    </div>
  );
}
