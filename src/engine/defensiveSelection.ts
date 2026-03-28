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

import { type Team, type PlayEffStats }         from '../models/Team';
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
import { OFFENSIVE_PLAYS }                      from '../data/plays';

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

// ── Opponent scouting ────────────────────────────────────────────────────────
//
// Derive a profile of the opponent's offensive tendencies from their playStats.
// Used to tilt defensive play selection weights (max ±20%).

export interface ScoutingProfile {
  passRate:     number;  // 0–1 (fraction of pass plays)
  runRate:      number;  // 0–1
  deepRate:     number;  // 0–1 (fraction of deep passes among all passes)
  shortRate:    number;  // 0–1 (fraction of short passes among all passes)
  totalCalls:   number;
}

const RUN_ENGINE_TYPES = new Set(['inside_run', 'outside_run']);
const DEEP_ENGINE_TYPES = new Set(['deep_pass']);
const SHORT_ENGINE_TYPES = new Set(['short_pass']);
const PASS_ENGINE_TYPES = new Set(['short_pass', 'medium_pass', 'deep_pass']);

export function buildScoutingProfile(opponentPlayStats?: Record<string, PlayEffStats>, opponentCustomPlays?: import('../models/Playbook').OffensivePlay[]): ScoutingProfile {
  const neutral: ScoutingProfile = { passRate: 0.5, runRate: 0.5, deepRate: 0.2, shortRate: 0.4, totalCalls: 0 };
  if (!opponentPlayStats) return neutral;

  // Build a play ID → engineType lookup
  const allPlays = [...OFFENSIVE_PLAYS, ...(opponentCustomPlays ?? [])];
  const engineTypeById = new Map(allPlays.map(p => [p.id, p.engineType]));

  let runCalls = 0, passCalls = 0, deepCalls = 0, shortCalls = 0, totalCalls = 0;

  for (const [playId, stats] of Object.entries(opponentPlayStats)) {
    const engineType = engineTypeById.get(playId);
    if (!engineType) continue;
    totalCalls += stats.calls;
    if (RUN_ENGINE_TYPES.has(engineType)) runCalls += stats.calls;
    if (PASS_ENGINE_TYPES.has(engineType)) passCalls += stats.calls;
    if (DEEP_ENGINE_TYPES.has(engineType)) deepCalls += stats.calls;
    if (SHORT_ENGINE_TYPES.has(engineType)) shortCalls += stats.calls;
  }

  if (totalCalls < 10) return neutral; // not enough data to scout

  const passRate = passCalls / totalCalls;
  const deepRate = passCalls > 0 ? deepCalls / passCalls : 0.2;
  const shortRate = passCalls > 0 ? shortCalls / passCalls : 0.4;

  return { passRate, runRate: 1 - passRate, deepRate, shortRate, totalCalls };
}

// ── Coach intelligence ───────────────────────────────────────────────────────
//
// Derives a 0–1 intelligence factor from the defensive coaching staff.
// Higher intelligence → stronger, more consistent scouting adjustments.
// Lower intelligence → weaker adjustments with random noise.
//
// Inputs:
//   DC overall (primary) — 1-99, the DC's general coaching ability
//   HC gameManagement (secondary) — 1-99, the HC's in-game decision-making
//   defensive_architect trait — flat bonus if present on any coach
//
// Output: 0.3–1.0 factor (floor ensures even bad coaches get some adaptation)

export interface CoachIntelligence {
  factor:    number;  // 0.3–1.0, scales scouting intensity
  noiseAmpl: number;  // 0.0–0.15, random noise added to each multiplier
}

