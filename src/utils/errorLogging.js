export const ERROR_LOG_EVENT = 'swaps-error-log';
const ERROR_LOG_KEY = 'swapsErrorLogs';
const MAX_LOG_ENTRIES = 50;
const MAX_FIELD_LENGTH = 2000;
let entryCounter = 0;

function buildEntryId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  entryCounter = (entryCounter + 1) % 100000;
  const perfNow = typeof performance !== 'undefined' ? Math.round(performance.now() * 1000) : 0;
  return `${Date.now()}-${perfNow}-${entryCounter}`;
}

function truncate(value, maxLength = MAX_FIELD_LENGTH) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function safeClone(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncate(value);
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return truncate(value);
  }
}

function readLogs() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(entries) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage write errors
  }
}

export function recordClientError({
  message,
  name,
  stack,
  source,
  status,
  code,
  details,
  action,
  teamId,
  url,
  context,
} = {}) {
  const statusValue = Number(status);
  const entry = {
    id: buildEntryId(),
    timestamp: new Date().toISOString(),
    message: truncate(message || 'Unknown error'),
    name: truncate(name),
    stack: truncate(stack),
    source: truncate(source),
    code: truncate(code),
    action: truncate(action),
    teamId: truncate(teamId),
    url: truncate(url),
    location: typeof window !== 'undefined' ? truncate(window.location.href) : '',
    details: safeClone(details),
    context: safeClone(context),
  };
  if (Number.isFinite(statusValue)) {
    entry.status = statusValue;
  }

  const entries = readLogs();
  entries.unshift(entry);
  writeLogs(entries.slice(0, MAX_LOG_ENTRIES));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ERROR_LOG_EVENT, { detail: entry }));
  }
  return entry;
}

export function getClientErrorLogs() {
  return readLogs();
}

export function clearClientErrorLogs() {
  writeLogs([]);
}

export function downloadClientErrorLogs(filenamePrefix = 'swaps-error-log') {
  if (typeof window === 'undefined') return;
  const entries = readLogs();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `${filenamePrefix}-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
