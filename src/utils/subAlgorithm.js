import { formationToPositions } from './formations.js';

// Returns minutes for a player in a given position
function getMinutes(player, pos) {
  if (pos === 'GK') return player.minutesGK || 0;
  if (pos === 'DEF') return player.minutesDEF || 0;
  if (pos === 'MID') return player.minutesMID || 0;
  if (pos === 'ATK') return player.minutesATK || 0;
  return 0;
}

function getTotalMinutes(player) {
  return (player.minutesGK || 0) + (player.minutesDEF || 0) +
    (player.minutesMID || 0) + (player.minutesATK || 0);
}

/**
 * Calculate ideal season targets per player.
 * Takes into account: total players, field size, game duration, games per season,
 * and formation shape to produce per-position minute targets.
 *
 * Returns { totalMinutesPerPlayer, targetGK, targetDEF, targetMID, targetATK }
 */
export function calculateSeasonTargets(team, totalPlayers, formation, rotateGK = true) {
  const fieldCount = team.fieldPlayers + 1; // + GK
  const gameDuration = team.gameDuration;
  const gamesPerSeason = team.gamesPerSeason;

  // Total field-minutes across the whole season
  const totalFieldMinutesPerGame = fieldCount * gameDuration;
  const totalFieldMinutesSeason = totalFieldMinutesPerGame * gamesPerSeason;

  // Ideal minutes per player across the season
  const totalMinutesPerPlayer = totalFieldMinutesSeason / totalPlayers;

  // Determine position share from formation
  const [def, mid, atk] = formation;
  const outfield = def + mid + atk;

  // If GK is rotating, include GK target. Otherwise GK target is not required.
  const gkShare = rotateGK ? (1 / fieldCount) : 0;
  const outfieldShare = 1 - gkShare;
  const defShare = (def / outfield) * outfieldShare;
  const midShare = (mid / outfield) * outfieldShare;
  const atkShare = (atk / outfield) * outfieldShare;

  return {
    totalMinutesPerPlayer: Math.round(totalMinutesPerPlayer),
    targetGK: Math.round(totalMinutesPerPlayer * gkShare),
    targetDEF: Math.round(totalMinutesPerPlayer * defShare),
    targetMID: Math.round(totalMinutesPerPlayer * midShare),
    targetATK: Math.round(totalMinutesPerPlayer * atkShare),
  };
}

/**
 * Calculate how far a player is from their ideal season targets.
 * Returns signed values: positive = under-target (needs more), negative = over-target.
 * This ensures over-target players are actively deprioritised for field time.
 */
function getDeficit(player, targets) {
  return {
    GK: targets.targetGK - getMinutes(player, 'GK'),
    DEF: targets.targetDEF - getMinutes(player, 'DEF'),
    MID: targets.targetMID - getMinutes(player, 'MID'),
    ATK: targets.targetATK - getMinutes(player, 'ATK'),
    total: targets.totalMinutesPerPlayer - getTotalMinutes(player),
  };
}


/**
 * Assigns positions to players optimally using a cost-minimisation approach.
 * For each position, the player who is furthest below their season target
 * for that position is preferred.
 */
function assignPositions(playerPool, positions, rotateGK, targets, fixedGKPlayerId) {
  const assignment = [];
  const remaining = [...playerPool];
  const posQueue = [...positions];

  // Handle GK first
  const gkIndex = posQueue.indexOf('GK');
  if (gkIndex !== -1) {
    posQueue.splice(gkIndex, 1);
    if (!rotateGK) {
      let gkIndexFixed = remaining.findIndex(p => p.id === fixedGKPlayerId);
      if (gkIndexFixed === -1) {
        remaining.sort((a, b) => getMinutes(b, 'GK') - getMinutes(a, 'GK'));
        gkIndexFixed = 0;
      }
      const [gkPlayer] = remaining.splice(gkIndexFixed, 1);
      assignment.push({ playerId: gkPlayer.id, position: 'GK' });
    } else {
      if (targets) {
        remaining.sort((a, b) => {
          const defA = getDeficit(a, targets);
          const defB = getDeficit(b, targets);
          const diff = defB.GK - defA.GK;
          if (diff !== 0) return diff;
          return defB.total - defA.total;
        });
      } else {
        remaining.sort((a, b) => getMinutes(a, 'GK') - getMinutes(b, 'GK'));
      }
      const gkPlayer = remaining.shift();
      assignment.push({ playerId: gkPlayer.id, position: 'GK' });
    }
  }

  for (const pos of posQueue) {
    remaining.sort((a, b) => {
      if (targets) {
        const defA = getDeficit(a, targets);
        const defB = getDeficit(b, targets);
        const diff = defB[pos] - defA[pos];
        if (diff !== 0) return diff;
        return defB.total - defA.total;
      }
      const diff = getMinutes(a, pos) - getMinutes(b, pos);
      if (diff !== 0) return diff;
      return getTotalMinutes(a) - getTotalMinutes(b);
    });
    const chosen = remaining.shift();
    assignment.push({ playerId: chosen.id, position: pos });
  }

  return assignment;
}

