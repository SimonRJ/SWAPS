export function normalizeImageUrl(value) {
  const raw = (value || '').trim();
  if (!raw) return '';

  const withProtocol = raw.startsWith('//') ? `https:${raw}` : raw;

  try {
    const url = new URL(withProtocol);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return '';
  }
}

export function firstValidLogoUrl(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate);
    if (normalized) return normalized;
  }
  return '';
}

export function getInitials(name, fallback = '?') {
  const cleaned = (name || '').trim();
  if (!cleaned) return fallback;
  const initials = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() || '')
    .join('');
  return initials || fallback;
}
