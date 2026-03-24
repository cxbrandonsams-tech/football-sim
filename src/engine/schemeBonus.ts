/**
 * Scheme alignment bonus computation.
 *
 * Returns a net adjustment to add to the offense success probability for a
 * given play type.  Positive = offense more likely to succeed.
 *
 *  offSchemeAdj  — OC scheme bonus + OC overall boost + HC global boost + alignment bonus
 *  defSchemeAdj  — DC scheme resistance + DC overall boost + HC global boost + alignment bonus
 *  net           = offSchemeAdj − defSchemeAdj
 *
 * Also computes coaching trait adjustments for sim-relevant traits.
 */

import { type Team, DEFAULT_GAMEPLAN } from '../models/Team';
import { type PlayType }               from '../models/PlayEvent';
import {
  type OffensiveScheme,
  type DefensiveScheme,
  type Coach,
} from '../models/Coach';
import { type PlaycallingWeights, DEFAULT_PLAYCALLING } from '../models/Playcalling';
import { TUNING } from './config';

const cfg = TUNING.scheme;

// ── Type helpers ──────────────────────────────────────────────────────────────

type RunPassType = 'inside_run' | 'outside_run' | 'short_pass' | 'medium_pass' | 'deep_pass';

function isRunPassType(t: PlayType): t is RunPassType {
  return (
    t === 'inside_run' || t === 'outside_run' ||
    t === 'short_pass' || t === 'medium_pass' || t === 'deep_pass'
  );
}

// ── Scheme table lookups ──────────────────────────────────────────────────────

function offBonus(scheme: OffensiveScheme, type: RunPassType): number {
  return cfg.offensive[scheme][type];
}

function defBonus(scheme: DefensiveScheme, type: RunPassType): number {
  return cfg.defensive[scheme][type];
}

// ── Alignment helpers ─────────────────────────────────────────────────────────

/**
 * True when the team's playcalling weights reflect the OC's preferred style
 * at or above the alignment threshold.
 */
function isAligned(scheme: OffensiveScheme, w: PlaycallingWeights): boolean {
  const runFrac  = w.runPct        / 100;
  const passFrac = 1 - runFrac;
  const t        = cfg.alignmentThreshold;

  switch (scheme) {
    case 'balanced':       return true;
    case 'short_passing':  return passFrac * (w.shortPassPct  / 100) >= t;
    case 'deep_passing':   return passFrac * (1 - w.shortPassPct / 100 - w.mediumPassPct / 100) >= t;
    case 'run_inside':     return runFrac  * (w.insideRunPct   / 100) >= t;
    case 'run_outside':    return runFrac  * (1 - w.insideRunPct / 100) >= t;
  }
}

// ── Coaching trait adjustments ────────────────────────────────────────────────

/**
 * Net success-probability adjustment from coaching traits for a given play type.
 * Offensive traits boost offense; defensive traits reduce opponent success.
 */
