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

import { type Team, type TeamTendencies, DEFAULT_TENDENCIES } from '../models/Team';
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
import type { MetaProfile }   from '../models/League';

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

// ── Play history & repetition penalties ──────────────────────────────────────
//
// Tracks recent plays per team within a game to penalize repetition.
// History is keyed by team ID so both teams can share one instance.
//
// Penalty rules (multiplicative):
//   Same play ID last play        → ×0.6
//   Same play ID 2+ times in last 6 → ×0.4
//   Same concept repeated in last 6 → ×0.7
//   Same formation in last 6       → ×0.85
//
// Floor: 0.1 (no play is ever fully blocked).

const HISTORY_WINDOW = 6;

interface HistoryEntry {
  playId:      string;
  conceptId:   string | undefined;
  formationId: string;
}

export interface PlayHistory {
  /** Per-team ring buffer of recent plays. */
  recent: Map<string, HistoryEntry[]>;
}

export function createPlayHistory(): PlayHistory {
  return { recent: new Map() };
}

export function recordPlay(history: PlayHistory, teamId: string, play: OffensivePlay): void {
  if (!history.recent.has(teamId)) history.recent.set(teamId, []);
  const buf = history.recent.get(teamId)!;
  buf.push({ playId: play.id, conceptId: play.conceptId, formationId: play.formationId });
  if (buf.length > HISTORY_WINDOW) buf.shift();
}

function repetitionPenalty(history: PlayHistory, teamId: string, play: OffensivePlay): number {
  const buf = history.recent.get(teamId);
  if (!buf || buf.length === 0) return 1.0;

  let mult = 1.0;

  // Count how many times this exact play appeared in the window
  const playCount = buf.filter(e => e.playId === play.id).length;
  const wasLastPlay = buf[buf.length - 1]?.playId === play.id;

  if (playCount >= 2) {
    mult *= 0.4;    // used multiple times recently → heavy penalty
  } else if (wasLastPlay) {
    mult *= 0.6;    // used just last play → moderate penalty
  }

  // Same concept repeated (only if conceptId exists on both)
  if (play.conceptId) {
    const conceptCount = buf.filter(e => e.conceptId === play.conceptId).length;
    if (conceptCount >= 2) {
      mult *= 0.7;
    }
  }

  // Same formation repeated
  const formationCount = buf.filter(e => e.formationId === play.formationId).length;
  if (formationCount >= 2) {
    mult *= 0.85;
  }

  return Math.max(0.1, mult);
}

// ── Tendency-based weight modifiers ──────────────────────────────────────────
//
// Each tendency maps to a small multiplier on play weights by engineType.
// Default (50) → multiplier 1.0 (no change).  Range caps at ±0.25 (±25%).
//
//   runPassBias   → boosts RUN plays when <50, boosts PASS plays when >50
//   aggressiveness → boosts DEEP plays when >50, boosts SHORT plays when <50
//   shotPlayRate   → additional DEEP boost/penalty, stacks with aggressiveness

const RUN_TYPES: ReadonlySet<string>  = new Set(['inside_run', 'outside_run']);
const DEEP_TYPES: ReadonlySet<string> = new Set(['deep_pass']);
const SHORT_TYPES: ReadonlySet<string> = new Set(['short_pass']);

function tendencyMultiplier(tendencies: TeamTendencies, engineType: PlayType): number {
  let mult = 1.0;

  // runPassBias: 0 = run-heavy, 50 = neutral, 100 = pass-heavy
  // Max effect: ±0.25 (25%)
  const rpShift = ((tendencies.runPassBias - 50) / 50) * 0.25;
  if (RUN_TYPES.has(engineType)) {
    mult *= 1 - rpShift;   // low bias → boost runs, high bias → suppress runs
  } else {
    mult *= 1 + rpShift;   // low bias → suppress passes, high bias → boost passes
  }

  // aggressiveness: 0 = conservative (short), 50 = neutral, 100 = aggressive (deep)
  // Max effect: ±0.20 (20%)
  const aggShift = ((tendencies.aggressiveness - 50) / 50) * 0.20;
  if (DEEP_TYPES.has(engineType)) {
    mult *= 1 + aggShift;
  } else if (SHORT_TYPES.has(engineType)) {
    mult *= 1 - aggShift;
  }

  // shotPlayRate: additional deep boost, ±0.15 (15%)
  const shotShift = ((tendencies.shotPlayRate - 50) / 50) * 0.15;
  if (DEEP_TYPES.has(engineType)) {
    mult *= 1 + shotShift;
  }

  return Math.max(0.1, mult); // floor at 0.1 to never fully zero out a play
}

