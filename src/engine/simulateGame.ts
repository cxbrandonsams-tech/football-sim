import {
  type Player,
  type QBRatings, type RBRatings, type WRRatings, type TERatings,
  type OLRatings, type DLRatings, type LBRatings, type CBRatings,
  type SafetyRatings, type SpecialTeamsRatings,
  calcRange,
} from '../models/Player';
import { type Team } from '../models/Team';
import { type Game } from '../models/Game';
import { type DepthChart, type DepthChartSlot } from '../models/DepthChart';
import { type PlayEvent, type PlayType, type PlayResult } from '../models/PlayEvent';
import { DEFAULT_PLAYCALLING } from '../models/Playcalling';
import { buildBoxScoreFromGame } from './gameStats';
import { computeSchemeAdjustment } from './schemeBonus';
import { getPersonality } from '../models/Coach';
import { TUNING } from './config';

const cfg = TUNING;

// ── Injury / fatigue result types ─────────────────────────────────────────────

export interface GameInjury {
  playerId: string;
  teamId:   string;
  weeks:    number;
}

export interface GameResult {
  game:     Game;
  injuries: GameInjury[];
}

// ── Depth-chart helpers ───────────────────────────────────────────────────────

function firstHealthy(team: Team, slot: DepthChartSlot): Player | undefined {
  return team.depthChart[slot].find(p => p !== null && p.injuryWeeksRemaining === 0) ?? undefined;
}

function lastName(team: Team, slot: DepthChartSlot): string {
  const name  = firstHealthy(team, slot)?.name ?? '';
  const parts = name.split(' ');
  return parts[parts.length - 1] ?? name;
}

function pid(team: Team, slot: DepthChartSlot): string | undefined {
  return firstHealthy(team, slot)?.id;
}

// ── Typed rating accessors ────────────────────────────────────────────────────

function qb(team: Team): QBRatings | null {
  const p = firstHealthy(team, 'QB');
  return p?.trueRatings.position === 'QB' ? (p.trueRatings as QBRatings) : null;
}

function rb(team: Team): RBRatings | null {
  const p = firstHealthy(team, 'RB');
  return p?.trueRatings.position === 'RB' ? (p.trueRatings as RBRatings) : null;
}

function wr(team: Team): WRRatings | null {
  const p = firstHealthy(team, 'WR');
  return p?.trueRatings.position === 'WR' ? (p.trueRatings as WRRatings) : null;
}

function te(team: Team): TERatings | null {
  const p = firstHealthy(team, 'TE');
  return p?.trueRatings.position === 'TE' ? (p.trueRatings as TERatings) : null;
}

function ol(team: Team): OLRatings | null {
  const p = firstHealthy(team, 'OL');
  if (!p) return null;
  const pos = p.trueRatings.position;
  return (pos === 'OT' || pos === 'OG' || pos === 'C') ? (p.trueRatings as OLRatings) : null;
}

function dl(team: Team, slot: 'DE' | 'DT'): DLRatings | null {
  const p = firstHealthy(team, slot);
  if (!p) return null;
  const pos = p.trueRatings.position;
  return (pos === 'DE' || pos === 'DT') ? (p.trueRatings as DLRatings) : null;
}

function lb(team: Team): LBRatings | null {
  const p = firstHealthy(team, 'LB');
  if (!p) return null;
  const pos = p.trueRatings.position;
  return (pos === 'OLB' || pos === 'MLB') ? (p.trueRatings as LBRatings) : null;
}

function cb(team: Team): CBRatings | null {
  const p = firstHealthy(team, 'CB');
  return p?.trueRatings.position === 'CB' ? (p.trueRatings as CBRatings) : null;
}

function safety(team: Team): SafetyRatings | null {
  const p = firstHealthy(team, 'S');
  if (!p) return null;
  const pos = p.trueRatings.position;
  return (pos === 'FS' || pos === 'SS') ? (p.trueRatings as SafetyRatings) : null;
}