export function computeCoachIntelligence(team: Team): CoachIntelligence {
  const dc = team.coaches.dc;
  const hc = team.coaches.hc;

  // DC overall is primary (default 50 if no DC)
  const dcRating = dc?.overall ?? 50;
  // HC gameManagement is secondary (default 50, weighted 30%)
  const hcGm     = hc.gameManagement ?? 50;
  // Composite: 70% DC + 30% HC gameManagement, normalized to 0–1
  const composite = (dcRating * 0.7 + hcGm * 0.3) / 100;

  // Trait bonus: defensive_architect on any coach adds +0.08
  const coaches = [hc, dc, team.coaches.oc].filter(Boolean) as import('../models/Coach').Coach[];
  const hasArchitect = coaches.some(c => c.trait === 'defensive_architect');
  const traitBonus = hasArchitect ? 0.08 : 0;

  // Factor: 0.3–1.0 range
  const raw = composite + traitBonus;
  const factor = Math.min(1.0, Math.max(0.3, raw));

  // Noise: high intelligence → near-zero noise; low → up to ±15%
  // Inverse relationship: noise = 0.15 × (1 - factor)
  const noiseAmpl = 0.15 * (1 - factor);

  return { factor, noiseAmpl };
}

/**
 * Build a scouting profile from raw in-game play tracking (Map<playId, PlayEffStats>).
 * Used for halftime adjustments based on first-half data.
 */
export function buildScoutingProfileFromGameStats(
  playStatsMap: Map<string, PlayEffStats>,
  opponentCustomPlays?: import('../models/Playbook').OffensivePlay[],
): ScoutingProfile {
  const neutral: ScoutingProfile = { passRate: 0.5, runRate: 0.5, deepRate: 0.2, shortRate: 0.4, totalCalls: 0 };
  if (playStatsMap.size === 0) return neutral;

  const allPlays = [...OFFENSIVE_PLAYS, ...(opponentCustomPlays ?? [])];
  const engineTypeById = new Map(allPlays.map(p => [p.id, p.engineType]));

  let runCalls = 0, passCalls = 0, deepCalls = 0, shortCalls = 0, totalCalls = 0;

  for (const [playId, stats] of playStatsMap) {
    const engineType = engineTypeById.get(playId);
    if (!engineType) continue;
    totalCalls += stats.calls;
    if (RUN_ENGINE_TYPES.has(engineType)) runCalls += stats.calls;
    if (PASS_ENGINE_TYPES.has(engineType)) passCalls += stats.calls;
    if (DEEP_ENGINE_TYPES.has(engineType)) deepCalls += stats.calls;
    if (SHORT_ENGINE_TYPES.has(engineType)) shortCalls += stats.calls;
  }

  if (totalCalls < 5) return neutral; // lower threshold for in-game (fewer plays)

  const passRate = passCalls / totalCalls;
  const deepRate = passCalls > 0 ? deepCalls / passCalls : 0.2;
  const shortRate = passCalls > 0 ? shortCalls / passCalls : 0.4;

  return { passRate, runRate: 1 - passRate, deepRate, shortRate, totalCalls };
}

/**
 * Adjust a defensive play's weight based on opponent scouting.
 *
 * Coverage-heavy plays are boosted against pass-heavy offenses.
 * Run-stopping fronts are boosted against run-heavy offenses.
 * Blitzes are suppressed against deep-heavy offenses (high risk).
 *
 * @param intensity — multiplier on all shifts. 1.0 = pre-game scouting,
 *                    1.5 = halftime adjustments (stronger, based on live data).
 *                    Caps still enforce max ±30% per factor.
 * @param coachInt — coach intelligence; scales intensity and adds noise.
 */
