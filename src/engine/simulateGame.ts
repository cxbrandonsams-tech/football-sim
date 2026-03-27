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

/**
 * Pick the RB who will carry the ball on a run play.
 * When two healthy RBs are available, splits roughly 65/35 (starter/backup)
 * so each team's carries are distributed realistically across the backfield.
 */
function pickRunBack(team: Team): Player | undefined {
  const healthy = team.depthChart['RB'].filter((p): p is Player => p !== null && p.injuryWeeksRemaining === 0);
  if (healthy.length === 0) return undefined;
  if (healthy.length === 1) return healthy[0];
  return Math.random() < 0.65 ? healthy[0]! : healthy[1]!;
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
 * Snapshot of in-game situation passed into play selection.
 * All fields are from the offense's perspective.
 */
export interface GameSituation {
  down:         number;
  distance:     number;
  yardLine:     number;
  quarter:      number;
  clockSeconds: number;  // seconds remaining in current quarter
  scoreDiff:    number;  // offensive team score − defensive team score
}

/**
 * Select a play type from the offense team's playcalling weights,
 * then apply down/distance nudges and situational adjustments.
 *
 * Weights drive the base distribution. D&D and game-state only tilt within
 * the additive clamp — they never fully override the team's base tendencies.
 */
function selectPlayType(off: Team, sit: GameSituation): PlayType {
  const w     = off.playcalling ?? DEFAULT_PLAYCALLING;
  const s     = cfg.situational;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // If no healthy QB is available, force a run play.
  // Without this guard, pass plays generate events with no ballCarrierId,
  // which causes WRs to accumulate receiving yards with no corresponding
  // QB passing yards — inflating WR season stats and creating QB/WR mismatch.
  if (!firstHealthy(off, 'QB')) {
    return Math.random() < (w.insideRunPct / 100) ? 'inside_run' : 'outside_run';
  }

  // ── Base run/pass split ───────────────────────────────────────────────────
  let runPct = w.runPct / 100;

  // Down & distance nudges
  if (sit.distance <= 2)       runPct = clamp(runPct + 0.15, 0.10, 0.90);
  else if (sit.distance >= 8)  runPct = clamp(runPct - 0.07, 0.10, 0.90);
  if (sit.down === 1)          runPct = clamp(runPct + 0.05, 0.10, 0.90);

  // ── Aggressiveness scale: 1 + ((aggressiveness - 50) / 100) ─────────────
  // 0→0.5×, 50→1.0× (default, no change), 100→1.5×
  // Applied only to score/clock adjustments; D&D nudges and backedUpRunBoost are unscaled.
  const agg      = w.aggressiveness ?? 50;
  const aggScale = 1 + (agg - 50) / 100;

  // ── Situational run% adjustment ───────────────────────────────────────────
  let runAdj = 0;

  // Field position: backed up in own territory — not scaled by aggressiveness
  if (sit.yardLine < s.backedUpYardLine) {
    runAdj += s.backedUpRunBoost / 100;
  }

  // Score + clock adjustments — all scaled by aggScale
  const isLate      = sit.clockSeconds < s.lateGameSeconds;
  const isTwoMinute = sit.clockSeconds < s.twoMinuteSeconds;
  // Q2 gets the two-minute drill too (halftime urgency)
  const q4Late      = sit.quarter === 4 && isLate;
  const q4TwoMinute = (sit.quarter === 2 || sit.quarter === 4) && isTwoMinute;
  const leading     = sit.scoreDiff > s.leadSmallDiff;
  const leadingBig  = sit.scoreDiff > s.leadLargeDiff;
  const trailing    = sit.scoreDiff < -s.trailSmallDiff;
  const garbage     = sit.scoreDiff > s.garbageDiff && q4Late;

  if (garbage) {
    runAdj += (s.garbageRunBoost / 100) * aggScale;
  } else if (q4TwoMinute && trailing) {
    runAdj -= (s.twoMinuteRunCut / 100) * aggScale;
  } else if (q4Late && trailing) {
    runAdj -= (s.urgentTrailRunCut / 100) * aggScale;
  } else if (q4Late && leading) {
    runAdj += (s.clockKillRunBoost / 100) * aggScale;
  } else if (leadingBig) {
    runAdj += (s.comfortLeadRunBoost / 100) * aggScale;
  } else if (leading) {
    runAdj += (s.leadSmallRunBoost / 100) * aggScale;
  } else if (trailing) {
    runAdj -= (s.trailRunCut / 100) * aggScale;
  }

  runPct = clamp(runPct + runAdj, 0.10, 0.90);

  if (Math.random() < runPct) {
    const insideFrac = w.insideRunPct / 100;
    return Math.random() < insideFrac ? 'inside_run' : 'outside_run';
  }

  // ── Pass depth distribution with situational adjustments ─────────────────
  let shortPct = w.shortPassPct  / 100;
  let medPct   = w.mediumPassPct / 100;
  let deepPct  = Math.max(0, 1 - shortPct - medPct);

  if (q4TwoMinute && trailing) {
    shortPct += (s.twoMinuteShortBoost / 100) * aggScale;
    deepPct  -= (s.twoMinuteDeepCut    / 100) * aggScale;
  } else if (q4Late && trailing) {
    shortPct -= (s.urgentTrailShortCut    / 100) * aggScale;
    medPct   += (s.urgentTrailMediumBoost / 100) * aggScale;
    deepPct  += (s.urgentTrailDeepBoost   / 100) * aggScale;
  } else if (q4Late && leading) {
    shortPct += (s.clockKillShortBoost / 100) * aggScale;
    deepPct  -= (s.clockKillDeepCut    / 100) * aggScale;
  } else if (garbage) {
    shortPct += (s.garbageShortBoost / 100) * aggScale;
    deepPct  -= (s.garbageDeepCut    / 100) * aggScale;
  }

  // Renormalize depth fractions (clamp negatives to 0 before normalizing)
  shortPct = Math.max(0, shortPct);
  medPct   = Math.max(0, medPct);
  deepPct  = Math.max(0, deepPct);
  const depthTotal = shortPct + medPct + deepPct;
  if (depthTotal > 0) { shortPct /= depthTotal; medPct /= depthTotal; deepPct /= depthTotal; }

  const r = Math.random();
  if (r < shortPct)              return 'short_pass';
  if (r < shortPct + medPct)     return 'medium_pass';
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

// ── Personnel package system ──────────────────────────────────────────────────

type PersonnelPackage = '11' | '12' | '21' | '10' | '22';
type ReceiverRole = 'featured_route' | 'secondary_route' | 'slot' | 'seam_route' | 'inline_option' | 'check_down';
type TargetSlot   = 'WR1' | 'WR2' | 'WR3' | 'TE1' | 'TE2' | 'RB1' | 'RB2';

interface ReceiverStats {
  playerId:     string | undefined;
  name:         string;
  routeRunning: number;
  speed:        number;
  hands:        number;
  size:         number;
  yac:          number;
  role:         ReceiverRole;
  slot:         TargetSlot;
}

// Role opportunity multipliers — now sourced from config.ts (TUNING.personnel.roleMult).
// See config.ts for values and calibration notes.

// Receiver rating blend by pass depth.
const RECV_RW: Record<'short' | 'medium' | 'deep', { rr: number; sp: number; hd: number }> = {
  short:  { rr: 0.55, sp: 0.25, hd: 0.20 },
  medium: { rr: 0.45, sp: 0.40, hd: 0.15 },
  deep:   { rr: 0.25, sp: 0.65, hd: 0.10 },
};

// INT credit role weights: base opportunity for each defender by target slot and pass depth.
// CB1 shades to WR1 (best CB follows best WR). Safeties help over middle/deep.
// LBs primarily cover RBs and TEs on short/medium routes.
type IntSlotW = { cb1: number; cb2: number; s1: number; s2: number; lb1: number };
const INT_CREDIT: Record<TargetSlot, Record<'short' | 'medium' | 'deep', IntSlotW>> = {
  WR1: { short: {cb1:1.5,cb2:0.5,s1:0.4,s2:0.2,lb1:0.2}, medium:{cb1:1.2,cb2:0.7,s1:0.7,s2:0.3,lb1:0.2}, deep:{cb1:1.2,cb2:0.4,s1:1.1,s2:0.8,lb1:0.1} },
  WR2: { short: {cb1:0.6,cb2:1.4,s1:0.4,s2:0.2,lb1:0.2}, medium:{cb1:0.6,cb2:1.1,s1:0.7,s2:0.4,lb1:0.2}, deep:{cb1:0.6,cb2:1.0,s1:0.9,s2:0.9,lb1:0.1} },
  WR3: { short: {cb1:0.5,cb2:1.0,s1:0.5,s2:0.3,lb1:0.5}, medium:{cb1:0.4,cb2:0.9,s1:0.7,s2:0.5,lb1:0.4}, deep:{cb1:0.4,cb2:0.7,s1:0.9,s2:1.0,lb1:0.2} },
  TE1: { short: {cb1:0.3,cb2:0.3,s1:0.9,s2:0.6,lb1:1.0}, medium:{cb1:0.3,cb2:0.3,s1:1.1,s2:0.8,lb1:0.8}, deep:{cb1:0.3,cb2:0.2,s1:1.3,s2:1.1,lb1:0.3} },
  TE2: { short: {cb1:0.2,cb2:0.3,s1:0.8,s2:0.7,lb1:1.1}, medium:{cb1:0.2,cb2:0.3,s1:1.0,s2:0.9,lb1:0.8}, deep:{cb1:0.2,cb2:0.2,s1:1.2,s2:1.2,lb1:0.3} },
  RB1: { short: {cb1:0.2,cb2:0.2,s1:0.3,s2:0.3,lb1:1.5}, medium:{cb1:0.2,cb2:0.2,s1:0.4,s2:0.4,lb1:1.3}, deep:{cb1:0.2,cb2:0.2,s1:0.6,s2:0.6,lb1:0.8} },
  RB2: { short: {cb1:0.2,cb2:0.2,s1:0.3,s2:0.3,lb1:1.5}, medium:{cb1:0.2,cb2:0.2,s1:0.4,s2:0.4,lb1:1.3}, deep:{cb1:0.2,cb2:0.2,s1:0.6,s2:0.6,lb1:0.8} },
};

/**
 * Selects a personnel package based on game situation.
 * Returns the formation code used to determine which receivers are on the field.
 */
function selectPersonnel(_off: Team, sit: GameSituation): PersonnelPackage {
  const p = cfg.personnel.packages;
  type PkgDist = { pkg22: number; pkg21: number; pkg12: number; pkg11: number; pkg10: number };
  let d: PkgDist;
  if      (sit.yardLine >= 94) d = p.goalLine;
  else if (sit.yardLine >= 80) d = p.redZone;
  else if (sit.distance <= 2)  d = p.shortYardage;
  else if (sit.scoreDiff < -7 && sit.clockSeconds < 120 &&
           (sit.quarter === 2 || sit.quarter === 4)) d = p.twoMinute;
  else d = p.standard;

  const r = Math.random();
  if (r < d.pkg22)                           return '22';
  if (r < d.pkg22 + d.pkg21)                return '21';
  if (r < d.pkg22 + d.pkg21 + d.pkg12)      return '12';
  if (r < d.pkg22 + d.pkg21 + d.pkg12 + d.pkg11) return '11';
  return '10';
}

/**
 * Build the on-field receiver pool from the active personnel package,
 * then select a target using ratings-driven target weights:
 *   weight = roleMult(role, depth) × ratingScore(receiver, depth)
 * Diminishing returns (weight^0.9) and small noise (±7.5%) prevent extreme concentration.
 */
function selectPassTarget(off: Team, depth: 'short' | 'medium' | 'deep', pkg: PersonnelPackage): ReceiverStats {
  const fallback: ReceiverStats = {
    playerId: undefined, name: '', routeRunning: 50, speed: 50, hands: 50, size: 50, yac: 50,
    role: 'check_down', slot: 'RB1',
  };

  type PoolEntry = { player: Player | null; role: ReceiverRole; slot: TargetSlot };
  const dc = off.depthChart;

  const pool: PoolEntry[] = (() => {
    switch (pkg) {
      case '11': return [
        { player: dc['WR'][0] ?? null, role: 'featured_route',  slot: 'WR1' },
        { player: dc['WR'][1] ?? null, role: 'secondary_route', slot: 'WR2' },
        { player: dc['WR'][2] ?? null, role: 'slot',            slot: 'WR3' },
        { player: dc['TE'][0] ?? null, role: 'inline_option',   slot: 'TE1' },
        { player: dc['RB'][0] ?? null, role: 'check_down',      slot: 'RB1' },
      ];
      case '12': return [
        { player: dc['WR'][0] ?? null, role: 'featured_route',  slot: 'WR1' },
        { player: dc['WR'][1] ?? null, role: 'secondary_route', slot: 'WR2' },
        { player: dc['TE'][0] ?? null, role: 'seam_route',      slot: 'TE1' },
        { player: dc['TE'][1] ?? null, role: 'inline_option',   slot: 'TE2' },
        { player: dc['RB'][0] ?? null, role: 'check_down',      slot: 'RB1' },
      ];
      case '21': return [
        { player: dc['WR'][0] ?? null, role: 'featured_route',  slot: 'WR1' },
        { player: dc['WR'][1] ?? null, role: 'secondary_route', slot: 'WR2' },
        { player: dc['TE'][0] ?? null, role: 'seam_route',      slot: 'TE1' },
        { player: dc['RB'][0] ?? null, role: 'check_down',      slot: 'RB1' },
        { player: dc['RB'][1] ?? null, role: 'check_down',      slot: 'RB2' },
      ];
      case '10': return [
        { player: dc['WR'][0] ?? null, role: 'featured_route',  slot: 'WR1' },
        { player: dc['WR'][1] ?? null, role: 'secondary_route', slot: 'WR2' },
        { player: dc['WR'][2] ?? null, role: 'slot',            slot: 'WR3' },
        { player: dc['RB'][0] ?? null, role: 'check_down',      slot: 'RB1' },
      ];
      case '22': return [
        { player: dc['WR'][0] ?? null, role: 'featured_route',  slot: 'WR1' },
        { player: dc['TE'][0] ?? null, role: 'seam_route',      slot: 'TE1' },
        { player: dc['TE'][1] ?? null, role: 'inline_option',   slot: 'TE2' },
        { player: dc['RB'][0] ?? null, role: 'check_down',      slot: 'RB1' },
        { player: dc['RB'][1] ?? null, role: 'check_down',      slot: 'RB2' },
      ];
    }
  })();

  const rw  = RECV_RW[depth];
  const cfgP = cfg.personnel;
  const candidates: { stats: ReceiverStats; weight: number }[] = [];

  for (const entry of pool) {
    const p = entry.player;
    if (!p || p.injuryWeeksRemaining > 0) continue;
    const r = p.trueRatings;
    let routeRunning: number, speed: number, hands: number, size: number, yac: number;

    if      (r.position === 'WR') { routeRunning = r.routeRunning; speed = r.speed; hands = r.hands; size = r.size; yac = r.yac; }
    else if (r.position === 'TE') { routeRunning = r.routeRunning; speed = r.speed; hands = r.hands; size = r.size; yac = r.yac; }
    else if (r.position === 'RB') { routeRunning = r.elusiveness;  speed = r.speed; hands = Math.min(r.ballSecurity + 10, 85); size = 55; yac = r.speed; }
    else continue;

    const nm = p.name.split(' ').pop() ?? p.name;
    const ratingScore = routeRunning * rw.rr + speed * rw.sp + hands * rw.hd;
    const roleMult    = cfg.personnel.roleMult[entry.role][depth];

    // raw weight = role × (rating / 50), then diminishing returns, then noise
    let w = roleMult * (ratingScore / 50);
    w = Math.pow(w, cfgP.targetWeightExponent);
    w *= 1 + (Math.random() * 2 - 1) * cfgP.targetWeightNoise;
    w = Math.max(0, w);

    candidates.push({ stats: { playerId: p.id, name: nm, routeRunning, speed, hands, size, yac, role: entry.role, slot: entry.slot }, weight: w });
  }

  if (candidates.length === 0) return fallback;
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of candidates) { roll -= c.weight; if (roll <= 0) return c.stats; }
  return candidates[candidates.length - 1]!.stats;
}

/**
 * Pick which defender gets sack credit.
 * Standard 4-man rush: DE1, DE2, DT1, LB1.
 * Weight = max(0, passRush − threshold) — linear so elite rushers dominate while backups contribute.
 */
function pickSackCredit(def: Team): string | undefined {
  const threshold = cfg.personnel.sackCreditThreshold;
  const rushSlots: Array<{ slot: DepthChartSlot; idx: number }> = [
    { slot: 'DE', idx: 0 }, { slot: 'DE', idx: 1 },
    { slot: 'DT', idx: 0 }, { slot: 'LB', idx: 0 },
  ];

  const candidates: { id: string; weight: number }[] = [];
  for (const { slot, idx } of rushSlots) {
    const p = def.depthChart[slot][idx] ?? null;
    if (!p || p.injuryWeeksRemaining > 0) continue;
    const r = p.trueRatings;
    const passRush =
      (r.position === 'DE' || r.position === 'DT')       ? (r as DLRatings).passRush :
      (r.position === 'OLB' || r.position === 'MLB')      ? (r as LBRatings).passRush : 0;
    const w = Math.max(0, passRush - threshold);
    if (w > 0) candidates.push({ id: p.id, weight: w });
  }
  if (candidates.length === 0) return def.depthChart['DE'][0]?.id;
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of candidates) { roll -= c.weight; if (roll <= 0) return c.id; }
  return candidates[candidates.length - 1]?.id;
}