/**
 * Calculate the minutes that absent players would have been scheduled to play
 * in this game, distributed evenly across positions based on the formation.
 */
export function calculateAbsentPlayerMinutes(absentPlayers, allPlayers, team) {
  const fieldCount = team.fieldPlayers + 1;
  const totalPlayers = allPlayers.length;
  const gameDuration = team.gameDuration;

  if (totalPlayers === 0 || absentPlayers.length === 0) return [];

  const idealMinutesPerGame = (fieldCount * gameDuration) / totalPlayers;

  return absentPlayers.map(p => ({
    playerId: p.id,
    minutesSickInjured: Math.round(idealMinutesPerGame),
  }));
}

// Sentinel value meaning "this player has never been benched during this game"
const NEVER_BENCHED_BLOCK = -999;

// Game rules (per 10-minute block)
const MAX_FIELD_BLOCKS = 4;   // No player on pitch longer than 40 minutes
const MIN_FIELD_BLOCKS = 3;   // No player on pitch less than 30 minutes
const MAX_BENCH_CONSECUTIVE = 1; // No player on bench longer than 10 minutes at a time
const MIN_CONSECUTIVE_BEFORE_BENCH = 1; // Must play 10 consecutive minutes before returning to bench

// Returns true if a player in the given position can be substituted off
function canSubOff(playerId, prevFieldMap, rotateGK) {
  const pos = prevFieldMap.get(playerId);
  // Fixed GK (when GK does not rotate) must never come off
  if (pos === 'GK' && !rotateGK) return false;
  return true;
}

/**
 * Pre-calculates all sub blocks for the entire game.
 * Season-aware: uses deficit-based assignment.
 *
 * Enforced rules:
 * 1. Position-matched subs: the incoming player plays the EXACT same position as the outgoing player
 * 2. No player on the pitch longer than 40 minutes (max 4 blocks)
 * 3. No player on the pitch less than 30 minutes (min 3 blocks)
 * 4. No player on the bench for longer than 10 minutes at a time (max 1 block per bench stint)
 * 5. No player returns to the bench unless they have done at least 10 consecutive minutes on pitch (1 block)
 *
 * Returns array of blocks, each block = { onField: [{playerId, position}], onBench: [playerId] }
 */
