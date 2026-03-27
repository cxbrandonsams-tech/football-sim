/**
 * Play selection layer — sits between Team strategy and the simulation engine.
 *
 * Responsibilities:
 *   1. Classify down/distance → DownDistanceBucket
 *   2. Look up the team's OffensivePlan → playbook ID → Playbook
 *   3. Weighted-randomly select an OffensivePlay
 *   4. Apply the play's formation slot assignments to the team's positional
 *      depth chart so the engine picks up the right players at WR/TE/RB slots
 *
 * The engine receives the same Team interface it always has — only the order
 * of players at WR[0], WR[1], WR[2], TE[0], RB[0], RB[1] may differ.
 * No engine math is changed.
 *
 * Slot → positional depth chart index mapping:
 *   X    → WR[0]   (featured wide receiver)
 *   Z    → WR[1]   (secondary wide receiver)
 *   SLOT → WR[2]   (slot receiver)
 *   TE   → TE[0]   (tight end)
 *   RB   → RB[0]   (primary running back)
 *   FB   → RB[1]   (fullback, occupies the #2 RB slot)
 */

import { type Team }                           from '../models/Team';
import { type DepthChart, type DepthChartSlot } from '../models/DepthChart';
import { type Player }                          from '../models/Player';
import { type PlayType }                        from '../models/PlayEvent';
import { type OffensiveSlot }                   from '../models/Formation';
import {
  type OffensivePlay,
  type Playbook,
  type DownDistanceBucket,
  type OffensivePlan,
}                                               from '../models/Playbook';
import { OFFENSIVE_PLAYS }                      from '../data/plays';
import { PLAYBOOKS, DEFAULT_OFFENSIVE_PLAN }    from '../data/playbooks';

// GameSituation is imported as type-only to avoid a circular module reference.
// At runtime this import is fully erased by the TypeScript compiler.
import type { GameSituation } from './simulateGame';

// ── Slot → positional depth chart mapping ─────────────────────────────────────

type PosSlot = 'WR' | 'TE' | 'RB';

const SLOT_TO_DEPTH: Record<OffensiveSlot, { slot: PosSlot; index: number }> = {
  X:    { slot: 'WR', index: 0 },
  Z:    { slot: 'WR', index: 1 },
  SLOT: { slot: 'WR', index: 2 },
  TE:   { slot: 'TE', index: 0 },
  RB:   { slot: 'RB', index: 0 },
  FB:   { slot: 'RB', index: 1 },
};

// ── Formation depth chart application ────────────────────────────────────────

/**
 * Rebuild WR/TE/RB depth chart arrays so formation-assigned players appear
 * at the positional indices the engine uses for target/carrier selection.
 *
 * Algorithm:
 *   For each positional group (WR, TE, RB) that has at least one assignment:
 *     1. Collect all assigned players and their target indices.
 *     2. Collect remaining base depth chart players (those not explicitly assigned).
 *     3. Build a new array: assigned players at their target index,
 *        unassigned players filling any remaining slots in their original order.
 *
 * Players assigned to a slot but not found on the roster are silently skipped
 * (positional depth chart fallback applies for that index).
 */