/**
 * Pick which defender gets INT credit.
 * Role weights reflect which defender was likely in coverage on the targeted route.
 * Multiplied by a ratings score (ballSkills + coverage + awareness).
 */
function pickIntCredit(def: Team, tgt: ReceiverStats, depth: 'short' | 'medium' | 'deep'): string | undefined {
  const sw = INT_CREDIT[tgt.slot]?.[depth] ?? { cb1:1.0, cb2:0.5, s1:0.5, s2:0.3, lb1:0.3 };

  type CovSlot = { slot: DepthChartSlot; idx: number; roleW: number };
  const covSlots: CovSlot[] = [
    { slot: 'CB', idx: 0, roleW: sw.cb1 },
    { slot: 'CB', idx: 1, roleW: sw.cb2 },
    { slot: 'S',  idx: 0, roleW: sw.s1  },
    { slot: 'S',  idx: 1, roleW: sw.s2  },
    { slot: 'LB', idx: 0, roleW: sw.lb1 },
  ];

  const candidates: { id: string; weight: number }[] = [];
  for (const { slot, idx, roleW } of covSlots) {
    const p = def.depthChart[slot][idx] ?? null;
    if (!p || p.injuryWeeksRemaining > 0) continue;
    const r = p.trueRatings;
    let ballSkills: number, coverage: number, awareness: number;
    if (r.position === 'CB') {
      ballSkills = (r as CBRatings).ballSkills;  coverage = (r as CBRatings).manCoverage;  awareness = (r as CBRatings).awareness;
    } else if (r.position === 'FS' || r.position === 'SS') {
      ballSkills = (r as SafetyRatings).ballSkills; coverage = (r as SafetyRatings).zoneCoverage; awareness = (r as SafetyRatings).awareness;
    } else { // LB
      ballSkills = 50; coverage = (r as LBRatings).coverage; awareness = (r as LBRatings).awareness;
    }
    const ratingScore = ballSkills * 0.45 + coverage * 0.30 + awareness * 0.25;
    const w = roleW * (ratingScore / 50);
    if (w > 0) candidates.push({ id: p.id, weight: w });
  }
  if (candidates.length === 0) return def.depthChart['CB'][0]?.id;
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of candidates) { roll -= c.weight; if (roll <= 0) return c.id; }
  return candidates[candidates.length - 1]?.id;
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
  recvStats: ReceiverStats,
): number {
  const cbR  = cb(def);
  const lbR  = lb(def);
  const sfR  = safety(def);

  const wrRoute = recvStats.routeRunning;
  const wrSpeed = recvStats.speed;

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
    case 'inside_run':
      // Two-tier: short gain (typical) or breakthrough (RB into second level).
      base = Math.random() < cfg.run.insideLongChance
        ? randInt(cfg.run.insideLongMin,  cfg.run.insideLongMax)
        : randInt(cfg.run.insideRunMin,   cfg.run.insideRunMax);
      break;
    case 'outside_run':
      base = Math.random() < cfg.run.outsideLongChance
        ? randInt(cfg.run.outsideLongMin, cfg.run.outsideLongMax)
        : randInt(cfg.run.outsideRunMin,  cfg.run.outsideRunMax);
      break;
    case 'short_pass': {
      // YAC breakaway: receiver beats pursuit into open field after a short catch.
      // Speed-scaled: faster WRs more likely to turn routine catches into big gains.
      const yaBreakChance = cfg.passYards.yacBreakawayBaseChance
        + Math.max(0, speedRating - 50) * cfg.passYards.yacBreakawaySpeedScale;
      base = Math.random() < yaBreakChance
        ? randInt(cfg.passYards.yacBreakawayMin, cfg.passYards.yacBreakawayMax)
        : randInt(cfg.passYards.shortMin, cfg.passYards.shortMax);
      break;
    }
    case 'medium_pass': {
      // Bomb → YAC breakaway → normal; each check is independent.
      const yaBreakChanceM = cfg.passYards.yacBreakawayBaseChance
        + Math.max(0, speedRating - 50) * cfg.passYards.yacBreakawaySpeedScale;
      if (Math.random() < cfg.passYards.mediumBombChance) {
        base = randInt(cfg.passYards.mediumBombMin, cfg.passYards.mediumBombMax);
      } else if (Math.random() < yaBreakChanceM) {
        base = randInt(cfg.passYards.yacBreakawayMin, cfg.passYards.yacBreakawayMax);
      } else {
        base = randInt(cfg.passYards.mediumMin, cfg.passYards.mediumMax);
      }
      break;
    }
    case 'deep_pass':
      // 16% of deep completions become long bombs (30-55 yd); the rest use the
      // normal range. Average catch yardage stays ~16 yds but the distribution
      // now has a realistic tail for explosive/non-RZ scores.
      base = Math.random() < cfg.passYards.deepBombChance
        ? randInt(cfg.passYards.deepBombMin, cfg.passYards.deepBombMax)
        : randInt(cfg.passYards.deepMin,     cfg.passYards.deepMax);
      break;
    default:            base = 5;
  }
  // Big-play burst for fast skill players
  // GDD: Inside = lower breakaway chance, Outside = higher breakaway chance (runs only)
  // Pass plays retain the original burstChance and bigPlay.speedThreshold
  // Run plays use cfg.run.breakawaySpeedThreshold (lower, reachable by starter/elite RBs)
  const breakawayChance =
    type === 'inside_run'  ? cfg.run.insideBreakawayChance  :
    type === 'outside_run' ? cfg.run.outsideBreakawayChance :
    cfg.bigPlay.burstChance;
  const speedThreshold = (type === 'inside_run' || type === 'outside_run')
    ? cfg.run.breakawaySpeedThreshold
    : cfg.bigPlay.speedThreshold;
  if (speedRating > speedThreshold && Math.random() < breakawayChance) {
    base += randInt(cfg.bigPlay.burstBonusMin, cfg.bigPlay.burstBonusMax);
  }
  return base;
}

