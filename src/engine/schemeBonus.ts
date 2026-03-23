/**
 * Scheme alignment bonus computation.
 *
 * Returns a net adjustment to add to the offense success probability for a
 * given play type.  Positive = offense more likely to succeed.
 *
 *  offSchemeAdj  — OC scheme bonus + OC overall boost + HC global boost + alignment bonus
 *  defSchemeAdj  — DC scheme resistance + DC overall boost + HC global boost + alignment bonus
 *  net           = offSchemeAdj − defSchemeAdj
 */

import { type Team, DEFAULT_GAMEPLAN } from '../models/Team';
import { type PlayType }               from '../models/PlayEvent';
import {
  type OffensiveScheme,
  type DefensiveScheme,
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
 *
 * "Preferred fraction" is the share of plays that match the scheme's focus.
 */
function isAligned(scheme: OffensiveScheme, w: PlaycallingWeights): boolean {
  const runFrac  = w.runPct        / 100;
  const passFrac = 1 - runFrac;
  const t        = cfg.alignmentThreshold;

  switch (scheme) {
    case 'balanced':       return true;  // always considered aligned
    case 'short_passing':  return passFrac * (w.shortPassPct  / 100) >= t;
    case 'deep_passing':   return passFrac * (1 - w.shortPassPct / 100 - w.mediumPassPct / 100) >= t;
    case 'run_inside':     return runFrac  * (w.insideRunPct   / 100) >= t;
    case 'run_outside':    return runFrac  * (1 - w.insideRunPct / 100) >= t;
  }
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
 */
export function computeSchemeAdjustment(
  off: Team,
  def: Team,
  type: PlayType,
): number {
  if (!isRunPassType(type)) return 0;

  const { oc: offOC, dc: offDC, hc: offHC } = off.coaches;  // eslint-disable-line @typescript-eslint/no-unused-vars
  const { oc: defOC, dc: defDC, hc: defHC } = def.coaches;  // eslint-disable-line @typescript-eslint/no-unused-vars
  const offWeights = off.playcalling ?? DEFAULT_PLAYCALLING;

  // 1. OC scheme bonus (applied to offense)
  const ocScheme    = offOC.offensiveScheme ?? 'balanced';
  let   offAdj      = offBonus(ocScheme, type);

  // 2. DC scheme resistance (applied against offense)
  const dcScheme    = defDC.defensiveScheme ?? 'balanced';
  let   defAdj      = defBonus(dcScheme, type);

  // 3. OC overall (above/below 70 baseline) → small offensive boost
  const ocBoost     = (offOC.overall - 70) * cfg.ocOverallScale;

  // 4. DC overall → small defensive resistance
  const dcBoost     = (defDC.overall - 70) * cfg.dcOverallScale;

  // 5. HC global rating → both sides
  const offHCBoost  = (offHC.overall - 70) * cfg.hcOverallScale;
  const defHCBoost  = (defHC.overall - 70) * cfg.hcOverallScale;

  // 6. HC + OC scheme match → extra offensive alignment bonus
  if (offHC.offensiveScheme !== undefined && offHC.offensiveScheme === ocScheme) {
    offAdj += cfg.hcMatchBonus;
  }

  // 7. HC + DC scheme match → extra defensive resistance
  if (defHC.defensiveScheme !== undefined && defHC.defensiveScheme === dcScheme) {
    defAdj += cfg.hcMatchBonus;
  }

  // 8. Playcalling alignment bonus for OC
  if (isAligned(ocScheme, offWeights)) {
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

  // Net: offense gains offAdj + overalls + play action; defense gains defAdj + overalls + focus
  return (offAdj + ocBoost + offHCBoost + playActionAdj) - (defAdj + dcBoost + defHCBoost + defFocusAdj);
}