export function computeTraitAdjustment(off: Team, def: Team, type: PlayType): number {
  if (!isRunPassType(type)) return 0;

  const isPass = type === 'short_pass' || type === 'medium_pass' || type === 'deep_pass';
  const isRun  = type === 'inside_run' || type === 'outside_run';
  const tr     = TUNING.coaching.traits;

  let adj = 0;

  const offCoaches: (Coach | null)[] = [off.coaches.hc, off.coaches.oc, off.coaches.dc];
  for (const coach of offCoaches) {
    if (!coach) continue;
    if (coach.trait === 'offensive_pioneer'   && isPass) adj += tr.offensivePioneerBonus   ?? 0;
    if (coach.trait === 'quarterback_guru'    && isPass) adj += tr.quarterbackGuruBonus     ?? 0;
    if (coach.trait === 'run_game_specialist' && isRun)  adj += tr.runGameSpecialistBonus   ?? 0;
  }

  const defCoaches: (Coach | null)[] = [def.coaches.hc, def.coaches.oc, def.coaches.dc];
  for (const coach of defCoaches) {
    if (!coach) continue;
    if (coach.trait === 'defensive_architect'  && isPass) adj -= tr.defensiveArchitectBonus  ?? 0;
    if (coach.trait === 'pass_rush_specialist' && isPass) adj -= tr.passRushSpecialistBonus  ?? 0;
    if (coach.trait === 'turnover_machine'     && isPass) adj -= tr.turnovertMachineBonus    ?? 0;
  }

  return adj;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Net success-probability adjustment for a play type, incorporating:
 *  1. OC offensive scheme bonus
 *  2. DC defensive scheme resistance
 *  3. OC / DC overall ratings
 *  4. HC global rating
 *  5. HC+OC and HC+DC scheme match bonus
 *  6. Playcalling alignment bonus
 *  7. Defensive focus (gameplan)
 *  8. Offensive play-action bonus
 *  9. Coaching trait adjustments
 */
export function computeSchemeAdjustment(
  off: Team,
  def: Team,
  type: PlayType,
): number {
  if (!isRunPassType(type)) return 0;

  const offOC  = off.coaches.oc;
  const defDC  = def.coaches.dc;
  const offHC  = off.coaches.hc;
  const defHC  = def.coaches.hc;
  const offWeights = off.playcalling ?? DEFAULT_PLAYCALLING;

  // 1. OC scheme bonus (applied to offense); null OC → balanced / no contribution
  const ocScheme = offOC?.offensiveScheme ?? 'balanced';
  let   offAdj   = offBonus(ocScheme, type);

  // 2. DC scheme resistance (applied against offense); null DC → balanced / no contribution
  const dcScheme = defDC?.defensiveScheme ?? 'balanced';
  let   defAdj   = defBonus(dcScheme, type);

  // 3. OC overall (above/below 70 baseline) → small offensive boost; 0 when vacant
  const ocBoost  = offOC ? (offOC.overall - 70) * cfg.ocOverallScale : 0;

  // 4. DC overall → small defensive resistance; 0 when vacant
  const dcBoost  = defDC ? (defDC.overall - 70) * cfg.dcOverallScale : 0;

  // 5. HC global rating → both sides
  const offHCBoost = (offHC.overall - 70) * cfg.hcOverallScale;
  const defHCBoost = (defHC.overall - 70) * cfg.hcOverallScale;

  // 6. HC + OC scheme match → extra offensive alignment bonus
  if (offOC && offHC.offensiveScheme !== undefined && offHC.offensiveScheme === ocScheme) {
    offAdj += cfg.hcMatchBonus;
  }

  // 7. HC + DC scheme match → extra defensive resistance
  if (defDC && defHC.defensiveScheme !== undefined && defHC.defensiveScheme === dcScheme) {
    defAdj += cfg.hcMatchBonus;
  }

  // 8. Playcalling alignment bonus for OC
  if (offOC && isAligned(ocScheme, offWeights)) {
    offAdj += cfg.alignmentBonus;
  }

  // 9. Defensive focus (gameplan) — targeted resistance at the cost of other play types
  const defFocus = (def.gameplan ?? DEFAULT_GAMEPLAN).defensiveFocus;
  let defFocusAdj = 0;
  const gp = TUNING.gameplan;
  if (defFocus === 'stop_inside_run' && type === 'inside_run')  defFocusAdj = gp.stopInsideRun.defResistBonus;
  if (defFocus === 'stop_inside_run' && (type === 'short_pass' || type === 'medium_pass' || type === 'deep_pass')) defFocusAdj = gp.stopInsideRun.passCost;
  if (defFocus === 'stop_outside_run' && type === 'outside_run') defFocusAdj = gp.stopOutsideRun.defResistBonus;
  if (defFocus === 'stop_outside_run' && (type === 'short_pass' || type === 'medium_pass' || type === 'deep_pass')) defFocusAdj = gp.stopOutsideRun.passCost;
  if (defFocus === 'stop_short_pass' && type === 'short_pass')  defFocusAdj = gp.stopShortPass.defResistBonus;
  if (defFocus === 'stop_short_pass' && (type === 'inside_run' || type === 'outside_run')) defFocusAdj = gp.stopShortPass.runCost;
  if (defFocus === 'stop_deep_pass' && type === 'deep_pass')    defFocusAdj = gp.stopDeepPass.defResistBonus;
  if (defFocus === 'stop_deep_pass' && (type === 'inside_run' || type === 'outside_run')) defFocusAdj = gp.stopDeepPass.runCost;
  if (defFocus === 'stop_deep_pass' && type === 'short_pass')   defFocusAdj = gp.stopDeepPass.shortPassCost;

  // 10. Offensive play-action bonus — adds separation on pass plays
  const playAction = (off.gameplan ?? DEFAULT_GAMEPLAN).playAction;
  const isPass = type === 'short_pass' || type === 'medium_pass' || type === 'deep_pass';
  const playActionAdj = isPass ? gp.playAction[playAction] : 0;

  // 11. Coaching trait adjustments
  const traitAdj = computeTraitAdjustment(off, def, type);

  // Net: offense gains offAdj + overalls + play action + traits;
  //      defense gains defAdj + overalls + focus
  return (offAdj + ocBoost + offHCBoost + playActionAdj) - (defAdj + dcBoost + defHCBoost + defFocusAdj) + traitAdj;
}
