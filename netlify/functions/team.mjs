import { getStore } from '@netlify/blobs';

const BLOBS_SITE_ID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
const BLOBS_TOKEN = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;

function createStore() {
  // Prefer Netlify runtime auth to avoid token scope mismatches.
  try {
    return getStore('swaps-teams');
  } catch {}

  if (BLOBS_SITE_ID && BLOBS_TOKEN) {
    return getStore({ name: 'swaps-teams', siteID: BLOBS_SITE_ID, token: BLOBS_TOKEN });
  }

  return null;
}

const store = createStore();
const ADMIN_DELETE_PASSWORD = process.env.ADMIN_DELETE_PASSWORD;
const ADMIN_TEAM_PASSWORD_CODE = process.env.ADMIN_TEAM_PASSWORD_CODE || ADMIN_DELETE_PASSWORD;
const SECURITY_LOG_PREFIX = 'security-logs/';
const SECURITY_SNAPSHOT_PREFIX = 'security-snapshots/';
const DELETED_TEAM_PREFIX = 'deleted-teams/';
const ADMIN_REQUEST_PREFIX = 'admin-requests/';
const TEAM_PASSCODE_PREFIX = 'team-passcodes/';
const ADMIN_SETTINGS_KEY = 'admin-settings';
const DEFAULT_MAX_TEAMS = 10;
const MAX_ALLOWED_TEAMS = 100;
const MAX_REQUEST_ENTRIES = 200;

function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}

function normalizeTeamId(value) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
  return normalized;
}

function teamKey(teamId) {
  return `teams/${teamId}`;
}

function securityLogKey(teamId, logId) {
  return `${SECURITY_LOG_PREFIX}${teamId}/${logId}`;
}

function securitySnapshotKey(teamId, logId) {
  return `${SECURITY_SNAPSHOT_PREFIX}${teamId}/${logId}`;
}

function deletedTeamKey(teamId) {
  return `${DELETED_TEAM_PREFIX}${teamId}`;
}

function adminRequestKey(requestId) {
  return `${ADMIN_REQUEST_PREFIX}${requestId}`;
}

function teamPasscodeKey(teamId) {
  return `${TEAM_PASSCODE_PREFIX}${teamId}`;
}

function normalizeMaxTeams(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1) return 1;
  return Math.min(rounded, MAX_ALLOWED_TEAMS);
}

function buildLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeNames(names) {
  if (!names.length) return '';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

function areSchedulesEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function buildImportantEvents(previous, next) {
  const events = [];
  const prevTeam = previous?.team || {};
  const nextTeam = next?.team || {};
  const prevPlayers = Array.isArray(previous?.players) ? previous.players : [];
  const nextPlayers = Array.isArray(next?.players) ? next.players : [];
  const prevGames = Array.isArray(previous?.gameHistory) ? previous.gameHistory : [];
  const nextGames = Array.isArray(next?.gameHistory) ? next.gameHistory : [];
  const prevCancelled = Array.isArray(previous?.cancelledGameDetails) ? previous.cancelledGameDetails : [];
  const nextCancelled = Array.isArray(next?.cancelledGameDetails) ? next.cancelledGameDetails : [];

  if ((prevTeam.name || '') !== (nextTeam.name || '')) {
    events.push(`Team name changed to ${nextTeam.name || 'Unnamed team'}.`);
  }
  if ((prevTeam.logoUrl || '') !== (nextTeam.logoUrl || '')) {
    events.push('Team logo was updated.');
  }
  if ((prevTeam.fieldPlayers || 0) !== (nextTeam.fieldPlayers || 0)) {
    events.push(`Field player count changed from ${prevTeam.fieldPlayers || 0} to ${nextTeam.fieldPlayers || 0}.`);
  }
  if ((prevTeam.gamesPerSeason || 0) !== (nextTeam.gamesPerSeason || 0)) {
    events.push(`Season game count changed from ${prevTeam.gamesPerSeason || 0} to ${nextTeam.gamesPerSeason || 0}.`);
  }
  if ((prevTeam.passcodeHash || '') !== (nextTeam.passcodeHash || '')) {
    events.push('Team passcode was changed.');
  }
  if (!areSchedulesEqual(previous?.seasonSchedule, next?.seasonSchedule)) {
    events.push('Season schedule was updated.');
  }

  const prevById = new Map(prevPlayers.map(player => [player.id, player]));
  const nextById = new Map(nextPlayers.map(player => [player.id, player]));
  const removedPlayers = prevPlayers.filter(player => !nextById.has(player.id));
  const addedPlayers = nextPlayers.filter(player => !prevById.has(player.id));

  if (removedPlayers.length > 0) {
    events.push(`Removed player${removedPlayers.length === 1 ? '' : 's'}: ${summarizeNames(removedPlayers.map(player => player.name || 'Unknown'))}.`);
  }
  if (addedPlayers.length > 0) {
    events.push(`Added player${addedPlayers.length === 1 ? '' : 's'}: ${summarizeNames(addedPlayers.map(player => player.name || 'Unknown'))}.`);
  }

  let renamedCount = 0;
  let statusChangedCount = 0;
  let shirtChangedCount = 0;
  for (const nextPlayer of nextPlayers) {
    const prevPlayer = prevById.get(nextPlayer.id);
    if (!prevPlayer) continue;
    if ((prevPlayer.name || '') !== (nextPlayer.name || '')) renamedCount += 1;
    if (Boolean(prevPlayer.isActive) !== Boolean(nextPlayer.isActive)) statusChangedCount += 1;
    if (String(prevPlayer.shirtNumber || '') !== String(nextPlayer.shirtNumber || '')) shirtChangedCount += 1;
  }
  if (renamedCount > 0) {
    events.push(`Renamed ${renamedCount} player${renamedCount === 1 ? '' : 's'}.`);
  }
  if (statusChangedCount > 0) {
    events.push(`Changed active status for ${statusChangedCount} player${statusChangedCount === 1 ? '' : 's'}.`);
  }
  if (shirtChangedCount > 0) {
    events.push(`Updated shirt number${shirtChangedCount === 1 ? '' : 's'} for ${shirtChangedCount} player${shirtChangedCount === 1 ? '' : 's'}.`);
  }

  if (nextGames.length > prevGames.length) {
    const difference = nextGames.length - prevGames.length;
    events.push(`Added ${difference} completed game${difference === 1 ? '' : 's'} to history.`);
  }
  if (nextGames.length < prevGames.length) {
    const difference = prevGames.length - nextGames.length;
    events.push(`Deleted ${difference} game${difference === 1 ? '' : 's'} from history.`);
  }
  if (nextGames.length === prevGames.length && JSON.stringify(prevGames) !== JSON.stringify(nextGames)) {
    events.push('Updated game history details.');
  }
  if (nextCancelled.length !== prevCancelled.length) {
    events.push('Updated cancelled game records.');
  }
  if (!previous?.currentGame && next?.currentGame) {
    events.push(`Started live game ${next.currentGame.gameNumber || ''}.`.trim());
  }
  if (previous?.currentGame && !next?.currentGame) {
    events.push('Ended live game session.');
  }

  return events;
}

async function listSecurityLogsForTeam(teamId) {
  const entries = [];
  let cursor;
  const prefix = `${SECURITY_LOG_PREFIX}${teamId}/`;

  do {
    const page = await store.list({ prefix, cursor });
    for (const blob of page?.blobs || []) {
      if (!blob?.key) continue;
      const entry = await store.get(blob.key, { type: 'json' });
      if (entry) entries.push(entry);
    }
    cursor = page?.cursor;
  } while (cursor);

  entries.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  return entries.slice(0, 120);
}

async function listActiveTeamCodes() {
  const teamCodes = [];
  let cursor;

  do {
    const page = await store.list({ prefix: 'teams/', cursor });
    for (const blob of page?.blobs || []) {
      if (!blob?.key) continue;
      const code = blob.key.replace(/^teams\//, '');
      if (code) teamCodes.push(code);
    }
    cursor = page?.cursor;
  } while (cursor);

  return teamCodes;
}

async function listTeamIdsFromNestedPrefix(prefix) {
  const teamIds = new Set();
  let cursor;

  do {
    const page = await store.list({ prefix, cursor });
    for (const blob of page?.blobs || []) {
      if (!blob?.key) continue;
      const relative = blob.key.slice(prefix.length);
      const teamId = normalizeTeamId(relative.split('/')[0] || '');
      if (teamId) teamIds.add(teamId);
    }
    cursor = page?.cursor;
  } while (cursor);

  return teamIds;
}

async function listDeletedTeamCodes() {
  const teamIds = [];
  let cursor;

  do {
    const page = await store.list({ prefix: DELETED_TEAM_PREFIX, cursor });
    for (const blob of page?.blobs || []) {
      if (!blob?.key) continue;
      const code = normalizeTeamId(blob.key.replace(new RegExp(`^${DELETED_TEAM_PREFIX}`), ''));
      if (code) teamIds.push(code);
    }
    cursor = page?.cursor;
  } while (cursor);

  return teamIds;
}

async function getAdminSettings() {
  const settings = await store.get(ADMIN_SETTINGS_KEY, { type: 'json' });
  const maxTeams = normalizeMaxTeams(settings?.maxTeams);
  return { maxTeams: maxTeams ?? DEFAULT_MAX_TEAMS };
}

async function setAdminSettings(nextSettings) {
  await store.setJSON(ADMIN_SETTINGS_KEY, nextSettings);
}

async function listTeamPasscodes() {
  const entries = [];
  let cursor;
  do {
    const page = await store.list({ prefix: TEAM_PASSCODE_PREFIX, cursor });
    for (const blob of page?.blobs || []) {
      if (!blob?.key) continue;
      const entry = await store.get(blob.key, { type: 'json' });
      if (entry) entries.push(entry);
    }
    cursor = page?.cursor;
  } while (cursor);
  return entries;
}

async function listAdminRequests() {
  const entries = [];
  let cursor;
  do {
    const page = await store.list({ prefix: ADMIN_REQUEST_PREFIX, cursor });
    for (const blob of page?.blobs || []) {
      if (!blob?.key) continue;
      const entry = await store.get(blob.key, { type: 'json' });
      if (entry) entries.push(entry);
    }
    cursor = page?.cursor;
  } while (cursor);
  for (const entry of entries) {
    entry._createdAtMs = Date.parse(entry.createdAt || '') || 0;
  }
  entries.sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0));
  for (const entry of entries) {
    delete entry._createdAtMs;
  }
  return entries.slice(0, MAX_REQUEST_ENTRIES);
}