function k(team: Team): SpecialTeamsRatings | null {
  const p = firstHealthy(team, 'K');
  if (!p) return null;
  const pos = p.trueRatings.position;
  return (pos === 'K' || pos === 'P') ? (p.trueRatings as SpecialTeamsRatings) : null;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function avg(...vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Weighted blend of two values.
 * GDD: Speed impacts separation at ALL depths (with depth scaling).
 * GDD: Arm Strength impacts ALL throws (with depth scaling).
 * Used to mix primary and secondary contributors per play depth.
 */
function wt(a: number, aW: number, b: number, bW: number): number {
  return a * aW + b * bW;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ── In-game injury / fatigue helpers ─────────────────────────────────────────

/** Returns a team copy with in-game injured players marked unavailable (weeksRemaining=999). */
function withInGameInjuries(team: Team, injured: Set<string>): Team {
  if (injured.size === 0) return team;
  const depthChart = { ...team.depthChart } as DepthChart;
  for (const slot of Object.keys(depthChart) as DepthChartSlot[]) {
    const players = depthChart[slot];
    const updated = players.map(p =>
      p !== null && injured.has(p.id) ? { ...p, injuryWeeksRemaining: 999 } : p,
    );
    if (updated.some((p, i) => p !== players[i])) {
      depthChart[slot] = updated;
    }
  }
  return { ...team, depthChart };
}

function rollInjuryWeeks(): number {
  const r   = Math.random();
  const { minor, moderate, major } = cfg.injury;
  if (r < minor.weight)                        return randInt(minor.weeksMin,    minor.weeksMax);
  if (r < minor.weight + moderate.weight)      return randInt(moderate.weeksMin, moderate.weeksMax);
  return randInt(major.weeksMin, major.weeksMax);
}

/** Returns weeks injured (≥1), or null if no injury. */
function rollInjury(player: Player, fatigue: number): number | null {
  const inj      = cfg.injury;
  const ratings  = player.trueRatings;
  const discipline = ratings.position !== 'QB'
    ? ((ratings as { personality?: { discipline?: number } }).personality?.discipline ?? 50)
    : 50;
  const staminaPenalty = Math.max(0, (70 - (player.stamina ?? 60)) * inj.staminaInjuryScale);
  const chance = Math.max(
    inj.minChancePerPlay,
    inj.baseChancePerPlay
      - (discipline - 50) * inj.disciplineReduction
      + staminaPenalty
      + fatigue * inj.baseChancePerPlay * (inj.fatigueMult - 1),
  );
  return Math.random() < chance ? rollInjuryWeeks() : null;
}

// ── Play selection ────────────────────────────────────────────────────────────

/**
 * Select a play type from the offense team's playcalling weights,
 * then apply small down-and-distance nudges.
 *
 * Weights drive the base distribution; D&D only adjusts within ±15pp.
 */
function selectPlayType(off: Team, down: number, distance: number): PlayType {
  const w      = off.playcalling ?? DEFAULT_PLAYCALLING;
  const clamp  = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Base run/pass split from user weights
  let runPct = w.runPct / 100;

  // Down & distance nudges (small, never swing > 15pp)
  if (distance <= 2)       runPct = clamp(runPct + 0.15, 0.10, 0.90);
  else if (distance >= 8)  runPct = clamp(runPct - 0.10, 0.10, 0.90);

  if (Math.random() < runPct) {
    // Run play — inside vs outside
    const insideFrac = w.insideRunPct / 100;
    return Math.random() < insideFrac ? 'inside_run' : 'outside_run';
  }

  // Pass play — short / medium / deep
  const shortFrac  = w.shortPassPct  / 100;
  const medFrac    = w.mediumPassPct / 100;
  const deepFrac   = Math.max(0, 1 - shortFrac - medFrac);
  const total      = shortFrac + medFrac + deepFrac;
  const r          = Math.random() * total;
  if (r < shortFrac)              return 'short_pass';
  if (r < shortFrac + medFrac)    return 'medium_pass';
  return 'deep_pass';
}

// ── Matchup ratings using new position-specific fields ────────────────────────

function offRating(off: Team, type: PlayType): number {
  switch (type) {
    case 'inside_run':
      // GDD: TE acts as hybrid blocker — blended into OL run blocking composite
      return avg(
        wt(ol(off)?.runBlocking ?? 50, 1 - cfg.run.teBlockingWeight, te(off)?.blocking ?? 50, cfg.run.teBlockingWeight),
        ol(off)?.awareness    ?? 50,
        rb(off)?.power        ?? 50,
        rb(off)?.vision       ?? 50,
      );
    case 'outside_run':
      // GDD: TE blocking also contributes on outside runs
      return avg(
        rb(off)?.speed        ?? 50,
        rb(off)?.elusiveness  ?? 50,
        rb(off)?.vision       ?? 50,
        wt(ol(off)?.runBlocking ?? 50, 1 - cfg.run.teBlockingWeight, te(off)?.blocking ?? 50, cfg.run.teBlockingWeight),
      );
    case 'short_pass':
      // GDD: Arm Strength impacts ALL throws (minor weight at short depth)
      // GDD: Speed impacts separation at ALL depths (minor weight at short)
      return avg(
        wt(qb(off)?.shortAccuracy ?? 50, 0.80, qb(off)?.armStrength ?? 50, 0.20),
        qb(off)?.decisionMaking ?? 50,
        wt(wr(off)?.routeRunning ?? 50, 0.80, wr(off)?.speed ?? 50, 0.20),
        wr(off)?.hands ?? 50,
      );
    case 'medium_pass':
      // GDD: Arm Strength impacts ALL throws (moderate weight at medium depth)
      // GDD: Speed impacts separation at ALL depths (moderate weight at medium)
      // NOTE: wr.yac removed — YAC only applies post-catch in the YAC phase
      return avg(
        wt(qb(off)?.mediumAccuracy ?? 50, 0.60, qb(off)?.armStrength ?? 50, 0.40),
        qb(off)?.processing ?? 50,
        wt(wr(off)?.routeRunning ?? 50, 0.55, wr(off)?.speed ?? 50, 0.45),
      );
    case 'deep_pass':
      // GDD: Arm Strength impacts ALL throws (high weight at deep)
      // GDD: Speed affects deep routes and breakaway — dominant factor at deep
      // NOTE: wr.yac removed — YAC only applies post-catch in the YAC phase
      return avg(
        wt(qb(off)?.deepAccuracy ?? 50, 0.40, qb(off)?.armStrength ?? 50, 0.60),
        qb(off)?.decisionMaking ?? 50,
        wr(off)?.speed ?? 50,
      );
    default:
      return 60;
  }
}

function defRating(def: Team, type: PlayType): number {
  switch (type) {
    case 'inside_run':
      return avg(
        dl(def, 'DT')?.runDefense  ?? 50,
        dl(def, 'DT')?.discipline  ?? 50,
        lb(def)?.runDefense        ?? 50,
        lb(def)?.pursuit           ?? 50,
      );
    case 'outside_run':
      return avg(
        dl(def, 'DE')?.passRush    ?? 50,  // edge speed matters on outside runs
        lb(def)?.speed             ?? 50,
        lb(def)?.pursuit           ?? 50,
        cb(def)?.speed             ?? 50,
      );
    case 'short_pass':
      // GDD: Man coverage — RouteRunning+Speed vs ManCoverage+Speed+Awareness
      // Short routes are primarily man coverage situations
      return avg(
        wt(cb(def)?.manCoverage ?? 50, 0.60, cb(def)?.zoneCoverage ?? 50, 0.40),
        wt(cb(def)?.speed       ?? 50, 0.60, cb(def)?.awareness    ?? 50, 0.40),
        lb(def)?.coverage    ?? 50,
        lb(def)?.awareness   ?? 50,
      );
    case 'medium_pass':
      // GDD: Zone coverage — ZoneCoverage+Awareness (primary) + Speed
      // Medium routes blend man and zone; safeties help over the top
      return avg(
        cb(def)?.manCoverage  ?? 50,
        wt(cb(def)?.zoneCoverage ?? 50, 0.70, cb(def)?.awareness ?? 50, 0.30),
        wt(safety(def)?.zoneCoverage ?? 50, 0.65, safety(def)?.awareness ?? 50, 0.35),
        safety(def)?.speed ?? 50,
      );
    case 'deep_pass': {
      // GDD: Safety Range reduces big plays. Range is hidden derived: Speed*0.6 + Awareness*0.4
      const sf = safety(def);
      const derivedRange = sf ? calcRange(sf) : 50;
      return avg(
        cb(def)?.speed        ?? 50,
        cb(def)?.zoneCoverage ?? 50,
        // derived Range is the primary safety contribution on deep passes
        derivedRange,
        wt(sf?.zoneCoverage ?? 50, 0.50, sf?.awareness ?? 50, 0.50),
      );
    }
    default:
      return 60;
  }
}

// ── Pass phase helpers ────────────────────────────────────────────────────────

/**
 * Phase: Separation.
 * Resolves how open the receiver gets based on depth (man vs zone behavior).
 *   Short  → Man coverage: WR routeRunning+speed vs CB manCoverage+speed+awareness
 *   Medium → Zone blend: WR routeRunning+speed vs CB zoneCoverage+awareness + LB coverage help
 *   Deep   → Zone/Safety: WR speed-dominant vs CB speed+zone + Safety range (hidden derived stat)
 *
 * Returns a separation score 0 (completely covered) → 1 (wide open).
 * pressureLevel reduces separation (QB can't hold long enough for routes to develop).
 * playActionBonus is passed in from gameplan; moves defenders slightly on play fakes.
 */
function resolveSeparation(
  depth: 'short' | 'medium' | 'deep',
  off: Team,
  def: Team,
  pressureLevel: number,
  playActionBonus: number,
): number {
  const wrR  = wr(off);
  const cbR  = cb(def);
  const lbR  = lb(def);
  const sfR  = safety(def);

  const wrRoute = wrR?.routeRunning ?? 50;
  const wrSpeed = wrR?.speed        ?? 50;

  let wrScore: number;
  let defScore: number;

  if (depth === 'short') {
    // Man coverage — CB mirrors WR at the line; routeRunning precision is the separator
    wrScore  = wrRoute * 0.65 + wrSpeed * 0.35;
    const cbMan  = cbR?.manCoverage ?? 50;
    const cbSpd  = cbR?.speed       ?? 50;
    const cbAwar = cbR?.awareness   ?? 50;
    defScore = cbMan * 0.55 + cbSpd * 0.30 + cbAwar * 0.15;
  } else if (depth === 'medium') {
    // Zone coverage — role-based, not blended man.
    // CB is the PRIMARY zone holder: drops into their zone, reads routes, contests windows.
    //   zoneCoverage + awareness dominate; speed is a closing/reaction factor (not mirroring).
    // LB is CLOSING HELP: doesn't own the coverage zone but can jump a window late.
    //   Awareness-dominant — fast but unaware LB won't be in the right spot.
    wrScore = wrRoute * 0.55 + wrSpeed * 0.45;
    const cbZone = cbR?.zoneCoverage ?? 50;
    const cbAwar = cbR?.awareness    ?? 50;
    const cbSpd  = cbR?.speed        ?? 50;
    const lbAwar = lbR?.awareness    ?? 50;
    const lbSpd  = lbR?.speed        ?? 50;
    // Primary zone holder: awareness + zone are the skill, speed is late-close only
    const primaryCoverage = cbZone * 0.55 + cbAwar * 0.35 + cbSpd * 0.10;
    // Closing help: awareness first (getting to the right spot), speed second (arriving in time)
    const closingHelp = lbAwar * 0.65 + lbSpd * 0.35;
    // CB owns the zone (70%), LB provides closing help (30%)
    defScore = primaryCoverage * 0.70 + closingHelp * 0.30;
  } else {
    // Deep — Safety range (hidden: speed*0.6 + awareness*0.4) is primary; CB tracking speed matters
    wrScore = wrSpeed * 0.70 + wrRoute * 0.30;
    const cbSpd    = cbR?.speed        ?? 50;
    const cbZone   = cbR?.zoneCoverage ?? 50;
    const sfRange  = sfR ? calcRange(sfR) : 50;  // hidden derived stat
    const sfZone   = sfR?.zoneCoverage  ?? 50;
    const cbDef    = cbSpd  * 0.60 + cbZone  * 0.40;
    const sfDef    = sfRange * 0.70 + sfZone * 0.30;
    defScore = avg(cbDef, sfDef);
  }

  // Base separation (offense-favored numerator vs coverage-scaled denominator)
  const base = wrScore / (wrScore + defScore * cfg.pass.coverageResistance + 1);

  // Pressure: QB can't let routes fully develop under heavy pressure
  const pressurePenalty = pressureLevel * 0.08;

  return Math.max(0, Math.min(1, base + playActionBonus - pressurePenalty));
}

/**
 * Phase: Throw quality.
 * Combines QB accuracy for the given depth, arm strength (scaled by depth),
 * pocket pressure, and the separation score the receiver achieved.
 * Returns a throw quality score 0 (terrible) → 1 (perfect).
 */
function resolveThrowQuality(
  depth: 'short' | 'medium' | 'deep',
  off: Team,
  pressureLevel: number,
  separationScore: number,
): number {
  const qbR = qb(off);

  // Base accuracy rating for this depth
  const accuracy =
    depth === 'short'  ? (qbR?.shortAccuracy  ?? 50) :
    depth === 'medium' ? (qbR?.mediumAccuracy  ?? 50) :
                         (qbR?.deepAccuracy    ?? 50);

  // Arm strength contribution scales with depth (irrelevant short, critical deep)
  const armStr    = qbR?.armStrength ?? 50;
  const armWeight = depth === 'short' ? 0.10 : depth === 'medium' ? 0.25 : 0.45;
  const effectiveAccuracy = accuracy * (1 - armWeight) + armStr * armWeight;

  const accuracyBase =
    depth === 'short'  ? cfg.pass.shortAccuracyBase  :
    depth === 'medium' ? cfg.pass.mediumAccuracyBase :
                         cfg.pass.deepAccuracyBase;

  const accuracyMod     = (effectiveAccuracy - 70) * cfg.pass.accuracyRatingScale;
  const pressurePenalty = pressureLevel * 0.18;
  // Separation bonus: open receiver gives QB a bigger target window.
  // Weight is tunable via cfg.pass.separationThrowScale.
  // At separationThrowScale=0.45 and avg separation=0.535, this contributes ~0.241
  // to throw quality — which is why accuracyBase values were lowered correspondingly.
  const separationBonus = separationScore * cfg.pass.separationThrowScale;

  return Math.max(0, Math.min(1, accuracyBase + accuracyMod - pressurePenalty + separationBonus));
}

// ── Window states ─────────────────────────────────────────────────────────────

/**
 * Discrete football pass-window states derived from the separation score.
 * Layers categorical behavior (throwaway, ball-skills contest, accuracy reliance)
 * on top of the continuous separation → throwQuality pipeline.
 */
type WindowState = 'open' | 'soft_open' | 'tight' | 'contested' | 'covered';

/**
 * Maps the 0-1 separation score to a discrete window state.
 * Thresholds are calibrated so that average-rated matchups (separation ≈ 0.40)
 * fall in 'tight', preserving baseline completion rates.
 */
function resolveWindowState(separation: number): WindowState {
  const w = cfg.pass.window;
  if (separation >= w.openThreshold)       return 'open';
  if (separation >= w.softOpenThreshold)   return 'soft_open';
  if (separation >= w.tightThreshold)      return 'tight';
  if (separation >= w.contestedThreshold)  return 'contested';
  return 'covered';
}

/**
 * QB decision on whether to throw into the resolved window.
 * Good QBs (high decisionMaking) throw away covered windows rather than force it.
 * Returns true if the QB elects to throw the ball away (incomplete, no INT risk).
 */
function resolveThrowaway(
  windowState: WindowState,
  qbDM: number,
  pressureLevel: number,
): boolean {
  if (windowState !== 'covered') return false;
  const w = cfg.pass.window;
  const throwawayChance = Math.max(0,
    w.throwawayBaseChance
    + Math.max(0, qbDM - w.throwawayDMThreshold) * w.throwawayDMScale
    - pressureLevel * w.throwawayPressurePenalty,
  );
  return Math.random() < throwawayChance;
}

// ── Yards ─────────────────────────────────────────────────────────────────────

function yardsOnSuccess(type: PlayType, speedRating: number): number {
  let base: number;
  switch (type) {
    case 'inside_run':  base = randInt(cfg.run.insideRunMin,  cfg.run.insideRunMax);  break;
    case 'outside_run': base = randInt(cfg.run.outsideRunMin, cfg.run.outsideRunMax); break;
    case 'short_pass':  base = randInt(cfg.passYards.shortMin,  cfg.passYards.shortMax);  break;
    case 'medium_pass': base = randInt(cfg.passYards.mediumMin, cfg.passYards.mediumMax); break;
    case 'deep_pass':   base = randInt(cfg.passYards.deepMin,   cfg.passYards.deepMax);   break;
    default:            base = 5;
  }
  // Big-play burst for fast skill players
  // GDD: Inside = lower breakaway chance, Outside = higher breakaway chance (runs only)
  // Pass plays retain the original burstChance
  const breakawayChance =
    type === 'inside_run'  ? cfg.run.insideBreakawayChance  :
    type === 'outside_run' ? cfg.run.outsideBreakawayChance :
    cfg.bigPlay.burstChance;
  if (speedRating > cfg.bigPlay.speedThreshold && Math.random() < breakawayChance) {
    base += randInt(cfg.bigPlay.burstBonusMin, cfg.bigPlay.burstBonusMax);
  }
  return base;
}

function yardsOnFail(type: PlayType): number {
  if (type === 'inside_run' || type === 'outside_run') {
    return randInt(cfg.run.failYardsMin, cfg.run.failYardsMax);
  }
  return 0; // incomplete pass
}

// ── Single play ───────────────────────────────────────────────────────────────

function simulatePlay(
  off: Team, def: Team, type: PlayType,
  quarter: number, down: number, distance: number, yardLine: number,
  fatigueAdj = 0,   // positive = net help for offense; negative = net hurt for offense
): PlayEvent {
  const base = { type, offenseTeamId: off.id, defenseTeamId: def.id, quarter, down, distance, yardLine };

  // Punt
  if (type === 'punt') {
    return { ...base, result: 'success' as PlayResult, yards: 0 };
  }

  // Field goal
  if (type === 'field_goal') {
    const fgDist  = (100 - yardLine) + 17;
    const kRating = k(off);
    const kPower  = kRating?.kickPower    ?? 70;
    const kAcc    = kRating?.kickAccuracy ?? 70;
    const chance  = Math.max(
      cfg.fieldGoal.minChance,
      cfg.fieldGoal.baseChance
        - (fgDist - 20) * cfg.fieldGoal.distancePenalty
        + ((kPower + kAcc) / 2 - 70) * cfg.fieldGoal.kickPowerBonus,
    );
    const made  = Math.random() < chance;
    const kId   = pid(off, 'K');
    return {
      ...base,
      result:      made ? 'field_goal_good' : 'field_goal_miss',
      yards:       0,
      ballCarrier: lastName(off, 'K'),
      ...(kId !== undefined ? { ballCarrierId: kId } : {}),
    };
  }

  const isPass = type === 'short_pass' || type === 'medium_pass' || type === 'deep_pass';
  const isRun  = type === 'inside_run' || type === 'outside_run';

  // Sack / scramble check
  // pressureLevel is derived here and reused in separation + INT phases below
  let pressureLevel = 0;
  if (isPass) {
    const dePassRush    = dl(def, 'DE')?.passRush    ?? 50;
    const olBlocking    = ol(off)?.passBlocking ?? 50;
    const advantage     = dePassRush - olBlocking;
    const rawSackChance = Math.max(
      cfg.pass.minSackChance,
      Math.min(cfg.pass.maxSackChance, cfg.pass.baseSackChance + advantage * cfg.pass.sackRatingScale),
    );
    // GDD: Mobility affects sacks/scramble — mobile QB escapes pressure more often
    const qbMobility         = qb(off)?.mobility ?? 50;
    const mobilityBonus      = Math.max(0, (qbMobility - 50) * cfg.pass.mobilityReductionScale);
    const adjustedSackChance = Math.max(0, rawSackChance - mobilityBonus);
    const sackRoll           = Math.random();

    // pressureLevel: how much pocket pressure affects QB throws (0=clean, 1=heavy)
    pressureLevel = Math.max(0, Math.min(1, (advantage / 50) * 0.8));

    if (sackRoll < adjustedSackChance) {
      // QB was brought down — sack
      const qbId = pid(off, 'QB');
      const deId = pid(def, 'DE');
      return {
        ...base,
        type:        'sack',
        result:      'fail',
        yards:       randInt(-8, -2),
        ballCarrier: lastName(off, 'QB'),
        ...(qbId !== undefined ? { ballCarrierId: qbId } : {}),
        ...(deId !== undefined ? { defPlayerId:   deId } : {}),
      };
    }
    // Scramble — independent of the sack window.
    // A QB may tuck and run based on pocket pressure AND their own mobility.
    // Average QBs scramble rarely (~2%); mobile QBs scramble more under pressure (~6-8%).
    // Formula: (scrambleBaseOpportunity + pressureLevel * scramblePressureScale) * (mobility / 100)
    const scrambleChance =
      (cfg.pass.scrambleBaseOpportunity + pressureLevel * cfg.pass.scramblePressureScale)
      * (qbMobility / 100);
    if (Math.random() < scrambleChance) {
      const scrambleYards = randInt(cfg.pass.scrambleYardsMin, cfg.pass.scrambleYardsMax);
      const newYL         = yardLine + scrambleYards;
      const isTD_s        = newYL >= 100;
      const qbId          = pid(off, 'QB');
      return {
        ...base,
        type:        'scramble',
        result:      isTD_s ? 'touchdown' : 'success',
        yards:       isTD_s ? 100 - yardLine : scrambleYards,
        ballCarrier: lastName(off, 'QB'),
        ...(qbId !== undefined ? { ballCarrierId: qbId } : {}),
      };
    }
  }

  // Fumble check
  if (isRun) {
    const ballSec   = rb(off)?.ballSecurity ?? 60;
    const fumbleChance = Math.max(
      0,
      cfg.run.baseFumbleChance - (ballSec - 50) * cfg.run.ballSecurityFumbleReduction,
    );
    if (Math.random() < fumbleChance) {
      const rbId = pid(off, 'RB');
      return {
        ...base,
        type:        'fumble',
        result:      'turnover',
        yards:       0,
        ballCarrier: lastName(off, 'RB'),
        ...(rbId !== undefined ? { ballCarrierId: rbId } : {}),
      };
    }
  }

  // Success/fail
  const schemeAdj = computeSchemeAdjustment(off, def, type);
  let successProb: number;

  if (isPass) {
    // ── Pass: explicit phase chain ────────────────────────────────────────────
    // Phase 1: Protection (pressureLevel already resolved above in sack check)
    //
    // Phase 2: Separation — man coverage (short) or zone (medium/deep)
    const depth: 'short' | 'medium' | 'deep' =
      type === 'short_pass'  ? 'short'  :
      type === 'medium_pass' ? 'medium' : 'deep';
    // Play-action bonus from offensive gameplan
    const paLevel    = (off.gameplan?.playAction ?? 'low') as keyof typeof cfg.gameplan.playAction;
    const paBonus    = cfg.gameplan.playAction[paLevel] ?? 0;
    const separation = resolveSeparation(depth, off, def, pressureLevel, paBonus);

    // Phase 2b: Window state — discrete football-state derived from separation score.
    // Adds categorical behavior (throwaway, ball-skills contest, accuracy reliance)
    // on top of the continuous separation → throwQuality pipeline.
    const windowState = resolveWindowState(separation);
    const qbDM        = qb(off)?.decisionMaking ?? 50;
    const w           = cfg.pass.window;

    // QB Decision: may throw away a covered window instead of forcing it
    if (resolveThrowaway(windowState, qbDM, pressureLevel)) {
      const qbId  = pid(off, 'QB');
      const wrId  = pid(off, 'WR');
      return {
        ...base,
        result:      'fail',
        yards:       0,
        ballCarrier: lastName(off, 'QB'),
        target:      lastName(off, 'WR'),
        ...(qbId !== undefined ? { ballCarrierId: qbId } : {}),
        ...(wrId !== undefined ? { targetId:      wrId } : {}),
      };
    }

    // Phase 3: Throw quality — QB accuracy + arm strength (depth-weighted) + pressure
    const throwQuality = resolveThrowQuality(depth, off, pressureLevel, separation);

    // Window state success modifier (centered on tight = 0; preserves baseline calibration)
    const windowSuccessMods: Record<WindowState, number> = {
      open:       w.openSuccessMod,
      soft_open:  w.softOpenSuccessMod,
      tight:      w.tightSuccessMod,
      contested:  w.contestedSuccessMod,
      covered:    w.coveredSuccessMod,
    };
    let windowSuccessMod = windowSuccessMods[windowState];

    // Contested: WR hands vs CB ball skills — winner takes the catch
    if (windowState === 'contested') {
      const wrHands      = wr(off)?.hands      ?? 50;
      const cbBallSkills = cb(def)?.ballSkills  ?? 50;
      windowSuccessMod += (wrHands - cbBallSkills) * w.contestedBallSkillsScale;
    }

    // Phase 4: Success probability — throw quality is the primary driver
    // GDD: WR Size vs DB Size — small situational modifier on contested passes
    const sizeAdj = ((wr(off)?.size ?? 50) - (cb(def)?.size ?? 50)) * cfg.pass.sizeAdvantageScale;
    successProb = Math.max(0.05, Math.min(0.95,
      throwQuality + cfg.game.offenseAdvantage + schemeAdj + fatigueAdj + sizeAdj
      + windowSuccessMod));

    const success = Math.random() < successProb;

    // Phase 5: Interception on failed pass
    if (!success) {
      const cbCoverage   = cb(def)?.manCoverage   ?? 50;
      const cbBallSkills = cb(def)?.ballSkills     ?? 50;
      const intAdvantage    = (cbCoverage - qbDM) * cfg.pass.intCoverageScale;
      const ballSkillsBonus = Math.max(0, (cbBallSkills - 50) * cfg.pass.ballSkillsIntScale);
      // Low throw quality → more INT risk (errant throws easier for defenders to read)
      const throwQualityBonus = Math.max(0, (0.5 - throwQuality) * cfg.pass.intThrowQualityScale);
      // Pressure forces rushed decisions → more INT risk
      const pressureBonus = pressureLevel * cfg.pass.intPressureScale;
      // Window state INT modifier: tight/contested/covered windows increase pick risk
      const windowIntMods: Record<WindowState, number> = {
        open:       w.openIntMod,
        soft_open:  w.softOpenIntMod,
        tight:      w.tightIntMod,
        contested:  w.contestedIntMod,
        covered:    w.coveredIntMod,
      };
      const windowIntMod = windowIntMods[windowState];
      // Bad QB amplifier: low decisionMaking increases INT risk on dangerous windows
      const badDMIntMod = (windowState === 'tight' || windowState === 'contested' || windowState === 'covered')
        ? Math.max(0, (50 - qbDM) * w.badDMIntScale)
        : 0;
      const intChance = Math.max(
        cfg.pass.minIntChance,
        Math.min(cfg.pass.maxIntChance,
          cfg.pass.baseIntChance + intAdvantage + ballSkillsBonus
          + throwQualityBonus + pressureBonus + windowIntMod + badDMIntMod),
      );
      if (Math.random() < intChance) {
        const qbId  = pid(off, 'QB');
        const wrId  = pid(off, 'WR');
        const cbId  = pid(def, 'CB');
        return {
          ...base,
          type:        'interception',
          result:      'turnover',
          yards:       0,
          ballCarrier: lastName(off, 'QB'),
          target:      lastName(off, 'WR'),
          ...(qbId !== undefined ? { ballCarrierId: qbId } : {}),
          ...(wrId !== undefined ? { targetId:      wrId } : {}),
          ...(cbId !== undefined ? { defPlayerId:   cbId } : {}),
        };
      }
    }

    // Phase 6: YAC on successful catch
    // Soft-open windows give a YAC bonus — receiver has open field after the catch
    const speedRating = wr(off)?.speed ?? 50;
    let yards = success ? yardsOnSuccess(type, speedRating) : yardsOnFail(type);
    if (success) {
      const wrYAC    = wr(off)?.yac         ?? 50;
      const cbTackle = cb(def)?.tackling    ?? 50;
      const sfTackle = safety(def)?.tackling ?? 50;
      const lbPursue = lb(def)?.pursuit     ?? 50;
      const defYAC   = avg(cbTackle, sfTackle, lbPursue);
      const yacWindowBonus = windowState === 'soft_open' ? w.softOpenYACBonus : 0;
      // baseYACYards = baseline every catch earns; differential shifts it up or down
      yards = Math.max(0, Math.round(
        yards + cfg.pass.baseYACYards + (wrYAC - defYAC) * cfg.pass.yacNetScale + yacWindowBonus,
      ));
    }
    const newYardLine = yardLine + yards;
    const isTD       = newYardLine >= 100;
    const result: PlayResult = isTD ? 'touchdown' : success ? 'success' : 'fail';
    const firstDown = !isTD && success && yards >= distance;
    const qbId  = pid(off, 'QB');
    const recvId = pid(off, 'WR');
    return {
      ...base,
      result,
      yards:       isTD ? 100 - yardLine : yards,
      ...(firstDown ? { firstDown: true as const } : {}),
      ballCarrier: lastName(off, 'QB'),
      target:      lastName(off, 'WR'),
      ...(qbId   !== undefined ? { ballCarrierId: qbId   } : {}),
      ...(recvId !== undefined ? { targetId:      recvId } : {}),
    };
  }

  // ── Run: rating-ratio approach (unchanged) ────────────────────────────────
  const oRating = offRating(off, type);
  const dRating = defRating(def, type);
  const baseProb = oRating / (oRating + dRating);
  successProb = Math.max(0.05, Math.min(0.95,
    baseProb + cfg.game.offenseAdvantage + schemeAdj + fatigueAdj));
  const success = Math.random() < successProb;

  // ── Run: yards + result ───────────────────────────────────────────────────
  const speedRating = rb(off)?.speed ?? 50;
  const yards       = success ? yardsOnSuccess(type, speedRating) : yardsOnFail(type);
  const newYardLine = yardLine + yards;
  const isTD        = newYardLine >= 100;
  const result: PlayResult = isTD ? 'touchdown' : success ? 'success' : 'fail';
  const firstDown   = !isTD && success && yards >= distance;
  const rbId        = pid(off, 'RB');
  return {
    ...base,
    result,
    yards:       isTD ? 100 - yardLine : yards,
    ...(firstDown ? { firstDown: true as const } : {}),
    ballCarrier: lastName(off, 'RB'),
    ...(rbId !== undefined ? { ballCarrierId: rbId } : {}),
  };
}

// ── Game loop ─────────────────────────────────────────────────────────────────

// ── 4th-down decision ────────────────────────────────────────────────────────

function shouldGoForIt(
  distance: number,
  yardLine: number,
  personality: string,
): boolean {
  const cfg4 = TUNING.coaching.fourthDown;

  // Base probability by yards to gain
  let base: number;
  if      (distance <= 1) base = cfg4.baseProb.dist1;
  else if (distance <= 2) base = cfg4.baseProb.dist2;
  else if (distance <= 3) base = cfg4.baseProb.dist3;
  else if (distance <= 5) base = cfg4.baseProb.dist5;
  else                    base = cfg4.baseProb.distLong;

  // Near goal line: more aggressive
  if (100 - yardLine <= 10) base += cfg4.goalLineBump;

  const mult = cfg4.personalityMultiplier[personality] ?? 1.0;
  return Math.random() < Math.min(0.95, base * mult);
}

export function simulateGame(game: Game): GameResult {
  const home = game.homeTeam;
  const away = game.awayTeam;
  const events:   PlayEvent[]  = [];
  const injuries: GameInjury[] = [];

  // In-game injury tracking (separate from multi-week injuries stored on players)
  const homeInjured = new Set<string>();
  const awayInjured = new Set<string>();
  // Fatigue accumulates per player over the game; key = playerId, value = 0.0–1.0
  const fatigueMap  = new Map<string, number>();

  let quarter      = 1;
  let quarterPlays = 0;
  let possession: 'home' | 'away' = Math.random() < 0.5 ? 'home' : 'away';
  let down     = 1;
  let distance = 10;
  let yardLine = 25;
  let homeScore = 0;
  let awayScore = 0;

  const score = (pts: number) => {
    if (possession === 'home') homeScore += pts;
    else awayScore += pts;
  };

  const changePoss = () => {
    possession = possession === 'home' ? 'away' : 'home';
    down = 1; distance = 10; yardLine = 25;
  };

  /** Accumulate fatigue for a player after they participate in a play. */
  const buildFatigue = (player: Player | undefined) => {
    if (!player) return;
    const cur   = fatigueMap.get(player.id) ?? 0;
    const delta = cfg.fatigue.buildupPerPlay * (100 - (player.stamina ?? 60)) / 50;
    fatigueMap.set(player.id, Math.min(1.0, cur + delta));
  };

  /** Check if a player sustains an in-game injury; records it and marks them out. */
  const checkInjury = (player: Player | undefined, teamId: string, injured: Set<string>) => {
    if (!player || injured.has(player.id)) return;
    const fatigue = fatigueMap.get(player.id) ?? 0;
    const weeks   = rollInjury(player, fatigue);
    if (weeks !== null) {
      injured.add(player.id);
      injuries.push({ playerId: player.id, teamId, weeks });
    }
  };

  while (quarter <= 4) {
    const offRaw     = possession === 'home' ? home : away;
    const defRaw     = possession === 'home' ? away : home;
    const offInjured = possession === 'home' ? homeInjured : awayInjured;
    const defInjured = possession === 'home' ? awayInjured : homeInjured;

    // Apply in-game injuries so depth chart falls back to healthy backups
    const off = withInGameInjuries(offRaw, offInjured);
    const def = withInGameInjuries(defRaw, defInjured);

    // 4th-down decision: FG attempt, go-for-it, or punt
    const offPersonality = getPersonality(off.coaches.hc);
    const goForIt = down === 4
      && yardLine < cfg.fieldGoal.attemptYardLine
      && shouldGoForIt(distance, yardLine, offPersonality);

    if (down === 4 && !goForIt) {
      if (yardLine >= cfg.fieldGoal.attemptYardLine) {
        const ev = simulatePlay(off, def, 'field_goal', quarter, down, distance, yardLine);
        events.push(ev);
        if (ev.result === 'field_goal_good') score(3);
        changePoss();
      } else {
        const puntYards = randInt(cfg.punt.minYards, cfg.punt.maxYards);
        const landingYL = yardLine + puntYards;
        const newYL     = landingYL >= 100
          ? cfg.punt.touchbackYardLine
          : Math.max(5, 100 - landingYL);
        events.push({
          type: 'punt', offenseTeamId: off.id, defenseTeamId: def.id,
          result: 'success', yards: puntYards, quarter, down, distance, yardLine,
        });
        changePoss();
        yardLine = newYL;
      }
    } else {
      const type  = selectPlayType(off, down, distance);
      const isRun = type === 'inside_run' || type === 'outside_run';

      // Identify primary skill players for fatigue/injury tracking
      const offPrimary = isRun ? firstHealthy(off, 'RB') : firstHealthy(off, 'QB');
      const defPrimary = isRun ? firstHealthy(def, 'LB') : firstHealthy(def, 'CB');

      // Fatigue adjustment: tired offense = penalty; tired defense = bonus for offense
      const offFatigue = fatigueMap.get(offPrimary?.id ?? '') ?? 0;
      const defFatigue = fatigueMap.get(defPrimary?.id ?? '') ?? 0;
      const fatigueAdj = (defFatigue - offFatigue) * cfg.fatigue.effectivenessPenalty;

      const ev = simulatePlay(off, def, type, quarter, down, distance, yardLine, fatigueAdj);
      events.push(ev);

      // Build fatigue after the play
      buildFatigue(offPrimary);
      buildFatigue(defPrimary);

      // Injury check for involved players
      checkInjury(offPrimary, offRaw.id, offInjured);
      checkInjury(defPrimary, defRaw.id, defInjured);

      if (ev.result === 'touchdown') {
        score(7);
        changePoss();
      } else if (ev.result === 'turnover') {
        yardLine = Math.max(5, Math.min(95, 100 - yardLine));
        changePoss();
      } else {
        yardLine = Math.min(99, yardLine + ev.yards);
        if (ev.yards >= distance) {
          down = 1; distance = 10;
        } else {
          down++;
          distance -= ev.yards;
          // Failed 4th-down conversion — turnover on downs
          if (down > 4) {
            changePoss();
          }
        }
      }
    }

    quarterPlays++;
    // Tempo: offensive team's setting shifts plays per quarter up or down
    const offTempo   = (offRaw.gameplan?.tempo ?? 'normal') as keyof typeof cfg.gameplan.tempo;
    const playsThisQ = cfg.game.playsPerQuarter + cfg.gameplan.tempo[offTempo];
    if (quarterPlays >= playsThisQ) {
      quarter++;
      quarterPlays = 0;
      if (quarter === 3) changePoss(); // halftime flip
    }
  }

  return {
    game: {
      ...game,
      homeScore,
      awayScore,
      status: 'final',
      events,
      boxScore: buildBoxScoreFromGame(home, away, events, homeScore, awayScore),
    },
    injuries,
  };
}