// ── Game context modifiers ───────────────────────────────────────────────────
//
// Situational awareness: score, time, and field position tilt play weights.
// All multipliers are subtle (max ±25%) and never zero out a play.
//
// Time remaining is derived from quarter + clockSeconds (per-quarter).
// "Late game" = Q4 with < 180 seconds left in the quarter.

const PASS_TYPES: ReadonlySet<string> = new Set(['short_pass', 'medium_pass', 'deep_pass']);

function contextMultiplier(engineType: PlayType, sit: GameSituation): number {
  let mult = 1.0;
  const isRun  = RUN_TYPES.has(engineType);
  const isPass = PASS_TYPES.has(engineType);
  const isDeep = DEEP_TYPES.has(engineType);

  // Late game = Q4, < 180 seconds remaining in the quarter
  const lateGame = sit.quarter === 4 && sit.clockSeconds < 180;

  // A. Score + time pressure
  if (lateGame && sit.scoreDiff < -7) {
    // Losing late: air it out
    if (isPass) mult *= 1.20;
    if (isDeep) mult *= 1.15;
  } else if (lateGame && sit.scoreDiff > 7) {
    // Winning late: milk the clock
    if (isRun)  mult *= 1.20;
    if (isDeep) mult *= 0.80;
  }

  // B. Field position
  if (sit.yardLine >= 80) {
    // Red zone: deep shots are low-percentage (limited field)
    if (isDeep) mult *= 0.70;
  } else if (sit.yardLine <= 10) {
    // Backed up near own goal line: protect the ball
    if (isPass) mult *= 0.85;
    if (isRun)  mult *= 1.10;
  }

  return Math.max(0.1, mult);
}

// ── League meta counter-trend ────────────────────────────────────────────────
//
// When the league meta leans heavily one way, plays that go against the
// grain get a small boost (defenses are tuned to the meta, so counter-meta
// is slightly more effective). Max ±10%.

function metaMultiplier(engineType: PlayType, meta?: MetaProfile): number {
  if (!meta || meta.totalCalls < 50) return 1.0;

  let mult = 1.0;
  const isRun  = RUN_TYPES.has(engineType);
  const isPass = PASS_TYPES.has(engineType);
  const isDeep = DEEP_TYPES.has(engineType);

  // Pass-heavy meta → slight run boost (counter-meta)
  if (meta.passRate > 0.55 && isRun) {
    mult *= 1 + Math.min((meta.passRate - 0.5) * 1.0, 0.10);
  }
  // Run-heavy meta → slight pass boost
  if (meta.runRate > 0.55 && isPass) {
    mult *= 1 + Math.min((meta.runRate - 0.5) * 1.0, 0.10);
  }
  // Deep-heavy meta → slight short boost
  if (meta.deepRate > 0.30 && SHORT_TYPES.has(engineType)) {
    mult *= 1 + Math.min((meta.deepRate - 0.25) * 0.8, 0.08);
  }
  // Short-heavy meta → slight deep boost
  if (meta.deepRate < 0.15 && isDeep) {
    mult *= 1 + Math.min((0.20 - meta.deepRate) * 0.8, 0.08);
  }

  return mult;
}

// ── Play selection ────────────────────────────────────────────────────────────

interface SelectionResult {
  play:        OffensivePlay;
  explanation: string[];
}