function yardsOnFail(type: PlayType): number {
  if (type === 'inside_run' || type === 'outside_run') {
    if (Math.random() < cfg.run.tflChance) {
      if (Math.random() < cfg.run.tflBigChance) {
        return randInt(cfg.run.tflBigMin, cfg.run.tflBigMax);      // -7 to -4
      }
      return randInt(cfg.run.tflTypicalMin, cfg.run.tflTypicalMax); // -3 to -1
    }
    return randInt(cfg.run.failYardsMin, cfg.run.failYardsMax);
  }
  return 0; // incomplete pass
}

// ── Single play ───────────────────────────────────────────────────────────────

function simulatePlay(
  off: Team, def: Team, type: PlayType,
  quarter: number, down: number, distance: number, yardLine: number,
  fatigueAdj = 0,       // positive = net help for offense; negative = net hurt for offense
  sit?: GameSituation,  // for personnel package selection
): PlayEvent {
  // Reconstruct a minimal sit if not provided (used for FG / special teams calls)
  const situation: GameSituation = sit ?? { down, distance, yardLine, quarter, clockSeconds: 900, scoreDiff: 0 };
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
    const rzSackBonus        = yardLine >= cfg.redZone.yardLine ? cfg.redZone.sackBonus : 0;
    const d3SackBonus        = down === 3 ? cfg.longYardage.d3SackBonus : 0;
    const adjustedSackChance = Math.max(0, rawSackChance - mobilityBonus + rzSackBonus + d3SackBonus);
    const sackRoll           = Math.random();

    // pressureLevel: how much pocket pressure affects QB throws (0=clean, 1=heavy)
    pressureLevel = Math.max(0, Math.min(1, (advantage / 50) * 0.8));

    if (sackRoll < adjustedSackChance) {
      // QB was brought down — sack credited to the ratings-weighted pass rusher
      const qbId  = pid(off, 'QB');
      const sackId = pickSackCredit(def);
      return {
        ...base,
        type:        'sack',
        result:      'fail',
        yards:       randInt(-8, -2),
        ballCarrier: lastName(off, 'QB'),
        ...(qbId   !== undefined ? { ballCarrierId: qbId   } : {}),
        ...(sackId !== undefined ? { defPlayerId:   sackId } : {}),
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

  // Select run carrier (distributes carries between starter and backup RB)
  const runCarrier = isRun ? pickRunBack(off) : undefined;
  const runCarrierRb = runCarrier?.trueRatings.position === 'RB'
    ? (runCarrier.trueRatings as RBRatings) : null;
  const runCarrierLastName = runCarrier
    ? (runCarrier.name.split(' ').pop() ?? runCarrier.name) : '';

  // Fumble check
  if (isRun) {
    const ballSec   = runCarrierRb?.ballSecurity ?? rb(off)?.ballSecurity ?? 60;
    const fumbleChance = Math.max(
      0,
      cfg.run.baseFumbleChance - (ballSec - 50) * cfg.run.ballSecurityFumbleReduction,
    );
    if (Math.random() < fumbleChance) {
      return {
        ...base,
        type:        'fumble',
        result:      'turnover',
        yards:       0,
        ballCarrier: runCarrierLastName,
        ...(runCarrier !== undefined ? { ballCarrierId: runCarrier.id } : {}),
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
    // Select personnel package then target receiver.
    // Personnel determines the on-field pool; ratings drive who earns the target.
    const pkg = selectPersonnel(off, situation);
    const tgt = selectPassTarget(off, depth, pkg);
    // Play-action bonus from offensive gameplan
    const paLevel    = (off.gameplan?.playAction ?? 'low') as keyof typeof cfg.gameplan.playAction;
    const paBonus    = cfg.gameplan.playAction[paLevel] ?? 0;
    const separation = resolveSeparation(depth, off, def, pressureLevel, paBonus, tgt);

    // Phase 2b: Window state — discrete football-state derived from separation score.
    // Adds categorical behavior (throwaway, ball-skills contest, accuracy reliance)
    // on top of the continuous separation → throwQuality pipeline.
    const windowState = resolveWindowState(separation);
    const qbDM        = qb(off)?.decisionMaking ?? 50;
    const w           = cfg.pass.window;

    // QB Decision: may throw away a covered window instead of forcing it
    if (resolveThrowaway(windowState, qbDM, pressureLevel)) {
      const qbId = pid(off, 'QB');
      return {
        ...base,
        result:      'fail',
        yards:       0,
        ballCarrier: lastName(off, 'QB'),
        target:      tgt.name,
        ...(qbId          !== undefined ? { ballCarrierId: qbId } : {}),
        ...(tgt.playerId  !== undefined ? { targetId: tgt.playerId } : {}),
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
      const cbBallSkills = cb(def)?.ballSkills ?? 50;
      windowSuccessMod += (tgt.hands - cbBallSkills) * w.contestedBallSkillsScale;
    }

    // Phase 4: Success probability — throw quality is the primary driver
    // GDD: WR Size vs DB Size — small situational modifier on contested passes
    const sizeAdj = (tgt.size - (cb(def)?.size ?? 50)) * cfg.pass.sizeAdvantageScale;
    const rzPassPenalty = yardLine >= cfg.redZone.yardLine ? cfg.redZone.passSuccessPenalty : 0;
    successProb = Math.max(0.05, Math.min(0.95,
      throwQuality + cfg.game.offenseAdvantage + schemeAdj + fatigueAdj + sizeAdj
      + windowSuccessMod - rzPassPenalty));

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
        const intId = pickIntCredit(def, tgt, depth);
        return {
          ...base,
          type:        'interception',
          result:      'turnover',
          yards:       0,
          ballCarrier: lastName(off, 'QB'),
          target:      tgt.name,
          ...(qbId         !== undefined ? { ballCarrierId: qbId  } : {}),
          ...(tgt.playerId !== undefined ? { targetId: tgt.playerId } : {}),
          ...(intId        !== undefined ? { defPlayerId:   intId } : {}),
        };
      }
    }

    // Phase 6: YAC on successful catch
    // Soft-open windows give a YAC bonus — receiver has open field after the catch
    let yards = success ? yardsOnSuccess(type, tgt.speed) : yardsOnFail(type);
    if (success) {
      const cbTackle = cb(def)?.tackling    ?? 50;
      const sfTackle = safety(def)?.tackling ?? 50;
      const lbPursue = lb(def)?.pursuit     ?? 50;
      const defYAC   = avg(cbTackle, sfTackle, lbPursue);
      const yacWindowBonus = windowState === 'soft_open' ? w.softOpenYACBonus : 0;
      yards = Math.max(0, Math.round(
        yards + cfg.pass.baseYACYards + (tgt.yac - defYAC) * cfg.pass.yacNetScale + yacWindowBonus,
      ));
      // Breakaway upgrade: short/medium only; excluded if already a big play (yards >= 20)
      // Fires after YAC so it never stacks with bomb or YAC-breakaway outcomes.
      if ((type === 'short_pass' || type === 'medium_pass') && yards < 20
          && Math.random() < cfg.bigPlay.breakawayUpgradeChancePass) {
        yards = randInt(cfg.bigPlay.breakawayUpgradeMin, cfg.bigPlay.breakawayUpgradeMax);
      }
    }
    const newYardLine = yardLine + yards;
    const isTD       = newYardLine >= 100;
    const result: PlayResult = isTD ? 'touchdown' : success ? 'success' : 'fail';
    const firstDown = !isTD && success && yards >= distance;
    const qbId = pid(off, 'QB');
    return {
      ...base,
      result,
      yards:       isTD ? 100 - yardLine : yards,
      ...(firstDown ? { firstDown: true as const } : {}),
      ballCarrier: lastName(off, 'QB'),
      target:      tgt.name,
      ...(qbId         !== undefined ? { ballCarrierId: qbId } : {}),
      ...(tgt.playerId !== undefined ? { targetId: tgt.playerId } : {}),
    };
  }

  // ── Run: rating-ratio approach ────────────────────────────────────────────
  // defRunDefenseResistance scales how much defensive rating resists blocking.
  // At 1.0 defense is at full strength; lower values dampen DL impact.
  const oRating = offRating(off, type);
  const dRating = defRating(def, type);
  const baseProb = oRating / (oRating + dRating * cfg.run.defRunDefenseResistance);
  const rzRushPenalty = yardLine >= cfg.redZone.goalLineYardLine ? cfg.redZone.rushSuccessPenalty : 0;
  successProb = Math.max(0.05, Math.min(0.95,
    baseProb + cfg.game.offenseAdvantage + schemeAdj + fatigueAdj - rzRushPenalty));
  const success = Math.random() < successProb;

  // ── Run: yards + result ───────────────────────────────────────────────────
  const speedRating = runCarrierRb?.speed ?? rb(off)?.speed ?? 50;
  let yards         = success ? yardsOnSuccess(type, speedRating) : yardsOnFail(type);
  // Breakaway upgrade: only on successful carries, only if not already a burst run (yards < 20)
  if (success && yards < 20 && Math.random() < cfg.bigPlay.breakawayUpgradeChanceRun) {
    yards = randInt(cfg.bigPlay.breakawayUpgradeMin, cfg.bigPlay.breakawayUpgradeMax);
  }
  const newYardLine = yardLine + yards;
  const isTD        = newYardLine >= 100;
  const result: PlayResult = isTD ? 'touchdown' : success ? 'success' : 'fail';
  const firstDown   = !isTD && success && yards >= distance;
  return {
    ...base,
    result,
    yards:       isTD ? 100 - yardLine : yards,
    ...(firstDown ? { firstDown: true as const } : {}),
    ballCarrier: runCarrierLastName,
    ...(runCarrier !== undefined ? { ballCarrierId: runCarrier.id } : {}),
  };
}

// ── Game loop ─────────────────────────────────────────────────────────────────

// ── Special teams: returner composites ───────────────────────────────────────

function kickoffReturnerScore(team: Team): number {
  const r = cfg.returner;
  let best = 50;
  for (const p of team.depthChart['WR']) {
    if (!p || p.injuryWeeksRemaining > 0 || p.trueRatings.position !== 'WR') continue;
    const s = p.trueRatings.speed * r.krSpeedWeight + p.trueRatings.yac * r.krElusivenessWeight;
    if (s > best) best = s;
  }
  for (const p of team.depthChart['RB']) {
    if (!p || p.injuryWeeksRemaining > 0 || p.trueRatings.position !== 'RB') continue;
    const s = p.trueRatings.speed * r.krSpeedWeight + p.trueRatings.elusiveness * r.krElusivenessWeight;
    if (s > best) best = s;
  }
  return best;
}

function puntReturnerScore(team: Team): number {
  const r = cfg.returner;
  let best = 50;
  for (const p of team.depthChart['WR']) {
    if (!p || p.injuryWeeksRemaining > 0 || p.trueRatings.position !== 'WR') continue;
    const s = p.trueRatings.speed * r.prSpeedWeight
            + p.trueRatings.hands * r.prHandsWeight
            + p.trueRatings.yac   * r.prYacWeight;
    if (s > best) best = s;
  }
  return best;
}

function resolveKickoffStart(receivingTeam: Team): number {
  const c = cfg.kickoffReturn;
  if (Math.random() < c.touchbackRate) return c.touchbackYardLine;
  const score  = kickoffReturnerScore(receivingTeam);
  const bonus  = Math.min(c.returnerBonusCap, Math.max(-c.returnerBonusCap, (score - 50) * c.returnerBonusScale));
  if (Math.random() < c.bigReturnChance) {
    return Math.min(95, c.catchYardLine + randInt(c.bigReturnMin, c.bigReturnMax) + Math.round(bonus));
  }
  return Math.min(50, c.catchYardLine + randInt(c.returnBaseMin, c.returnBaseMax) + Math.round(bonus));
}

function resolvePuntReturn(receivingTeam: Team, landSpot: number): number {
  const c = cfg.puntReturn;
  if (Math.random() < c.fairCatchRate) return landSpot;
  const score = puntReturnerScore(receivingTeam);
  const bonus = Math.min(c.returnerBonusCap, Math.max(-c.returnerBonusCap, (score - 50) * c.returnerBonusScale));
  if (Math.random() < c.bigReturnChance) {
    return Math.min(95, landSpot + randInt(c.bigReturnMin, c.bigReturnMax) + Math.round(bonus));
  }
  return Math.min(95, landSpot + randInt(c.returnBaseMin, c.returnBaseMax) + Math.round(bonus));
}

// ── Clock runoff ─────────────────────────────────────────────────────────────

function computeClockRunoff(ev: PlayEvent, off: Team, quarter: number, clockSecs: number, scoreDiff: number): number {
  const c    = cfg.clock;
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  // A2: end-of-half squeeze — Q2/Q4 trailing with <2 min → hurry-up clock burn
  const situationalHurryUp =
    (quarter === 2 || quarter === 4) &&
    clockSecs < cfg.situational.twoMinuteSeconds &&
    scoreDiff < 0;
  const tempo    = situationalHurryUp ? 'hurry_up' : ((off.gameplan?.tempo ?? 'normal') as string);
  const tempoMod = c.tempoModifier[tempo] ?? 0;

  // Special teams — no tempo effect; clock stops after the play
  if (ev.type === 'punt')       return rand(c.runoff.puntMin,  c.runoff.puntMax);
  if (ev.type === 'field_goal') return rand(c.runoff.fgMin,    c.runoff.fgMax);

  // Scoring — brief stop for PAT/kickoff setup; no tempo effect
  if (ev.result === 'touchdown') return rand(c.runoff.tdMin, c.runoff.tdMax);

  // Run plays, sacks, scrambles — full play clock; tempo applies
  const isRun = ev.type === 'inside_run' || ev.type === 'outside_run'
             || ev.type === 'sack'        || ev.type === 'scramble';
  if (isRun) return Math.max(1, rand(c.runoff.runMin, c.runoff.runMax) + tempoMod);

  // Pass plays
  const isIncomplete = ev.result === 'fail' || ev.type === 'interception';
  if (isIncomplete) return rand(c.runoff.incompleteMin, c.runoff.incompleteMax);

  // Completed pass — some go out of bounds (clock stops)
  if (Math.random() < c.sidelinePassChance) {
    return rand(c.runoff.sidelineMin, c.runoff.sidelineMax);
  }
  return Math.max(1, rand(c.runoff.completeMin, c.runoff.completeMax) + tempoMod);
}

// ── 4th-down decision ────────────────────────────────────────────────────────

function shouldGoForIt(
  distance:      number,
  yardLine:      number,
  personality:   string,
  sit:           GameSituation,
  aggressiveness: number,
): boolean {
  const cfg4  = TUNING.coaching.fourthDown;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Base probability by yards to gain
  let base: number;
  if      (distance <= 1) base = cfg4.baseProb.dist1;
  else if (distance <= 2) base = cfg4.baseProb.dist2;
  else if (distance <= 3) base = cfg4.baseProb.dist3;
  else if (distance <= 5) base = cfg4.baseProb.dist5;
  else                    base = cfg4.baseProb.distLong;

  // Near goal line: more aggressive (unscaled)
  if (100 - yardLine <= 10) base += cfg4.goalLineBump;

  // Situational adjustments — Q4 score-based, scaled by aggressiveness
  const aggScale = 1 + (aggressiveness - 50) / 100;
  if (sit.quarter === 4) {
    if      (sit.scoreDiff < -cfg4.trailBigDiff)   base += cfg4.trailingBigBoost   * aggScale;
    else if (sit.scoreDiff < -cfg4.trailSmallDiff)  base += cfg4.trailingSmallBoost * aggScale;
    else if (sit.scoreDiff >  cfg4.leadBigDiff)     base -= cfg4.leadingBigCut      * aggScale;
  }

  // Own half of field: unscaled cut (field position cost)
  if (sit.yardLine < 50) base -= cfg4.ownHalfCut;

  // Cap before personality multiplier
  base = clamp(base, 0.02, 0.95);

  const mult = cfg4.personalityMultiplier[personality] ?? 1.0;
  return Math.random() < clamp(base * mult, 0.02, 0.95);
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
  let clockSeconds = cfg.clock.secondsPerQuarter;
  let possession: 'home' | 'away' = Math.random() < 0.5 ? 'home' : 'away';
  let down     = 1;
  let distance = 10;
  let yardLine = resolveKickoffStart(possession === 'home' ? home : away);
  let homeScore = 0;
  let awayScore = 0;

  const score = (pts: number) => {
    if (possession === 'home') homeScore += pts;
    else awayScore += pts;
  };

  const changePoss = () => {
    possession = possession === 'home' ? 'away' : 'home';
    down = 1; distance = 10; yardLine = 25; // default; overridden by kickoff/punt logic below
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

    // Compute situation struct — needed for 4th-down decision and play selection
    const offScore = possession === 'home' ? homeScore : awayScore;
    const defScore = possession === 'home' ? awayScore : homeScore;
    const sit: GameSituation = {
      down, distance, yardLine, quarter,
      clockSeconds,
      scoreDiff: offScore - defScore,
    };

    // 4th-down decision: FG attempt, go-for-it, or punt
    const offPersonality = getPersonality(off.coaches.hc);
    const aggressiveness = off.playcalling?.aggressiveness ?? 50;
    const goForIt = down === 4
      && yardLine < cfg.fieldGoal.attemptYardLine
      && shouldGoForIt(distance, yardLine, offPersonality, sit, aggressiveness);

    // Desperation FG: trailing 2+ scores, Q4 late, just beyond normal FG range
    const desperationFG = down === 4
      && !goForIt
      && sit.quarter === 4
      && sit.clockSeconds < cfg.coaching.fourthDown.desperateFGSecondsLeft
      && sit.scoreDiff < -cfg.coaching.fourthDown.trailBigDiff
      && yardLine >= cfg.fieldGoal.desperationYardLine
      && yardLine < cfg.fieldGoal.attemptYardLine;

    if (down === 4 && !goForIt) {
      if (yardLine >= cfg.fieldGoal.attemptYardLine || desperationFG) {
        const ev = simulatePlay(off, def, 'field_goal', quarter, down, distance, yardLine);
        events.push(ev);
        if (ev.result === 'field_goal_good') score(3);
        changePoss();
        yardLine = resolveKickoffStart(possession === 'home' ? home : away);
      } else {
        const puntYards = randInt(cfg.punt.minYards, cfg.punt.maxYards);
        const landingYL = yardLine + puntYards;
        const puntReceiver = def; // receiver before possession flips
        const landSpot    = landingYL >= 100
          ? cfg.punt.touchbackYardLine
          : Math.max(5, 100 - landingYL);
        events.push({
          type: 'punt', offenseTeamId: off.id, defenseTeamId: def.id,
          result: 'success', yards: puntYards, quarter, down, distance, yardLine,
        });
        changePoss();
        yardLine = landingYL >= 100
          ? cfg.punt.touchbackYardLine
          : resolvePuntReturn(puntReceiver, landSpot);
      }
    } else {
      const type  = selectPlayType(off, sit);
      const isRun = type === 'inside_run' || type === 'outside_run';

      // Identify primary skill players for fatigue/injury tracking
      const offPrimary = isRun ? firstHealthy(off, 'RB') : firstHealthy(off, 'QB');
      const defPrimary = isRun ? firstHealthy(def, 'LB') : firstHealthy(def, 'CB');

      // Fatigue adjustment: tired offense = penalty; tired defense = bonus for offense
      const offFatigue = fatigueMap.get(offPrimary?.id ?? '') ?? 0;
      const defFatigue = fatigueMap.get(defPrimary?.id ?? '') ?? 0;
      let playAdj = (defFatigue - offFatigue) * cfg.fatigue.effectivenessPenalty;

      // Down-and-distance difficulty penalties.
      // Pass penalties excluded inside the red zone — that system has its own pass penalty
      // and stacking both causes scoring to drop too far.
      if (yardLine < cfg.redZone.yardLine) {
        const ly = cfg.longYardage;
        if (down === 3) {
          if (isRun) {
            // Run: flat penalty on all 3rd downs (defense keys up stops)
            playAdj -= ly.d3RunPenalty;
          } else {
            // Pass: tiered by distance
            if      (distance >= ly.d3VeryThreshold) playAdj -= ly.d3VeryPenalty;
            else if (distance >= ly.d3LongThreshold) playAdj -= ly.d3LongPenalty;
            else if (distance >= ly.d3MedThreshold)  playAdj -= ly.d3MedPenalty;
            else                                     playAdj -= ly.d3ShortPenalty;
          }
        } else if (down === 2 && !isRun && distance >= ly.d2LongThreshold) {
          playAdj -= ly.d2LongPenalty;
        }
      }

      const ev = simulatePlay(off, def, type, quarter, down, distance, yardLine, playAdj, sit);
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
        yardLine = resolveKickoffStart(possession === 'home' ? home : away);
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
    // Deduct clock — primary quarter-ender
    clockSeconds -= computeClockRunoff(events[events.length - 1]!, offRaw, quarter, clockSeconds, offScore - defScore);
    if (clockSeconds <= 0 || quarterPlays >= cfg.clock.maxPlaysPerQuarter) {
      quarter++;
      quarterPlays = 0;
      clockSeconds = cfg.clock.secondsPerQuarter;
      if (quarter === 3) {
        changePoss(); // halftime flip
        yardLine = resolveKickoffStart(possession === 'home' ? home : away);
      }
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