export function planGame(availablePlayers, formation, gameDuration, rotateGK, allPlayers, team, fixedGKPlayerId = null, options = {}) {
  const {
    benchStartCounts = {},
    benchProtectedIds = new Set(),
    startingField = null,
    startingBench = null,
  } = options;
  const numBlocks = Math.floor(gameDuration / 10);
  const positions = formationToPositions(formation);
  const fieldCount = positions.length;

  if (availablePlayers.length < fieldCount) return null;

  const benchSize = availablePlayers.length - fieldCount;

  // If no bench players, no subs possible - just assign positions for all blocks
  if (benchSize <= 0) {
    return buildNoBenchPlan(availablePlayers, numBlocks, positions, rotateGK, allPlayers, team, fixedGKPlayerId);
  }

  const totalPlayers = (allPlayers || availablePlayers).length;
  const targets = team
    ? calculateSeasonTargets(team, totalPlayers, formation, rotateGK)
    : null;

  let resolvedGKId = fixedGKPlayerId;
  if (!rotateGK && !resolvedGKId) {
    const sorted = [...availablePlayers].sort(
      (a, b) => (b.minutesGK || 0) - (a.minutesGK || 0),
    );
    resolvedGKId = sorted[0]?.id || null;
  }

  const availableIds = new Set(availablePlayers.map(player => player.id));
  const requiredCounts = positions.reduce((counts, pos) => {
    counts[pos] = (counts[pos] || 0) + 1;
    return counts;
  }, {});

  let startingOverrideField = null;
  let startingOverrideBenchIds = null;
  if (Array.isArray(startingField) && startingField.length === fieldCount) {
    const fieldIds = new Set();
    const fieldCounts = {};
    let valid = true;
    for (const entry of startingField) {
      if (!entry?.playerId || !entry?.position) { valid = false; break; }
      if (!availableIds.has(entry.playerId)) { valid = false; break; }
      if (!requiredCounts[entry.position]) { valid = false; break; }
      if (fieldIds.has(entry.playerId)) { valid = false; break; }
      fieldIds.add(entry.playerId);
      fieldCounts[entry.position] = (fieldCounts[entry.position] || 0) + 1;
    }
    for (const [pos, count] of Object.entries(requiredCounts)) {
      if ((fieldCounts[pos] || 0) !== count) {
        valid = false;
        break;
      }
    }
    if (!rotateGK && fixedGKPlayerId) {
      const fixedAssignment = startingField.find(entry => entry.playerId === fixedGKPlayerId);
      if (!fixedAssignment || fixedAssignment.position !== 'GK') {
        valid = false;
      }
    }
    if (valid) {
      const benchIds = Array.isArray(startingBench)
        ? startingBench.filter(id => availableIds.has(id))
        : availablePlayers.filter(player => !fieldIds.has(player.id)).map(player => player.id);
      const uniqueBenchIds = Array.from(new Set(benchIds.filter(id => !fieldIds.has(id))));
      if (uniqueBenchIds.length === benchSize) {
        startingOverrideField = startingField.map(entry => ({
          playerId: entry.playerId,
          position: entry.position,
        }));
        startingOverrideBenchIds = uniqueBenchIds;
      }
    }
  }

  if (!rotateGK && startingOverrideField) {
    const startingGK = startingOverrideField.find(entry => entry.position === 'GK');
    if (startingGK) {
      resolvedGKId = startingGK.playerId;
    }
  }

  // Simulate season stats
  const simStats = {};
  for (const p of availablePlayers) {
    simStats[p.id] = {
      id: p.id,
      name: p.name,
      minutesGK: p.minutesGK || 0,
      minutesDEF: p.minutesDEF || 0,
      minutesMID: p.minutesMID || 0,
      minutesATK: p.minutesATK || 0,
    };
  }

  // Track bench/field history per player for enforcing rules
  const benchBreaks = {};           // total blocks spent on bench
  const lastBenchedBlock = {};      // block index when player last went to bench
  const totalBenchStints = {};      // number of separate bench stints
  const consecutiveFieldBlocks = {}; // consecutive blocks on field without a bench break
  const totalFieldBlocks = {};       // total blocks on field in this game (max MAX_FIELD_BLOCKS)

  for (const p of availablePlayers) {
    benchBreaks[p.id] = 0;
    lastBenchedBlock[p.id] = NEVER_BENCHED_BLOCK;
    totalBenchStints[p.id] = 0;
    consecutiveFieldBlocks[p.id] = 0;
    totalFieldBlocks[p.id] = 0;
  }

  const blocks = [];

  for (let block = 0; block < numBlocks; block++) {
    let fieldCandidates;
    let newBench;

    if (block === 0) {
      if (startingOverrideField && startingOverrideBenchIds) {
        for (const { playerId, position } of startingOverrideField) {
          const s = simStats[playerId];
          if (position === 'GK') s.minutesGK += 10;
          else if (position === 'DEF') s.minutesDEF += 10;
          else if (position === 'MID') s.minutesMID += 10;
          else if (position === 'ATK') s.minutesATK += 10;
          consecutiveFieldBlocks[playerId] = 1;
          totalFieldBlocks[playerId] = 1;
        }
        for (const benchId of startingOverrideBenchIds) {
          benchBreaks[benchId] = 1;
          lastBenchedBlock[benchId] = 0;
          totalBenchStints[benchId] = 1;
        }
        blocks.push({
          onField: startingOverrideField,
          onBench: startingOverrideBenchIds,
        });
        continue;
      }

      // First block: decide who starts on the field vs bench
      let gkCandidate = null;
      let sortPool = availablePlayers;
      if (!rotateGK && resolvedGKId) {
        gkCandidate = availablePlayers.find(p => p.id === resolvedGKId) || null;
        if (gkCandidate) {
          sortPool = availablePlayers.filter(p => p.id !== resolvedGKId);
        }
      }

      const sorted = [...sortPool].sort((a, b) => {
        const benchA = benchStartCounts[a.id] || 0;
        const benchB = benchStartCounts[b.id] || 0;
        if (benchA !== benchB) return benchB - benchA;
        if (targets) {
          const diff = getDeficit(b, targets).total - getDeficit(a, targets).total;
          if (diff !== 0) return diff;
        }
        return getTotalMinutes(a) - getTotalMinutes(b);
      });

      const outfieldSlots = gkCandidate ? fieldCount - 1 : fieldCount;
      fieldCandidates = sorted.slice(0, outfieldSlots);
      if (gkCandidate) fieldCandidates.unshift(gkCandidate);
      newBench = sorted.slice(outfieldSlots);

      // Enforce bench-start protection: players who started on bench recently
      // must start on the field for at least the next 2 consecutive games.
      if (benchProtectedIds.size > 0) {
        const protectedOnBench = newBench.filter(p => benchProtectedIds.has(p.id));
        for (const protectedPlayer of protectedOnBench) {
          // Find a non-protected field candidate to swap with (prefer most total minutes)
          const swapCandidate = fieldCandidates
            .filter(p => !benchProtectedIds.has(p.id) && p.id !== resolvedGKId)
            .sort((a, b) => getTotalMinutes(b) - getTotalMinutes(a))[0];
          if (swapCandidate) {
            const fieldIdx = fieldCandidates.indexOf(swapCandidate);
            const benchIdx = newBench.indexOf(protectedPlayer);
            fieldCandidates[fieldIdx] = protectedPlayer;
            newBench[benchIdx] = swapCandidate;
          }
        }
      }

      // Initialize bench tracking for players starting on bench
      for (const p of newBench) {
        benchBreaks[p.id] = 1;
        lastBenchedBlock[p.id] = 0;
        totalBenchStints[p.id] = 1;
      }
      // Initialize field tracking
      for (const p of fieldCandidates) {
        consecutiveFieldBlocks[p.id] = 1;
        totalFieldBlocks[p.id] = 1;
      }
    } else {
      const prevBlock = blocks[block - 1];
      const prevFieldIds = prevBlock.onField.map(a => a.playerId);
      const prevBenchIds = prevBlock.onBench;
      const prevFieldMap = new Map(prevBlock.onField.map(a => [a.playerId, a.position]));

      // Determine which bench players are eligible to come ON
      // Rule: No player on bench longer than 10 min at a time (1 block max)
      // So bench players that have been on bench for 1 block MUST come on
      const eligibleBenchPlayers = prevBenchIds.filter(id => {
        const lastBenched = lastBenchedBlock[id];
        return (block - lastBenched) >= 1;
      });

      // Bench players that MUST come on (been on bench for max allowed consecutive blocks)
      const mustComeOn = prevBenchIds.filter(id => {
        const lastBenched = lastBenchedBlock[id];
        return (block - lastBenched) >= MAX_BENCH_CONSECUTIVE;
      });

      // Determine which field players are candidates to come OFF
      // Rules:
      // - Not the fixed GK (if GK doesn't rotate)
      // - Must have at least MIN_CONSECUTIVE_BEFORE_BENCH (2) consecutive blocks on field
      //   before they can go back to bench
      // - Can't exceed MAX_FIELD_BLOCKS total (will be forced off if at max)
      const rotationCandidates = prevFieldIds.filter(id => {
        if (!rotateGK && id === resolvedGKId) return false;
        // Must have played at least 2 consecutive blocks before going to bench
        if (consecutiveFieldBlocks[id] < MIN_CONSECUTIVE_BEFORE_BENCH) return false;
        return true;
      });

      // Field players that MUST come off (reached max 4 blocks on pitch)
      const mustComeOff = prevFieldIds.filter(id => {
        if (!rotateGK && id === resolvedGKId) return false;
        return totalFieldBlocks[id] >= MAX_FIELD_BLOCKS;
      });

      // Calculate remaining blocks in the game
      const remainingBlocks = numBlocks - block;

      const goingOffIds = new Set();
      const comingOnIds = new Set();
      const substitutions = []; // { offId, onId, position }

      // First, handle forced subs: players who MUST come off matched with players who MUST come on
      // Position-matched: incoming player takes the exact position of the outgoing player
      for (const offId of mustComeOff) {
        const offPos = prevFieldMap.get(offId);
        if (!canSubOff(offId, prevFieldMap, rotateGK)) continue; // Fixed GK never comes off
        if (goingOffIds.has(offId)) continue;

        // Find a bench player to come on - prefer one who must come on
        let onId = mustComeOn.find(id => !comingOnIds.has(id));
        if (!onId) onId = eligibleBenchPlayers.find(id => !comingOnIds.has(id));
        if (!onId) continue;

        goingOffIds.add(offId);
        comingOnIds.add(onId);
        substitutions.push({ offId, onId, position: offPos });
      }

      // Then handle bench players who MUST come on but haven't been paired yet
      for (const onId of mustComeOn) {
        if (comingOnIds.has(onId)) continue;

        // Find a field player to come off - from rotation candidates, prioritising
        // those with most consecutive blocks, most total field time, and highest
        // season-level total minutes (for long-term fairness)
        const candidatesForOff = rotationCandidates
          .filter(id => !goingOffIds.has(id))
          .sort((a, b) => {
            // Prefer players at max field blocks
            const atMaxA = totalFieldBlocks[a] >= MAX_FIELD_BLOCKS ? 1 : 0;
            const atMaxB = totalFieldBlocks[b] >= MAX_FIELD_BLOCKS ? 1 : 0;
            if (atMaxA !== atMaxB) return atMaxB - atMaxA;
            // Then most consecutive blocks
            const consA = consecutiveFieldBlocks[a] || 0;
            const consB = consecutiveFieldBlocks[b] || 0;
            if (consA !== consB) return consB - consA;
            // Then prefer player with most cumulative season minutes (fairness)
            if (targets) {
              const defA = getDeficit(simStats[a], targets).total;
              const defB = getDeficit(simStats[b], targets).total;
              if (defA !== defB) return defA - defB; // lower deficit = more minutes = come off first
            }
            // Then most total field blocks this game
            return (totalFieldBlocks[b] || 0) - (totalFieldBlocks[a] || 0);
          });

        const offId = candidatesForOff.find(id => canSubOff(id, prevFieldMap, rotateGK));
        if (!offId) continue;

        const offPos = prevFieldMap.get(offId);

        goingOffIds.add(offId);
        comingOnIds.add(onId);
        substitutions.push({ offId, onId, position: offPos });
      }

      // Optional additional subs for fairness - if bench players need field time
      // and field players can come off
      for (const benchId of eligibleBenchPlayers) {
        if (comingOnIds.has(benchId)) continue;

        // Check if this bench player needs more field time to reach minimum
        // Include current block in remaining count since sub happens at start of block
        const neededBlocks = MIN_FIELD_BLOCKS - totalFieldBlocks[benchId];
        if (neededBlocks <= 0 || neededBlocks > remainingBlocks) continue;

        // Find a rotation candidate to come off
        const candidatesForOff = rotationCandidates
          .filter(id => !goingOffIds.has(id))
          .filter(id => consecutiveFieldBlocks[id] >= MIN_CONSECUTIVE_BEFORE_BENCH)
          .sort((a, b) => {
            const consA = consecutiveFieldBlocks[a] || 0;
            const consB = consecutiveFieldBlocks[b] || 0;
            if (consA !== consB) return consB - consA;
            if (targets) {
              return getDeficit(simStats[a], targets).total - getDeficit(simStats[b], targets).total;
            }
            return getTotalMinutes(simStats[b]) - getTotalMinutes(simStats[a]);
          });

        const offId = candidatesForOff.find(id => canSubOff(id, prevFieldMap, rotateGK));
        if (!offId) continue;

        const offPos = prevFieldMap.get(offId);

        goingOffIds.add(offId);
        comingOnIds.add(benchId);
        substitutions.push({ offId, onId: benchId, position: offPos });
      }

      // Build the new field: everyone who stays keeps their position + incoming players take the outgoing player's position
      const stayingOnField = prevBlock.onField
        .filter(a => !goingOffIds.has(a.playerId))
        .map(a => ({ playerId: a.playerId, position: a.position }));

      // Players coming on take the exact position of the player they replace
      for (const sub of substitutions) {
        stayingOnField.push({ playerId: sub.onId, position: sub.position });
      }

      // Build new bench
      const newBenchIds = [
        ...prevBenchIds.filter(id => !comingOnIds.has(id)),
        ...Array.from(goingOffIds),
      ];

      // Use the position-preserved field assignments directly (no reassignment)
      const currentFieldPlayers = stayingOnField;

      // Update simulated stats
      for (const { playerId, position } of currentFieldPlayers) {
        const s = simStats[playerId];
        if (position === 'GK') s.minutesGK += 10;
        else if (position === 'DEF') s.minutesDEF += 10;
        else if (position === 'MID') s.minutesMID += 10;
        else if (position === 'ATK') s.minutesATK += 10;
      }

      // Update tracking
      for (const { playerId } of currentFieldPlayers) {
        consecutiveFieldBlocks[playerId] = (consecutiveFieldBlocks[playerId] || 0) + 1;
        totalFieldBlocks[playerId] = (totalFieldBlocks[playerId] || 0) + 1;
      }
      for (const id of newBenchIds) {
        if (goingOffIds.has(id)) {
          benchBreaks[id] = (benchBreaks[id] || 0) + 1;
          lastBenchedBlock[id] = block;
          totalBenchStints[id] = (totalBenchStints[id] || 0) + 1;
          consecutiveFieldBlocks[id] = 0;
        } else {
          benchBreaks[id] = (benchBreaks[id] || 0) + 1;
        }
      }
      for (const id of Array.from(comingOnIds)) {
        consecutiveFieldBlocks[id] = 1;
      }

      blocks.push({
        onField: currentFieldPlayers,
        onBench: newBenchIds,
      });
      continue;
    }

    // Block 0 assignment
    const fieldSimPlayers = fieldCandidates.map(p => simStats[p.id] || p);
    const assignment = assignPositions(fieldSimPlayers, positions, rotateGK, targets, resolvedGKId);

    // Update simulated stats for block 0
    for (const { playerId, position } of assignment) {
      const s = simStats[playerId];
      if (position === 'GK') s.minutesGK += 10;
      else if (position === 'DEF') s.minutesDEF += 10;
      else if (position === 'MID') s.minutesMID += 10;
      else if (position === 'ATK') s.minutesATK += 10;
    }

    blocks.push({
      onField: assignment,
      onBench: (newBench || []).map(p => p.id),
    });
  }

  return blocks;
}