function selectOffensivePlay(
  plan:        OffensivePlan,
  bucket:      DownDistanceBucket,
  customBooks: Playbook[] = [],
  tendencies:  TeamTendencies = DEFAULT_TENDENCIES,
  history?:    PlayHistory,
  teamId?:     string,
  sit?:        GameSituation,
  customPlays: OffensivePlay[] = [],
  meta?:       MetaProfile,
): SelectionResult | null {
  const allPlaybooks = [...PLAYBOOKS, ...customBooks];
  const playbookId   = plan[bucket] ?? DEFAULT_OFFENSIVE_PLAN[bucket];
  const playbook     = allPlaybooks.find(pb => pb.id === playbookId)
                    ?? PLAYBOOKS.find(pb => pb.id === DEFAULT_OFFENSIVE_PLAN[bucket]);
  if (!playbook) return null;

  const pool = playbook.entries
    .map(entry => {
      const play = OFFENSIVE_PLAYS.find(p => p.id === entry.playId)
                ?? customPlays.find(p => p.id === entry.playId);
      if (!play) return null;
      const baseWeight    = entry.weight;
      const tendencyMult  = tendencyMultiplier(tendencies, play.engineType);
      const repPenalty    = (history && teamId) ? repetitionPenalty(history, teamId, play) : 1.0;
      const ctxMult       = sit ? contextMultiplier(play.engineType, sit) : 1.0;
      const metaMult      = metaMultiplier(play.engineType, meta);
      const finalWeight   = baseWeight * tendencyMult * repPenalty * ctxMult * metaMult;
      return { item: play, weight: finalWeight, baseWeight, tendencyMult, repPenalty, ctxMult, metaMult };
    })
    .filter((p): p is { item: OffensivePlay; weight: number; baseWeight: number; tendencyMult: number; repPenalty: number; ctxMult: number; metaMult: number } => p !== null);

  // Debug: log full weight pipeline
  if (DEBUG && Math.random() < DEBUG_SAMPLE_RATE && pool.length > 0) {
    const hasEffect = pool.some(p =>
      Math.abs(p.tendencyMult - 1.0) > 0.001 || Math.abs(p.repPenalty - 1.0) > 0.001 || Math.abs(p.ctxMult - 1.0) > 0.001 || Math.abs(p.metaMult - 1.0) > 0.001
    );
    if (hasEffect) {
      const ctx = sit ? ` Q${sit.quarter} ${sit.clockSeconds}s diff=${sit.scoreDiff} yl=${sit.yardLine}` : '';
      const lines = pool.map(p =>
        `  ${p.item.id} (${p.item.engineType}): base=${p.baseWeight} ×tend=${p.tendencyMult.toFixed(2)} ×rep=${p.repPenalty.toFixed(2)} ×ctx=${p.ctxMult.toFixed(2)} ×meta=${p.metaMult.toFixed(2)} =${p.weight.toFixed(1)}`
      ).join('\n');
      console.log(
        `[PlaySel:Weights] bucket=${bucket}${ctx}\n${lines}`
      );
    }
  }

  const picked = weightedPick(pool);
  if (!picked) return null;

  // Build explanation for the selected play
  const entry = pool.find(p => p.item === picked)!;
  const explanation = buildExplanation(entry, tendencies, history, teamId, sit, meta);

  return { play: picked, explanation };
}

// ── Explanation builder ──────────────────────────────────────────────────────

