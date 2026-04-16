import { getStore } from '@netlify/blobs';

const store = getStore('swaps-teams');
const ADMIN_DELETE_PASSWORD = process.env.ADMIN_DELETE_PASSWORD || '2248';

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

function validateDataShape(data) {
  return Boolean(data && data.team && typeof data.team.passcodeHash === 'string');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const action = payload?.action;
  if (action === 'list') {
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

    teamCodes.sort((a, b) => a.localeCompare(b));
    return jsonResponse({ teamCodes });
  }

  const teamId = normalizeTeamId(payload?.teamId);
  if (!teamId) return jsonResponse({ error: 'Team code is required.' }, 400);

  const key = teamKey(teamId);

  if (action === 'create') {
    const data = payload?.data;
    if (!validateDataShape(data)) {
      return jsonResponse({ error: 'Invalid team data.' }, 400);
    }
    const existing = await store.get(key, { type: 'json' });
    if (existing) {
      return jsonResponse({ error: 'Team code already exists.', code: 'TEAM_EXISTS' }, 409);
    }
    await store.setJSON(key, data);
    return jsonResponse({ data });
  }

  const existing = await store.get(key, { type: 'json' });
  if (!existing) {
    return jsonResponse({ error: 'Team not found.' }, 404);
  }

  if (action === 'delete') {
    const adminPassword = String(payload?.adminPassword || '');
    if (adminPassword !== ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Invalid administrator password.', code: 'INVALID_ADMIN_PASSWORD' }, 401);
    }
    await store.delete(key);
    return jsonResponse({ ok: true });
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
    await store.setJSON(key, data);
    return jsonResponse({ ok: true, passcodeHash: data.team.passcodeHash });
  }

  return jsonResponse({ error: 'Unknown action.' }, 400);
};