function scoutingMultiplier(play: DefensivePlay, scout: ScoutingProfile, intensity: number = 1.0, coachInt?: CoachIntelligence): number {
  // Scale intensity by coach intelligence factor
  const effectiveIntensity = intensity * (coachInt?.factor ?? 1.0);
  let mult = 1.0;

  // Is this a coverage-oriented play? (nickel, dime, quarter packages + zone/man coverage)
  const isCoverageFocused = play.packageId.startsWith('nickel') || play.packageId.startsWith('dime')
    || play.packageId.startsWith('quarter');
  const isRunFocused = play.packageId.includes('goal_line') || play.front === 'goal_line'
    || play.front === 'four_three' || play.front === 'three_four';
  const hasBlitz = !!play.blitz;
  const isDeepCoverage = play.coverage === 'cover_3' || play.coverage === 'cover_4' || play.coverage === 'cover_6';

  // Pass-heavy opponent → boost coverage, suppress run-focus
  if (scout.passRate > 0.55) {
    const passShift = Math.min((scout.passRate - 0.5) * 2 * effectiveIntensity, 0.30);
    if (isCoverageFocused) mult *= 1 + passShift;
    if (isRunFocused && !isCoverageFocused) mult *= 1 - passShift * 0.5;
  }

  // Run-heavy opponent → boost run-stopping, suppress pure coverage
  if (scout.runRate > 0.55) {
    const runShift = Math.min((scout.runRate - 0.5) * 2 * effectiveIntensity, 0.30);
    if (isRunFocused) mult *= 1 + runShift;
    if (isCoverageFocused) mult *= 1 - runShift * 0.5;
  }

  // Deep-heavy passing → favor deep coverage, reduce blitz
  if (scout.deepRate > 0.25) {
    const deepShift = Math.min((scout.deepRate - 0.2) * 2 * effectiveIntensity, 0.25);
    if (isDeepCoverage) mult *= 1 + deepShift;
    if (hasBlitz) mult *= 1 - deepShift;
  }

  // Short-heavy passing → man coverage and blitz are more effective
  if (scout.shortRate > 0.5) {
    const shortShift = Math.min((scout.shortRate - 0.4) * 1.5 * effectiveIntensity, 0.25);
    if (hasBlitz) mult *= 1 + shortShift;
    if (play.coverage === 'man_under' || play.coverage === 'cover_0' || play.coverage === 'cover_1') {
      mult *= 1 + shortShift * 0.5;
    }
  }

  // Apply coach noise (low intelligence → inconsistent adjustments)
  if (coachInt && coachInt.noiseAmpl > 0.001) {
    mult *= 1 + (Math.random() * 2 - 1) * coachInt.noiseAmpl;
  }

  return Math.max(0.1, mult);
}

// ── Defensive play selection ──────────────────────────────────────────────────

function selectDefensivePlay(
  plan:        DefensivePlan,
  bucket:      DownDistanceBucket,
  customBooks: DefensivePlaybook[] = [],
  scout?:      ScoutingProfile,
  halftimeScout?: ScoutingProfile,
  coachInt?:   CoachIntelligence,
  customPlays: DefensivePlay[] = [],
): DefensivePlay | null {
  const allPlaybooks = [...DEFENSIVE_PLAYBOOKS, ...customBooks];
  const playbookId   = plan[bucket] ?? DEFAULT_DEFENSIVE_PLAN[bucket];
  const playbook     = allPlaybooks.find(pb => pb.id === playbookId)
                    ?? DEFENSIVE_PLAYBOOKS.find(pb => pb.id === DEFAULT_DEFENSIVE_PLAN[bucket]);
  if (!playbook) return null;

  const pool = playbook.entries
    .map(entry => {
      const play = DEFENSIVE_PLAYS.find(p => p.id === entry.playId)
                ?? customPlays.find(p => p.id === entry.playId);
      if (!play) return null;
      const baseWeight      = entry.weight;
      const preGameMult     = scout ? scoutingMultiplier(play, scout, 1.0, coachInt) : 1.0;
      const halftimeMult    = halftimeScout ? scoutingMultiplier(play, halftimeScout, 1.5, coachInt) : 1.0;
      return { item: play, weight: baseWeight * preGameMult * halftimeMult };
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
  team:           Team,
  sit:            GameSituation,
  opponent?:      Team,
  halftimeScout?: ScoutingProfile,
): ResolvedDefensivePlay | null {
  if (!team.defensivePlan) {
    defensiveSelectionStats.legacyFallback++;
    return null;
  }
  const bucket   = classifyBucket(sit.down, sit.distance);
  const scout    = opponent ? buildScoutingProfile(opponent.playStats, opponent.customOffensivePlays) : undefined;
  const coachInt = computeCoachIntelligence(team);
  const play     = selectDefensivePlay(team.defensivePlan, bucket, team.customDefensivePlaybooks ?? [], scout, halftimeScout, coachInt, team.customDefensivePlays ?? []);
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