function applyFormationToDepthChart(
  base:           DepthChart,
  slotAssignment: Partial<Record<OffensiveSlot, string | null>>,
  roster:         Player[],
): DepthChart {
  const rosterById = new Map(roster.map(p => [p.id, p]));

  // Group slot assignments by target positional slot
  const byPos = new Map<PosSlot, Map<number, Player>>();

  for (const [slotStr, playerId] of Object.entries(slotAssignment) as [OffensiveSlot, string | null][]) {
    if (!playerId) continue;
    const player  = rosterById.get(playerId);
    if (!player) continue;
    const mapping = SLOT_TO_DEPTH[slotStr];
    if (!mapping) continue;

    if (!byPos.has(mapping.slot)) byPos.set(mapping.slot, new Map());
    byPos.get(mapping.slot)!.set(mapping.index, player);
  }

  if (byPos.size === 0) return base;

  // Shallow-clone the full depth chart
  const chart: DepthChart = {
    QB: [...base.QB], RB: [...base.RB], WR: [...base.WR], TE: [...base.TE],
    OL: [...base.OL], DE: [...base.DE], DT: [...base.DT], LB: [...base.LB],
    CB: [...base.CB], S:  [...base.S],  K:  [...base.K],  P:  [...base.P],
  };

  for (const [posSlot, indexMap] of byPos) {
    const baseArr      = base[posSlot] as (Player | null)[];
    const assignedIds  = new Set([...indexMap.values()].map(p => p.id));

    // Players from the base array not explicitly assigned to a formation slot
    const unassigned    = baseArr.filter((p): p is Player => p !== null && !assignedIds.has(p.id));
    let   unassignedIdx = 0;

    const maxLen = Math.max(baseArr.length, ...indexMap.keys()) + 1;
    const newArr: (Player | null)[] = new Array(maxLen).fill(null);

    // Place formation-assigned players at designated indices
    for (const [index, player] of indexMap) {
      newArr[index] = player;
    }

    // Fill remaining positions with unassigned depth chart players in order
    for (let i = 0; i < newArr.length; i++) {
      if (newArr[i] === null) {
        newArr[i] = unassigned[unassignedIdx++] ?? null;
      }
    }

    (chart as Record<DepthChartSlot, (Player | null)[]>)[posSlot] = newArr;
  }

  return chart;
}

/**
 * Apply a play's formation slot assignments to a team, returning a new Team
 * with remapped WR/TE/RB depth chart entries.
 *
 * Returns the original team unchanged when:
 *   - the team has no formationDepthCharts configured, or
 *   - no assignment exists for this play's formation.
 */
export function applyFormationToTeam(team: Team, play: OffensivePlay): Team {
  const slotAssignment = team.formationDepthCharts?.[play.formationId];
  if (!slotAssignment || Object.keys(slotAssignment).length === 0) return team;
  const newDepthChart = applyFormationToDepthChart(team.depthChart, slotAssignment, team.roster);
  return { ...team, depthChart: newDepthChart };
}

// ── Down & distance bucket classification ────────────────────────────────────

/**
 * Classify a down + distance pair into one of 13 play-calling buckets.
 *
 * Distance thresholds:
 *   Short  = 1–3 yards
 *   Medium = 4–6 yards
 *   Long   = 7+ yards
 *
 * 1st & 10 is its own bucket (the most common first-down situation).
 */
export function classifyBucket(down: number, distance: number): DownDistanceBucket {
  if (down === 1) {
    if (distance === 10) return 'FIRST_10';
    if (distance >= 11)  return 'FIRST_LONG';
    if (distance >= 4)   return 'FIRST_MEDIUM';
    return 'FIRST_SHORT';
  }
  if (down === 2) {
    if (distance >= 7) return 'SECOND_LONG';
    if (distance >= 4) return 'SECOND_MEDIUM';
    return 'SECOND_SHORT';
  }
  if (down === 3) {
    if (distance >= 7) return 'THIRD_LONG';
    if (distance >= 4) return 'THIRD_MEDIUM';
    return 'THIRD_SHORT';
  }
  // 4th down
  if (distance >= 7) return 'FOURTH_LONG';
  if (distance >= 4) return 'FOURTH_MEDIUM';
  return 'FOURTH_SHORT';
}

// ── Weighted random selection ─────────────────────────────────────────────────

function weightedPick<T>(pool: { item: T; weight: number }[]): T | null {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const p of pool) {
    roll -= p.weight;
    if (roll <= 0) return p.item;
  }
  return pool[pool.length - 1]?.item ?? null;
}

// ── Play selection ────────────────────────────────────────────────────────────