/**
 * Build a plan when there are no bench players (everyone plays every block).
 */
function buildNoBenchPlan(availablePlayers, numBlocks, positions, rotateGK, allPlayers, team, fixedGKPlayerId) {
  const totalPlayers = (allPlayers || availablePlayers).length;
  const formation = positions.filter(p => p !== 'GK');
  const defCount = formation.filter(p => p === 'DEF').length;
  const midCount = formation.filter(p => p === 'MID').length;
  const atkCount = formation.filter(p => p === 'ATK').length;
  const targets = team
    ? calculateSeasonTargets(team, totalPlayers, [defCount, midCount, atkCount], rotateGK)
    : null;

  let resolvedGKId = fixedGKPlayerId;
  if (!rotateGK && !resolvedGKId) {
    const sorted = [...availablePlayers].sort(
      (a, b) => (b.minutesGK || 0) - (a.minutesGK || 0),
    );
    resolvedGKId = sorted[0]?.id || null;
  }

  const simStats = {};
  for (const p of availablePlayers) {
    simStats[p.id] = { ...p, minutesGK: p.minutesGK || 0, minutesDEF: p.minutesDEF || 0, minutesMID: p.minutesMID || 0, minutesATK: p.minutesATK || 0 };
  }

  const blocks = [];
  for (let block = 0; block < numBlocks; block++) {
    const pool = availablePlayers.map(p => simStats[p.id]);
    const assignment = assignPositions(pool, positions, rotateGK, targets, resolvedGKId);
    for (const { playerId, position } of assignment) {
      const s = simStats[playerId];
      if (position === 'GK') s.minutesGK += 10;
      else if (position === 'DEF') s.minutesDEF += 10;
      else if (position === 'MID') s.minutesMID += 10;
      else if (position === 'ATK') s.minutesATK += 10;
    }
    blocks.push({ onField: assignment, onBench: [] });
  }
  return blocks;
}

