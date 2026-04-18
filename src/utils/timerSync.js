export function getElapsedFromTimerSync(timerSync, nowMs) {
  if (!timerSync || typeof timerSync !== 'object') return null;
  if (timerSync.mode === 'paused') {
    return Math.max(0, Number(timerSync.elapsedSeconds) || 0);
  }
  if (timerSync.mode === 'running' && Number.isFinite(Number(timerSync.startedAtMs))) {
    const deltaSeconds = Math.max(0, Math.floor((nowMs - Number(timerSync.startedAtMs)) / 1000));
    return deltaSeconds;
  }
  return null;
}

export function getReadOnlyElapsed(base, nowMs, gameDurationSeconds) {
  if (!base) return 0;
  const syncedElapsed = getElapsedFromTimerSync(base.timerSync, nowMs);
  if (syncedElapsed !== null) {
    return Math.min(gameDurationSeconds, syncedElapsed);
  }
  const safeElapsed = Math.max(0, Number(base.elapsedSeconds) || 0);
  if (base.isPaused || !base.receivedAtMs) {
    return Math.min(gameDurationSeconds, safeElapsed);
  }
  const deltaSeconds = Math.max(0, Math.floor((nowMs - base.receivedAtMs) / 1000));
  return Math.min(gameDurationSeconds, safeElapsed + deltaSeconds);
}

export function buildTimerSyncState(seconds, paused, nowMs = Date.now()) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (paused) {
    return {
      mode: 'paused',
      elapsedSeconds: safeSeconds,
      timestampMs: safeNowMs,
    };
  }
  return {
    mode: 'running',
    startedAtMs: safeNowMs - (safeSeconds * 1000),
    elapsedSeconds: safeSeconds,
    timestampMs: safeNowMs,
  };
}
