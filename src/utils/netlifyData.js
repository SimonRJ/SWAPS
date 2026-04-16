import { hashPasscode } from './storage.js';

const TEAM_FUNCTION_URL = '/.netlify/functions/team';

async function callTeamFunction(payload) {
  const response = await fetch(TEAM_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed.');
    error.code = body.code || 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

export async function createTeam({ teamId, data }) {
  const result = await callTeamFunction({
    action: 'create',
    teamId,
    data,
  });
  return {
    data: result.data,
    session: {
      teamId,
      passcodeHash: data.team.passcodeHash,
    },
  };
}

export async function loginWithPasscode(teamId, passcode) {
  const passcodeHash = await hashPasscode(passcode);
  const result = await callTeamFunction({
    action: 'login',
    teamId,
    passcodeHash,
  });
  return {
    data: result.data,
    session: {
      teamId,
      passcodeHash,
    },
  };
}

export async function loginWithSession(session) {
  const result = await callTeamFunction({
    action: 'login',
    teamId: session.teamId,
    passcodeHash: session.passcodeHash,
  });
  return result.data;
}

export async function saveTeamData(session, data, options = {}) {
  const adminCode = String(options?.adminCode || '').trim();
  const result = await callTeamFunction({
    action: 'save',
    teamId: session.teamId,
    passcodeHash: session.passcodeHash,
    data,
    ...(adminCode ? { adminCode } : {}),
  });
  return {
    ...session,
    passcodeHash: result.passcodeHash || session.passcodeHash,
  };
}

export async function listTeamCodes() {
  const result = await callTeamFunction({
    action: 'list',
  });
  return Array.isArray(result.teamCodes) ? result.teamCodes : [];
}

export async function deleteTeamByAdmin(teamId, adminPassword) {
  const result = await callTeamFunction({
    action: 'delete',
    teamId,
    adminPassword,
  });
  return Boolean(result.ok);
}