function selectOffensivePlay(
  plan:        OffensivePlan,
  bucket:      DownDistanceBucket,
  customBooks: Playbook[] = [],
): OffensivePlay | null {
  const allPlaybooks = [...PLAYBOOKS, ...customBooks];
  const playbookId   = plan[bucket] ?? DEFAULT_OFFENSIVE_PLAN[bucket];
  const playbook     = allPlaybooks.find(pb => pb.id === playbookId)
                    ?? PLAYBOOKS.find(pb => pb.id === DEFAULT_OFFENSIVE_PLAN[bucket]);
  if (!playbook) return null;

  const pool = playbook.entries
    .map(entry => {
      const play = OFFENSIVE_PLAYS.find(p => p.id === entry.playId);
      return play ? { item: play, weight: entry.weight } : null;
    })
    .filter((p): p is { item: OffensivePlay; weight: number } => p !== null);

  return weightedPick(pool);
}

// ── Stats counter (for validation / testing) ─────────────────────────────────

export interface PlaySelectionStats {
  legacyFallback:     number;  // team had no offensivePlan → engine fallback
  newPathResolved:    number;  // play resolved via offensivePlan
  newPathFallback:    number;  // offensivePlan present but play not found → engine fallback
  formationApplied:   number;  // formation depth chart was applied at least once
}

export let playSelectionStats: PlaySelectionStats = {
  legacyFallback:   0,
  newPathResolved:  0,
  newPathFallback:  0,
  formationApplied: 0,
};

export function resetPlaySelectionStats(): void {
  playSelectionStats = {
    legacyFallback:   0,
    newPathResolved:  0,
    newPathFallback:  0,
    formationApplied: 0,
  };
}

// ── Debug logging ─────────────────────────────────────────────────────────────

const DEBUG = process.env['PLAY_SELECTION_DEBUG'] === '1';
const DEBUG_SAMPLE_RATE = 0.05; // log ~5% of plays

function debugLog(
  team:    Team,
  sit:     GameSituation,
  bucket:  DownDistanceBucket,
  play:    OffensivePlay,
  applied: boolean,
): void {
  if (!DEBUG || Math.random() > DEBUG_SAMPLE_RATE) return;

  const slotAssignment = applied ? team.formationDepthCharts?.[play.formationId] : undefined;
  const rosterById     = new Map(team.roster.map(p => [p.id, p.name]));

  const slots = slotAssignment
    ? (Object.entries(slotAssignment) as [OffensiveSlot, string | null][])
        .filter(([, id]) => id)
        .map(([slot, id]) => `${slot}=${rosterById.get(id!) ?? id}`)
        .join(' ')
    : '(no formation assignment)';

  console.log(
    `[PlaySel] ${sit.down}&${sit.distance} → ${bucket} | ` +
    `book=${team.offensivePlan?.[bucket] ?? '?'} | ` +
    `play=${play.id} (${play.name}) | ` +
    `formation=${play.formationId} | ` +
    `engine=${play.engineType} | ` +
    `slots: ${slots}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ResolvedPlay {
  play:       OffensivePlay;
  engineType: PlayType;
}

/**
 * Resolve a play from the team's offensive plan for the current game situation.
 *
 * Returns null when the team has no offensivePlan configured — the engine's
 * existing selectPlayType() logic handles play selection instead.
 *
 * Fallback chain:
 *   1. Team plan missing → return null (engine fallback)
 *   2. Bucket's playbook not found → use DEFAULT_OFFENSIVE_PLAN for that bucket
 *   3. Playbook empty after resolution → return null (engine fallback)
 */
export function resolvePlay(
  team: Team,
  sit:  GameSituation,
): ResolvedPlay | null {
  if (!team.offensivePlan) {
    playSelectionStats.legacyFallback++;
    return null;
  }
  const bucket = classifyBucket(sit.down, sit.distance);
  const play   = selectOffensivePlay(team.offensivePlan, bucket, team.customOffensivePlaybooks ?? []);
  if (!play) {
    playSelectionStats.newPathFallback++;
    return null;
  }
  playSelectionStats.newPathResolved++;
  const fdc = team.formationDepthCharts?.[play.formationId];
  const hasFormation = !!(fdc && Object.keys(fdc).length > 0);
  if (hasFormation) playSelectionStats.formationApplied++;
  debugLog(team, sit, bucket, play, hasFormation);
  return { play, engineType: play.engineType };
}