function validateDataShape(data) {
  return Boolean(data && data.team && typeof data.team.passcodeHash === 'string');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  if (!store) {
    return jsonResponse({ error: 'Blob storage is not configured for this environment.' }, 500);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const action = payload?.action;
  if (action === 'list') {
    const teamCodes = await listActiveTeamCodes();
    teamCodes.sort((a, b) => a.localeCompare(b));
    return jsonResponse({ teamCodes });
  }

  if (action === 'listRecoverable') {
    const [activeTeamCodes, deletedTeamCodes, securityLogTeamIds, securitySnapshotTeamIds] = await Promise.all([
      listActiveTeamCodes(),
      listDeletedTeamCodes(),
      listTeamIdsFromNestedPrefix(SECURITY_LOG_PREFIX),
      listTeamIdsFromNestedPrefix(SECURITY_SNAPSHOT_PREFIX),
    ]);
    const teamCodes = [
      ...new Set([
        ...activeTeamCodes,
        ...deletedTeamCodes,
        ...Array.from(securityLogTeamIds),
        ...Array.from(securitySnapshotTeamIds),
      ]),
    ];
    teamCodes.sort((a, b) => a.localeCompare(b));
    return jsonResponse({ teamCodes });
  }

  if (action === 'adminRequestCreate') {
    const requestType = String(payload?.requestType || 'general').trim() || 'general';
    const requestId = buildLogId();
    const teamId = normalizeTeamId(payload?.teamId);
    const teamName = String(payload?.teamName || '').trim();
    const description = String(payload?.description || '').trim();
    const details = Array.isArray(payload?.details)
      ? payload.details.filter(Boolean).map(detail => String(detail))
      : [];
    const entry = {
      id: requestId,
      type: requestType,
      teamId,
      teamName,
      description,
      details,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(adminRequestKey(requestId), entry);
    return jsonResponse({ ok: true, requestId });
  }

  if (action === 'adminTeams' || action === 'adminRequestList' || action === 'adminRequestComplete' || action === 'adminSettingsUpdate') {
    if (!ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Administrator delete password is not configured.' }, 500);
    }
    const adminPassword = String(payload?.adminPassword || '');
    if (adminPassword !== ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Invalid administrator password.', code: 'INVALID_ADMIN_PASSWORD' }, 401);
    }

    if (action === 'adminTeams') {
      const [activeTeamCodes, passcodeEntries, settings] = await Promise.all([
        listActiveTeamCodes(),
        listTeamPasscodes(),
        getAdminSettings(),
      ]);
      const passcodeById = new Map(
        passcodeEntries.map(entry => [normalizeTeamId(entry?.teamId), entry?.passcode || '']),
      );
      const teams = activeTeamCodes
        .sort((a, b) => a.localeCompare(b))
        .map(teamCode => ({
          teamId: teamCode,
          passcode: passcodeById.get(teamCode) || '',
        }));
      return jsonResponse({ teams, maxTeams: settings.maxTeams });
    }

    if (action === 'adminRequestList') {
      const requests = await listAdminRequests();
      return jsonResponse({ requests });
    }

    if (action === 'adminRequestComplete') {
      const requestId = String(payload?.requestId || '').trim();
      if (!requestId) return jsonResponse({ error: 'Request ID is required.' }, 400);
      const existing = await store.get(adminRequestKey(requestId), { type: 'json' });
      if (!existing) return jsonResponse({ error: 'Request not found.' }, 404);
      const updated = {
        ...existing,
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      await store.setJSON(adminRequestKey(requestId), updated);
      return jsonResponse({ ok: true });
    }

    if (action === 'adminSettingsUpdate') {
      const normalizedMaxTeams = normalizeMaxTeams(payload?.maxTeams);
      if (!normalizedMaxTeams) {
        return jsonResponse({ error: 'Valid maximum team count is required.' }, 400);
      }
      await setAdminSettings({ maxTeams: normalizedMaxTeams });
      return jsonResponse({ maxTeams: normalizedMaxTeams });
    }
  }

  const teamId = normalizeTeamId(payload?.teamId);
  if (!teamId) return jsonResponse({ error: 'Team code is required.' }, 400);

  const key = teamKey(teamId);

  if (action === 'create') {
    const data = payload?.data;
    if (!validateDataShape(data)) {
      return jsonResponse({ error: 'Invalid team data.' }, 400);
    }
    const settings = await getAdminSettings();
    const activeTeamCodes = await listActiveTeamCodes();
    if (activeTeamCodes.length >= settings.maxTeams) {
      return jsonResponse({
        error: 'Maximum allowable teams have been created.',
        code: 'TEAM_LIMIT_REACHED',
        maxTeams: settings.maxTeams,
      }, 409);
    }
    const existing = await store.get(key, { type: 'json' });
    if (existing) {
      return jsonResponse({ error: 'Team code already exists.', code: 'TEAM_EXISTS' }, 409);
    }
    await store.setJSON(key, data);
    const passcode = String(payload?.passcode || '').trim();
    if (passcode) {
      await store.setJSON(teamPasscodeKey(teamId), {
        teamId,
        passcode,
        updatedAt: new Date().toISOString(),
      });
    }
    const logId = buildLogId();
    await store.setJSON(securityLogKey(teamId, logId), {
      id: logId,
      teamId,
      timestamp: new Date().toISOString(),
      type: 'team_create',
      summary: 'Team was created.',
      details: ['Initial team setup was created.'],
      actor: 'team_admin',
    });
    await store.delete(deletedTeamKey(teamId));
    return jsonResponse({ data });
  }

  if (action === 'delete') {
    if (!ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Administrator delete password is not configured.' }, 500);
    }
    const adminPassword = String(payload?.adminPassword || '');
    if (adminPassword !== ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Invalid administrator password.', code: 'INVALID_ADMIN_PASSWORD' }, 401);
    }
    const existing = await store.get(key, { type: 'json' });
    if (!existing) {
      return jsonResponse({ error: 'Team not found.' }, 404);
    }

    const logId = buildLogId();
    const snapshotKey = securitySnapshotKey(teamId, logId);
    await store.setJSON(snapshotKey, existing);
    await store.setJSON(securityLogKey(teamId, logId), {
      id: logId,
      teamId,
      timestamp: new Date().toISOString(),
      type: 'team_delete',
      summary: 'Team was deleted by an administrator.',
      details: ['A full snapshot was captured immediately before deletion.'],
      snapshotKey,
      actor: 'system_admin',
    });
    await store.setJSON(deletedTeamKey(teamId), {
      teamId,
      deletedAt: new Date().toISOString(),
      restoreLogId: logId,
    });
    await store.delete(key);
    return jsonResponse({ ok: true });
  }

  if (action === 'securityLogList' || action === 'securityRestore') {
    if (!ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Administrator delete password is not configured.' }, 500);
    }
    const adminPassword = String(payload?.adminPassword || '');
    if (adminPassword !== ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Invalid administrator password.', code: 'INVALID_ADMIN_PASSWORD' }, 401);
    }
  }

  if (action === 'securityLogList') {
    const entries = await listSecurityLogsForTeam(teamId);
    return jsonResponse({ entries });
  }

  if (action === 'securityRestore') {
    const logId = String(payload?.logId || '').trim();
    if (!logId) return jsonResponse({ error: 'Log entry is required.' }, 400);
    const existing = await store.get(key, { type: 'json' });
    const restoreSource = await store.get(securityLogKey(teamId, logId), { type: 'json' });
    const snapshotKey = restoreSource?.snapshotKey || securitySnapshotKey(teamId, logId);
    const snapshot = await store.get(snapshotKey, { type: 'json' });
    if (!snapshot) {
      return jsonResponse({ error: 'Snapshot not found for this log entry.', code: 'SNAPSHOT_NOT_FOUND' }, 404);
    }

    const restoreLogId = buildLogId();
    const restoreSnapshotKey = securitySnapshotKey(teamId, restoreLogId);
    if (existing) {
      await store.setJSON(restoreSnapshotKey, existing);
    }
    await store.setJSON(key, snapshot);
    await store.setJSON(securityLogKey(teamId, restoreLogId), {
      id: restoreLogId,
      teamId,
      timestamp: new Date().toISOString(),
      type: 'restore',
      summary: 'Restored team data from a security snapshot.',
      details: [`Restored state captured before log ${logId}.`],
      restoredLogId: logId,
      ...(existing ? { snapshotKey: restoreSnapshotKey } : {}),
      actor: 'system_admin',
    });
    await store.delete(deletedTeamKey(teamId));

    return jsonResponse({ ok: true, restoredLogId: logId });
  }

  const existing = await store.get(key, { type: 'json' });
  if (!existing) {
    return jsonResponse({ error: 'Team not found.' }, 404);
  }

  const passcodeHash = String(payload?.passcodeHash || '');
  if (!passcodeHash || existing?.team?.passcodeHash !== passcodeHash) {
    return jsonResponse({ error: 'Invalid passcode.', code: 'INVALID_PASSCODE' }, 401);
  }

  if (action === 'login') {
    return jsonResponse({ data: existing });
  }

  if (action === 'save') {
    const data = payload?.data;
    if (!validateDataShape(data)) {
      return jsonResponse({ error: 'Invalid team data.' }, 400);
    }

    const isPasscodeChange = data.team.passcodeHash !== existing?.team?.passcodeHash;
    if (isPasscodeChange) {
      if (!ADMIN_TEAM_PASSWORD_CODE) {
        return jsonResponse({ error: 'Administrator code is not configured.', code: 'ADMIN_CODE_NOT_CONFIGURED' }, 500);
      }
      const adminCode = String(payload?.adminCode || '');
      if (!adminCode) {
        return jsonResponse({ error: 'Administrator code is required to change the team passcode.', code: 'ADMIN_CODE_REQUIRED' }, 401);
      }
      if (adminCode !== ADMIN_TEAM_PASSWORD_CODE) {
        return jsonResponse({ error: 'Invalid administrator code.', code: 'INVALID_ADMIN_CODE' }, 401);
      }
    }

    const securityEvents = buildImportantEvents(existing, data);
    if (securityEvents.length > 0) {
      const logId = buildLogId();
      const snapshotKey = securitySnapshotKey(teamId, logId);
      await store.setJSON(snapshotKey, existing);
      await store.setJSON(securityLogKey(teamId, logId), {
        id: logId,
        teamId,
        timestamp: new Date().toISOString(),
        type: 'team_update',
        summary: securityEvents[0],
        details: securityEvents.slice(0, 10),
        snapshotKey,
        actorHashSuffix: passcodeHash.slice(-6),
      });
    }

    await store.setJSON(key, data);
    if (isPasscodeChange) {
      const passcode = String(payload?.passcode || '').trim();
      if (passcode) {
        await store.setJSON(teamPasscodeKey(teamId), {
          teamId,
          passcode,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return jsonResponse({ ok: true, passcodeHash: data.team.passcodeHash });
  }

  return jsonResponse({ error: 'Unknown action.' }, 400);
};
