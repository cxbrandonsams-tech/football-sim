/**
 * Defensive selection layer — sits between Team strategy and the simulation engine.
 *
 * Responsibilities:
 *   1. Classify down/distance → DownDistanceBucket (reuses classifyBucket from playSelection)
 *   2. Look up the team's DefensivePlan → defensive playbook ID → DefensivePlaybook
 *   3. Weighted-randomly select a DefensivePlay
 *   4. Apply the play's package slot assignments to the team's defensive depth chart
 *      so the engine picks up the right players at DE/DT/LB/CB/S slots
 *
 * The engine receives the same Team interface it always has — only the order
 * of players at DE[0/1], DT[0/1], LB[0-3], CB[0-4], S[0/1] may differ.
 * No engine math is changed.
 *
 * Slot → positional depth chart index mapping:
 *   DE1  → DE[0]    DE2  → DE[1]
 *   DT1  → DT[0]    DT2  → DT[1]    NT   → DT[0]
 *   LB1  → LB[0]    LB2  → LB[1]    LB3  → LB[2]    LB4  → LB[3]
 *   OLB1 → LB[0]    OLB2 → LB[1]    ILB1 → LB[2]    ILB2 → LB[3]
 *   CB1  → CB[0]    CB2  → CB[1]    NCB  → CB[2]    DC1  → CB[3]   DC2 → CB[4]
 *   FS   → S[0]     SS   → S[1]
 */

import { type Team }                           from '../models/Team';
import { type DepthChart, type DepthChartSlot } from '../models/DepthChart';
import { type Player }                          from '../models/Player';
import { type DefensiveSlot }                   from '../models/DefensivePackage';
import {
  type DefensivePlay,
  type DefensivePlaybook,
  type DefensivePlan,
}                                               from '../models/DefensivePlaybook';
import { type DownDistanceBucket }              from '../models/Playbook';
import { DEFENSIVE_PLAYS }                      from '../data/defensivePlays';
import { DEFENSIVE_PLAYBOOKS, DEFAULT_DEFENSIVE_PLAN } from '../data/defensivePlaybooks';
import { classifyBucket }                       from './playSelection';

// GameSituation is imported as type-only to avoid a circular module reference.
import type { GameSituation } from './simulateGame';

// ── Slot → positional depth chart mapping ─────────────────────────────────────

type DefDepthSlot = 'DE' | 'DT' | 'LB' | 'CB' | 'S';

const DEF_SLOT_TO_DEPTH: Record<DefensiveSlot, { slot: DefDepthSlot; index: number }> = {
  DE1:  { slot: 'DE', index: 0 },
  DE2:  { slot: 'DE', index: 1 },
  DT1:  { slot: 'DT', index: 0 },
  DT2:  { slot: 'DT', index: 1 },
  NT:   { slot: 'DT', index: 0 },  // nose tackle occupies DT[0]
  LB1:  { slot: 'LB', index: 0 },
  LB2:  { slot: 'LB', index: 1 },
  LB3:  { slot: 'LB', index: 2 },
  LB4:  { slot: 'LB', index: 3 },
  OLB1: { slot: 'LB', index: 0 },  // 3-4 outside LBs occupy LB[0/1]
  OLB2: { slot: 'LB', index: 1 },
  ILB1: { slot: 'LB', index: 2 },  // 3-4 inside LBs occupy LB[2/3]
  ILB2: { slot: 'LB', index: 3 },
  CB1:  { slot: 'CB', index: 0 },
  CB2:  { slot: 'CB', index: 1 },
  NCB:  { slot: 'CB', index: 2 },  // nickel back at CB[2]
  DC1:  { slot: 'CB', index: 3 },  // dime back at CB[3]
  DC2:  { slot: 'CB', index: 4 },  // second dime back at CB[4]
  FS:   { slot: 'S',  index: 0 },
  SS:   { slot: 'S',  index: 1 },
};

// ── Package depth chart application ───────────────────────────────────────────

/**
 * Rebuild DE/DT/LB/CB/S depth chart arrays so package-assigned players appear
 * at the positional indices the engine uses for defensive calculations.
 *
 * Algorithm mirrors applyFormationToDepthChart in playSelection.ts:
 *   For each positional group that has at least one assignment:
 *     1. Collect assigned players and their target indices.
 *     2. Collect remaining base depth chart players (not explicitly assigned).
 *     3. Build new array: assigned players at target index,
 *        unassigned players filling remaining slots in original order.
 */