function buildExplanation(
  entry: { item: OffensivePlay; baseWeight: number; tendencyMult: number; repPenalty: number; ctxMult: number; metaMult: number; weight: number },
  tendencies: TeamTendencies,
  history?: PlayHistory,
  teamId?: string,
  sit?: GameSituation,
  meta?: MetaProfile,
): string[] {
  const reasons: string[] = [];
  const play = entry.item;

  // Tendency reasons
  if (Math.abs(entry.tendencyMult - 1.0) > 0.01) {
    if (tendencies.runPassBias !== 50) {
      const isRun = RUN_TYPES.has(play.engineType);
      if (isRun && tendencies.runPassBias < 50) {
        reasons.push('Run-heavy tendency → run boost');
      } else if (!isRun && tendencies.runPassBias > 50) {
        reasons.push('Pass-heavy tendency → pass boost');
      } else if (isRun && tendencies.runPassBias > 50) {
        reasons.push('Pass-heavy tendency → run suppressed');
      } else if (!isRun && tendencies.runPassBias < 50) {
        reasons.push('Run-heavy tendency → pass suppressed');
      }
    }
    if (tendencies.aggressiveness !== 50) {
      if (DEEP_TYPES.has(play.engineType) && tendencies.aggressiveness > 50) {
        reasons.push('Aggressive tendency → deep boost');
      } else if (SHORT_TYPES.has(play.engineType) && tendencies.aggressiveness > 50) {
        reasons.push('Aggressive tendency → short suppressed');
      } else if (DEEP_TYPES.has(play.engineType) && tendencies.aggressiveness < 50) {
        reasons.push('Conservative tendency → deep suppressed');
      } else if (SHORT_TYPES.has(play.engineType) && tendencies.aggressiveness < 50) {
        reasons.push('Conservative tendency → short boost');
      }
    }
    if (tendencies.shotPlayRate !== 50 && DEEP_TYPES.has(play.engineType)) {
      reasons.push(tendencies.shotPlayRate > 50 ? 'High shot play rate → deep boost' : 'Low shot play rate → deep suppressed');
    }
  }

  // Repetition reasons
  if (Math.abs(entry.repPenalty - 1.0) > 0.01) {
    if (entry.repPenalty <= 0.5) {
      reasons.push('Repeated play → heavy penalty');
    } else if (entry.repPenalty < 0.85) {
      reasons.push('Recent repeat → penalty applied');
    } else {
      reasons.push('Similar formation/concept → mild penalty');
    }
  }

  // Context reasons
  if (sit && Math.abs(entry.ctxMult - 1.0) > 0.01) {
    const lateGame = sit.quarter === 4 && sit.clockSeconds < 180;
    if (lateGame && sit.scoreDiff < -7) {
      reasons.push('Trailing late → pass emphasis');
    } else if (lateGame && sit.scoreDiff > 7) {
      if (RUN_TYPES.has(play.engineType)) reasons.push('Winning late → run emphasis');
      if (DEEP_TYPES.has(play.engineType)) reasons.push('Winning late → deep reduced');
    }
    if (sit.yardLine >= 80 && DEEP_TYPES.has(play.engineType)) {
      reasons.push('Red zone → deep reduced');
    }
    if (sit.yardLine <= 10) {
      if (PASS_TYPES.has(play.engineType)) reasons.push('Backed up → pass suppressed');
      if (RUN_TYPES.has(play.engineType)) reasons.push('Backed up → run boost');
    }
  }

  // Meta counter-trend reasons
  if (meta && Math.abs(entry.metaMult - 1.0) > 0.01) {
    if (entry.metaMult > 1.0) {
      reasons.push('Counter-meta → slight boost');
    }
  }

  return reasons;
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
  play:         OffensivePlay;
  engineType:   PlayType;
  explanation?: string[];
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
  team:    Team,
  sit:     GameSituation,
  history?: PlayHistory,
  meta?:   MetaProfile,
): ResolvedPlay | null {
  if (!team.offensivePlan) {
    playSelectionStats.legacyFallback++;
    return null;
  }
  const bucket     = classifyBucket(sit.down, sit.distance);
  const tendencies = team.tendencies ?? DEFAULT_TENDENCIES;
  const result     = selectOffensivePlay(
    team.offensivePlan, bucket, team.customOffensivePlaybooks ?? [],
    tendencies, history, team.id, sit, team.customOffensivePlays ?? [], meta,
  );
  if (!result) {
    playSelectionStats.newPathFallback++;
    return null;
  }
  // Record selected play into history for future repetition penalties
  if (history) recordPlay(history, team.id, result.play);
  playSelectionStats.newPathResolved++;
  const fdc = team.formationDepthCharts?.[result.play.formationId];
  const hasFormation = !!(fdc && Object.keys(fdc).length > 0);
  if (hasFormation) playSelectionStats.formationApplied++;
  debugLog(team, sit, bucket, result.play, hasFormation);
  const resolved: ResolvedPlay = { play: result.play, engineType: result.play.engineType };
  if (result.explanation.length > 0) resolved.explanation = result.explanation;
  return resolved;
}
