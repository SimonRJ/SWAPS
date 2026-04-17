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
    error.details = body;
    if (body.maxTeams !== undefined) {
      error.maxTeams = body.maxTeams;
    }
    throw error;
  }
  return body;
}

export async function createTeam({ teamId, data, passcode }) {
  const result = await callTeamFunction({
    action: 'create',
    teamId,
    data,
    ...(passcode ? { passcode } : {}),
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
  const passcode = String(options?.passcode || '').trim();
  const result = await callTeamFunction({
    action: 'save',
    teamId: session.teamId,
    passcodeHash: session.passcodeHash,
    data,
    ...(adminCode ? { adminCode } : {}),
    ...(passcode ? { passcode } : {}),
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

export async function listRecoverableTeamCodes() {
  const result = await callTeamFunction({
    action: 'listRecoverable',
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

export async function listSecurityLogs(teamId, adminPassword) {
  const result = await callTeamFunction({
    action: 'securityLogList',
    teamId,
    adminPassword,
  });
  return Array.isArray(result.entries) ? result.entries : [];
}

export async function restoreFromSecurityLog(teamId, logId, adminPassword) {
  const result = await callTeamFunction({
    action: 'securityRestore',
    teamId,
    logId,
    adminPassword,
  });
  return Boolean(result.ok);
}

export async function listAdminTeams(adminPassword) {
  const result = await callTeamFunction({
    action: 'adminTeams',
    adminPassword,
  });
  return {
    teams: Array.isArray(result.teams) ? result.teams : [],
    maxTeams: result.maxTeams,
  };
}

export async function updateAdminTeamLimit(maxTeams, adminPassword) {
  const result = await callTeamFunction({
    action: 'adminSettingsUpdate',
    adminPassword,
    maxTeams,
  });
  return result.maxTeams;
}

export async function submitAdminRequest(payload) {
  const result = await callTeamFunction({
    action: 'adminRequestCreate',
    ...payload,
  });
  return Boolean(result.ok);
}

export async function listAdminRequests(adminPassword) {
  const result = await callTeamFunction({
    action: 'adminRequestList',
    adminPassword,
  });
  return Array.isArray(result.requests) ? result.requests : [];
}

export async function completeAdminRequest(requestId, adminPassword) {
  const result = await callTeamFunction({
    action: 'adminRequestComplete',
    adminPassword,
    requestId,
  });
  return Boolean(result.ok);
}