/**
 * Compute bench-start counts from game history.
 * Returns { [playerId]: number } mapping each player to the number of games
 * in which they started on the bench.
 */
export function computeBenchStartCounts(gameHistory = []) {
  const counts = {};
  for (const game of gameHistory) {
    const benchIds = game.startingBenchIds || [];
    for (const id of benchIds) {
      counts[id] = (counts[id] || 0) + 1;
    }
  }
  return counts;
}

// Determine subs between two consecutive blocks
// Returns array of { off: playerId, on: playerId, position: string }
export function getSubsBetweenBlocks(prevBlock, nextBlock) {
  const prevFieldMap = new Map(prevBlock.onField.map(a => [a.playerId, a.position]));
  const nextFieldMap = new Map(nextBlock.onField.map(a => [a.playerId, a.position]));

  const comingOff = prevBlock.onField.filter(a => !nextFieldMap.has(a.playerId));
  const comingOn = nextBlock.onField.filter(a => !prevFieldMap.has(a.playerId));

  const subs = [];
  for (let i = 0; i < comingOn.length; i++) {
    subs.push({
      off: comingOff[i]?.playerId || null,
      offPosition: comingOff[i]?.position || null,
      on: comingOn[i].playerId,
      position: comingOn[i].position,
    });
  }
  return subs;
}

