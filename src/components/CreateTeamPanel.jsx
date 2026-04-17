import { useState } from 'react';
import { getDefaultData } from '../utils/storage.js';
import LogoImageInput from './LogoImageInput.jsx';
import { getClubById } from '../utils/clubLogos.js';
import { createTeam, submitAdminRequest } from '../utils/netlifyData.js';

const MIN_TEAM_CODE_LENGTH = 3;
const MAX_TEAM_CODE_LENGTH = 24;
const MIN_PASSCODE_LENGTH = 4;
const MAX_PASSCODE_LENGTH = 12;
const FIXED_CLUB_ID = 'murdoch-melville';
const MURDOCH_LOGO_URL = 'https://mumfc.com.au/favicon.ico';
const FIXED_CLUB = {
  id: FIXED_CLUB_ID,
  name: 'Murdoch University Melville FC',
  logoUrl: getClubById(FIXED_CLUB_ID)?.logoUrl || MURDOCH_LOGO_URL,
};

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_TEAM_CODE_LENGTH);
}

export default function CreateTeamPanel({ onBack }) {
  const [teamName, setTeamName] = useState('');
  const [createTeamCode, setCreateTeamCode] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [createPasscode, setCreatePasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [limitError, setLimitError] = useState('');
  const [limitStatus, setLimitStatus] = useState('');
  const [limitRequesting, setLimitRequesting] = useState(false);

  const selectedClub = FIXED_CLUB;

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
    if (trimmedPasscode.length < MIN_PASSCODE_LENGTH || trimmedPasscode.length > MAX_PASSCODE_LENGTH) {
      setError(`Passcode must be ${MIN_PASSCODE_LENGTH} - ${MAX_PASSCODE_LENGTH} characters.`);
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
      setLimitError('');
      setLimitStatus('');
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

  return (
    <div className="min-h-[100svh] bg-gray-100 dark:bg-slate-950 px-4 py-6 sm:py-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-lg sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">Teams</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Create Team</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400">Set up a new team login for your squad.</p>
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
      </div>
    </div>
  );
}