function applyPackageToDepthChart(
  base:           DepthChart,
  slotAssignment: Partial<Record<DefensiveSlot, string | null>>,
  roster:         Player[],
): DepthChart {
  const rosterById = new Map(roster.map(p => [p.id, p]));

  // Group slot assignments by target positional slot
  const byPos = new Map<DefDepthSlot, Map<number, Player>>();

  for (const [slotStr, playerId] of Object.entries(slotAssignment) as [DefensiveSlot, string | null][]) {
    if (!playerId) continue;
    const player  = rosterById.get(playerId);
    if (!player) continue;
    const mapping = DEF_SLOT_TO_DEPTH[slotStr];
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

    // Players from the base array not explicitly assigned to a package slot
    const unassigned    = baseArr.filter((p): p is Player => p !== null && !assignedIds.has(p.id));
    let   unassignedIdx = 0;

    const maxLen = Math.max(baseArr.length, ...indexMap.keys()) + 1;
    const newArr: (Player | null)[] = new Array(maxLen).fill(null);

    // Place package-assigned players at designated indices
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
 * Apply a defensive play's package slot assignments to a team, returning a new Team
 * with remapped DE/DT/LB/CB/S depth chart entries.
 *
 * Returns the original team unchanged when:
 *   - the team has no packageDepthCharts configured, or
 *   - no assignment exists for this play's package.
 */
export function applyPackageToTeam(team: Team, play: DefensivePlay): Team {
  const slotAssignment = team.packageDepthCharts?.[play.packageId];
  if (!slotAssignment || Object.keys(slotAssignment).length === 0) return team;
  const newDepthChart = applyPackageToDepthChart(team.depthChart, slotAssignment, team.roster);
  return { ...team, depthChart: newDepthChart };
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

// ── Defensive play selection ──────────────────────────────────────────────────

function selectDefensivePlay(
  plan:        DefensivePlan,
  bucket:      DownDistanceBucket,
  customBooks: DefensivePlaybook[] = [],
): DefensivePlay | null {
  const allPlaybooks = [...DEFENSIVE_PLAYBOOKS, ...customBooks];
  const playbookId   = plan[bucket] ?? DEFAULT_DEFENSIVE_PLAN[bucket];
  const playbook     = allPlaybooks.find(pb => pb.id === playbookId)
                    ?? DEFENSIVE_PLAYBOOKS.find(pb => pb.id === DEFAULT_DEFENSIVE_PLAN[bucket]);
  if (!playbook) return null;

  const pool = playbook.entries
    .map(entry => {
      const play = DEFENSIVE_PLAYS.find(p => p.id === entry.playId);
      return play ? { item: play, weight: entry.weight } : null;
    })
    .filter((p): p is { item: DefensivePlay; weight: number } => p !== null);

  return weightedPick(pool);
}

// ── Stats counter (for validation / testing) ──────────────────────────────────

export interface DefensiveSelectionStats {
  legacyFallback:   number;  // team had no defensivePlan → depth chart unchanged
  newPathResolved:  number;  // play resolved via defensivePlan
  newPathFallback:  number;  // defensivePlan present but play not found → depth chart unchanged
  packageApplied:   number;  // package depth chart was applied at least once
}

export let defensiveSelectionStats: DefensiveSelectionStats = {
  legacyFallback:   0,
  newPathResolved:  0,
  newPathFallback:  0,
  packageApplied:   0,
};

export function resetDefensiveSelectionStats(): void {
  defensiveSelectionStats = {
    legacyFallback:   0,
    newPathResolved:  0,
    newPathFallback:  0,
    packageApplied:   0,
  };
}

// ── Debug logging ─────────────────────────────────────────────────────────────

const DEBUG = process.env['DEF_SELECTION_DEBUG'] === '1';
const DEBUG_SAMPLE_RATE = 0.05; // log ~5% of plays

function debugLog(
  team:    Team,
  sit:     GameSituation,
  bucket:  DownDistanceBucket,
  play:    DefensivePlay,
  applied: boolean,
): void {
  if (!DEBUG || Math.random() > DEBUG_SAMPLE_RATE) return;

  const slotAssignment = applied ? team.packageDepthCharts?.[play.packageId] : undefined;
  const rosterById     = new Map(team.roster.map(p => [p.id, p.name]));

  const slots = slotAssignment
    ? (Object.entries(slotAssignment) as [DefensiveSlot, string | null][])
        .filter(([, id]) => id)
        .map(([slot, id]) => `${slot}=${rosterById.get(id!) ?? id}`)
        .join(' ')
    : '(no package assignment)';

  console.log(
    `[DefSel] ${sit.down}&${sit.distance} → ${bucket} | ` +
    `book=${team.defensivePlan?.[bucket] ?? '?'} | ` +
    `play=${play.id} (${play.name}) | ` +
    `package=${play.packageId} | ` +
    `coverage=${play.coverage}${play.blitz ? ' BLITZ:' + play.blitz : ''} | ` +
    `slots: ${slots}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ResolvedDefensivePlay {
  play: DefensivePlay;
}

/**
 * Resolve a defensive play from the team's defensive plan for the current game situation.
 *
 * Returns null when the team has no defensivePlan configured — the defensive
 * depth chart is left unmodified (engine uses base depth chart).
 *
 * Fallback chain:
 *   1. Team plan missing → return null (no depth chart remap)
 *   2. Bucket's playbook not found → use DEFAULT_DEFENSIVE_PLAN for that bucket
 *   3. Playbook empty after resolution → return null (no depth chart remap)
 */
export function resolveDefensivePlay(
  team: Team,
  sit:  GameSituation,
): ResolvedDefensivePlay | null {
  if (!team.defensivePlan) {
    defensiveSelectionStats.legacyFallback++;
    return null;
  }
  const bucket = classifyBucket(sit.down, sit.distance);
  const play   = selectDefensivePlay(team.defensivePlan, bucket, team.customDefensivePlaybooks ?? []);
  if (!play) {
    defensiveSelectionStats.newPathFallback++;
    return null;
  }
  defensiveSelectionStats.newPathResolved++;
  const pdc = team.packageDepthCharts?.[play.packageId];
  const hasPackage = !!(pdc && Object.keys(pdc).length > 0);
  if (hasPackage) defensiveSelectionStats.packageApplied++;
  debugLog(team, sit, bucket, play, hasPackage);
  return { play };
}
