export function normalizeShirtNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 2);
}
