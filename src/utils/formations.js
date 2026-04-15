// Formations: keyed by number of OUTFIELD players (excludes GK)
// Format: [DEF, MID, ATK]
// First 5 are the most common/important, next 5 are additional options
const FORMATIONS_MAP = {
  5: [
    [2, 1, 2],
    [2, 2, 1],
    [1, 2, 2],
    [3, 1, 1],
    [1, 3, 1],
    [1, 1, 3],
    [3, 2, 0],
    [2, 3, 0],
    [0, 3, 2],
    [0, 2, 3],
  ],
  6: [
    [2, 2, 2],
    [3, 2, 1],
    [2, 3, 1],
    [3, 1, 2],
    [1, 3, 2],
    [2, 1, 3],
    [1, 2, 3],
    [4, 1, 1],
    [1, 4, 1],
    [1, 1, 4],
  ],
  7: [
    [3, 2, 2],
    [2, 3, 2],
    [3, 3, 1],
    [4, 2, 1],
    [2, 2, 3],
    [4, 1, 2],
    [1, 4, 2],
    [2, 4, 1],
    [1, 3, 3],
    [3, 1, 3],
  ],
  8: [
    [3, 3, 2],
    [4, 2, 2],
    [2, 4, 2],
    [4, 3, 1],
    [3, 2, 3],
    [2, 3, 3],
    [3, 4, 1],
    [4, 1, 3],
    [1, 4, 3],
    [2, 2, 4],
  ],
  9: [
    [4, 3, 2],
    [3, 4, 2],
    [4, 4, 1],
    [3, 3, 3],
    [4, 2, 3],
    [3, 2, 4],
    [2, 4, 3],
    [2, 5, 2],
    [5, 3, 1],
    [5, 2, 2],
  ],
  10: [
    [4, 4, 2],
    [4, 3, 3],
    [3, 5, 2],
    [3, 4, 3],
    [4, 2, 4],
    [5, 3, 2],
    [5, 4, 1],
    [3, 3, 4],
    [2, 5, 3],
    [4, 1, 5],
  ],
};

export const POSITION_Y_PERCENT = {
  GK: 88,
  DEF: 70,
  MID: 47,
  ATK: 24,
};

const POSITION_X_SPREAD = {
  GK: 0,
  DEF: 1,
  MID: 0.68,
  ATK: 0.82,
};

const BASE_LINE_OFFSETS = {
  1: [0],
  2: [-18, 18],
  3: [-26, 0, 26],
  4: [-33, -11, 11, 33],
  5: [-38, -19, 0, 19, 38],
  6: [-40, -24, -8, 8, 24, 40],
};

function evenOffsets(count) {
  if (count <= 1) return [0];
  const min = -40;
  const max = 40;
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + (step * i));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getFormationSlotXPercent(position, index, count) {
  if (count <= 1) return 50;
  const offsets = BASE_LINE_OFFSETS[count] || evenOffsets(count);
  const safeIndex = clamp(index, 0, offsets.length - 1);
  const spread = POSITION_X_SPREAD[position] ?? 0.82;
  const xPct = 50 + (offsets[safeIndex] * spread);
  return clamp(xPct, 8, 92);
}

export function getFormations(fieldPlayers) {
  return FORMATIONS_MAP[fieldPlayers] || FORMATIONS_MAP[8];
}

export function formatFormation(arr) {
  return arr.join('-');
}

export function parseFormation(str) {
  return str.split('-').map(Number);
}

// Returns array of position strings for a formation
// e.g. [2,2,2] => ['GK','DEF','DEF','MID','MID','ATK','ATK']
export function formationToPositions(formation) {
  const [def, mid, atk] = formation;
  const positions = ['GK'];
  for (let i = 0; i < def; i++) positions.push('DEF');
  for (let i = 0; i < mid; i++) positions.push('MID');
  for (let i = 0; i < atk; i++) positions.push('ATK');
  return positions;
}
