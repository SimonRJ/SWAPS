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
    if (!ADMIN_DELETE_PASSWORD) {
      return jsonResponse({ error: 'Administrator delete password is not configured.' }, 500);
    }
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

    await store.setJSON(key, data);
    return jsonResponse({ ok: true, passcodeHash: data.team.passcodeHash });
  }

  return jsonResponse({ error: 'Unknown action.' }, 400);
};