// Apply minutes to player stats for a completed block
export function applyBlockMinutes(players, blockAssignment, minutes = 10) {
  return players.map(p => {
    const assignment = blockAssignment.find(a => a.playerId === p.id);
    if (!assignment) return p;
    const updated = { ...p };
    if (assignment.position === 'GK') updated.minutesGK = (updated.minutesGK || 0) + minutes;
    else if (assignment.position === 'DEF') updated.minutesDEF = (updated.minutesDEF || 0) + minutes;
    else if (assignment.position === 'MID') updated.minutesMID = (updated.minutesMID || 0) + minutes;
    else if (assignment.position === 'ATK') updated.minutesATK = (updated.minutesATK || 0) + minutes;
    return updated;
  });
}

/**
 * Determine which player IDs are "bench-start protected".
 * Rule: If a player started on the bench in any of the last 2 games,
 * they must start on the field for the current game.
 *
 * Returns a Set of player IDs that must NOT start on the bench.
 */
export function getBenchProtectedIds(gameHistory = []) {
  const protectedIds = new Set();
  if (!gameHistory || gameHistory.length === 0) return protectedIds;

  // Sort descending by game number to get the most recent games first
  const sorted = [...gameHistory].sort(
    (a, b) => (b.gameNumber || 0) - (a.gameNumber || 0),
  );

  // Check the last 2 games
  for (let i = 0; i < Math.min(2, sorted.length); i++) {
    const game = sorted[i];
    const benchIds = game.startingBenchIds || [];
    for (const id of benchIds) {
      protectedIds.add(id);
    }
  }

  return protectedIds;
}

/**
 * Maximum allowed spread (in minutes) between the highest and lowest
 * non-GK outfield player totals at end of season.
 */
const MAX_FAIRNESS_SPREAD = 30;

/**
 * Run a single forward-simulation pass of all remaining rounds.
 * Returns { results, simPlayers, simHistory } so the caller can inspect
 * the final spread and optionally re-run.
 */
function runSeasonSimulation(
  activePlayers,
  formation,
  team,
  gameHistory,
  remainingRoundNumbers,
  currentGameOverride,
) {
  const simPlayers = activePlayers.map(p => ({
    ...p,
    minutesGK: p.minutesGK || 0,
    minutesDEF: p.minutesDEF || 0,
    minutesMID: p.minutesMID || 0,
    minutesATK: p.minutesATK || 0,
    minutesBench: p.minutesBench || 0,
  }));

  // Build a set of absent player IDs for the current game override
  const overrideRound = currentGameOverride?.roundNumber;
  const overrideAbsentSet = new Set(
    (currentGameOverride?.absentPlayerIds || [])
  );

  const simHistory = [...(gameHistory || [])];
  const results = [];

  for (const roundNumber of remainingRoundNumbers) {
    let plan;

    if (currentGameOverride && roundNumber === overrideRound && currentGameOverride.plan) {
      // Use the actual game plan for the current live game (already excludes absent players)
      plan = currentGameOverride.plan;

      // Credit absent players with sick/injured minutes
      if (currentGameOverride.absentMinutes) {
        for (const absent of currentGameOverride.absentMinutes) {
          const player = simPlayers.find(p => p.id === absent.playerId);
          if (player) {
            player.minutesSickInjured = (player.minutesSickInjured || 0) + (absent.minutesSickInjured || 0);
          }
        }
      }
    } else {
      const protectedIds = getBenchProtectedIds(simHistory);
      const benchCounts = computeBenchStartCounts(simHistory);

      plan = planGame(
        simPlayers,
        formation,
        team.gameDuration,
        team.rotateGK,
        simPlayers,
        team,
        team.fixedGKPlayerId,
        { benchStartCounts: benchCounts, benchProtectedIds: protectedIds },
      );
    }

    const isOverrideRound = currentGameOverride && roundNumber === overrideRound;
    results.push({
      round: roundNumber,
      plan,
      absentPlayerIds: isOverrideRound ? (currentGameOverride.absentPlayerIds || []) : [],
    });

    if (plan) {
      const numBlocks = plan.length;
      const gameFieldMinutes = {};
      for (const p of simPlayers) {
        gameFieldMinutes[p.id] = 0;
      }

      for (let b = 0; b < numBlocks; b++) {
        const block = plan[b];
        const blockMinutes = (b === numBlocks - 1)
          ? (team.gameDuration - (numBlocks - 1) * 10)
          : 10;

        for (const { playerId, position } of block.onField) {
          const player = simPlayers.find(p => p.id === playerId);
          if (player) {
            if (position === 'GK') player.minutesGK += blockMinutes;
            else if (position === 'DEF') player.minutesDEF += blockMinutes;
            else if (position === 'MID') player.minutesMID += blockMinutes;
            else if (position === 'ATK') player.minutesATK += blockMinutes;
            gameFieldMinutes[playerId] = (gameFieldMinutes[playerId] || 0) + blockMinutes;
          }
        }
      }

      // Only give bench minutes to players who were actually available for this round
      // (absent players should not receive bench minutes)
      for (const p of simPlayers) {
        if (isOverrideRound && overrideAbsentSet.has(p.id)) continue;
        const fieldMins = gameFieldMinutes[p.id] || 0;
        const benchMins = team.gameDuration - fieldMins;
        if (benchMins > 0) {
          p.minutesBench = (p.minutesBench || 0) + benchMins;
        }
      }

      const startingBenchIds = plan[0]?.onBench || [];
      simHistory.push({
        gameNumber: roundNumber,
        startingBenchIds,
      });
    }
  }

  return { results, simPlayers, simHistory };
}

/**
 * Calculate the spread between highest and lowest non-GK outfield
 * total minutes from simulated player stats.
 */
function getNonGKSpread(simPlayers, team) {
  const outfield = simPlayers.filter(p => {
    if (!team.rotateGK && p.id === team.fixedGKPlayerId) return false;
    return true;
  });
  if (outfield.length < 2) return 0;

  const totals = outfield.map(p =>
    (p.minutesDEF || 0) + (p.minutesMID || 0) + (p.minutesATK || 0) + (p.minutesGK || 0)
  );
  return Math.max(...totals) - Math.min(...totals);
}

/**
 * Plan team sheets for ALL remaining rounds in the season.
 * Simulates forward so each round's plan considers the cumulative
 * minutes from previous (simulated) rounds, ensuring fairness
 * across the entire remaining season.
 *
 * After the initial pass, checks if the non-GK minute spread exceeds
 * the fairness threshold (30 min). If so, re-runs up to 4 times with
 * increasing virtual-minute bias on over-played players to converge
 * toward a fairer distribution.
 *
 * Returns an array of { round, plan } objects.
 */
export function planRemainingSeasonSheets(
  activePlayers,
  formation,
  team,
  gameHistory,
  remainingRoundNumbers,
  currentGameOverride,
) {
  if (!activePlayers || activePlayers.length === 0 || !remainingRoundNumbers || remainingRoundNumbers.length === 0) {
    return [];
  }

  // Run up to 4 passes to converge on fair distribution.
  // Each pass increases the virtual-minute bias (5, 10, 15, 20) applied to
  // over-played players, causing the deficit-based sorting in planGame to
  // produce progressively fairer results. 4 passes balances convergence
  // quality against computation cost.
  const MAX_PASSES = 4;
  let bestResults = null;
  let bestSpread = Infinity;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // On passes > 0, bias the input stats: add virtual minutes to
    // the players who ended up with the most minutes in the previous pass
    let biasedPlayers = activePlayers;
    if (pass > 0 && bestResults) {
      // Compute end-of-season totals from the best simulation so far
      const endTotals = {};
      for (const p of activePlayers) {
        endTotals[p.id] = getTotalMinutes(p);
      }
      // Simulate the best results to get end-of-season totals
      for (const { plan } of bestResults) {
        if (!plan) continue;
        for (let b = 0; b < plan.length; b++) {
          for (const { playerId } of plan[b].onField) {
            endTotals[playerId] = (endTotals[playerId] || 0) + 10;
          }
        }
      }
      // Find the average total minutes
      const vals = Object.values(endTotals);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      // Add bias: players above average get virtual extra minutes proportional
      // to how far above average they are, scaled by pass number
      const biasScale = pass * 5; // 5, 10, 15, 20 extra virtual minutes per pass
      biasedPlayers = activePlayers.map(p => {
        const surplus = (endTotals[p.id] || 0) - avg;
        if (surplus <= 0) return p;
        // Add bias to the position with most minutes to influence sorting
        const bias = Math.round(Math.min(surplus, biasScale));
        return {
          ...p,
          minutesDEF: (p.minutesDEF || 0) + Math.round(bias / 3),
          minutesMID: (p.minutesMID || 0) + Math.round(bias / 3),
          minutesATK: (p.minutesATK || 0) + Math.round(bias / 3),
        };
      });
    }

    const { results, simPlayers } = runSeasonSimulation(
      biasedPlayers,
      formation,
      team,
      gameHistory,
      remainingRoundNumbers,
      currentGameOverride,
    );

    const spread = getNonGKSpread(simPlayers, team);

    if (spread < bestSpread) {
      bestSpread = spread;
      bestResults = results;
    }

    // If within the fairness threshold, we're done
    if (spread <= MAX_FAIRNESS_SPREAD) break;
  }

  return bestResults || [];
}
