import { TUNING } from './config';

const cfg = TUNING.run;

// ── Phase 1: Blocking ─────────────────────────────────────────────────────────

export interface BlockingResult {
  score:  number; // 0 (blown) → 1 (dominant)
  yards:  number; // blocking phase base yards
}

/**
 * Evaluate how well the OL handles the DL on this run.
 * GDD: TE acts as hybrid receiver and blocker — TE blocking contributes to run blocking.
 * The result modulates available lanes and base yards.
 */
export function evaluateBlocking(
  olRunBlocking:  number,
  dlRunDefense:   number,
  teBlocking:     number = 50, // GDD: TE contributes to run blocking as hybrid role
): BlockingResult {
  // Blend OL (primary) and TE (secondary) into effective blocking composite
  const effectiveBlocking = olRunBlocking * (1 - cfg.teBlockingWeight) + teBlocking * cfg.teBlockingWeight;
  const olScore = effectiveBlocking;
  const dlScore = dlRunDefense * cfg.defRunDefenseResistance;

  const rawScore = (olScore - dlScore) / 100 + cfg.blockingBase;
  const score    = Math.max(0, Math.min(1, rawScore));
  const yards    = score > 0.5 ? 1 : 0; // blocking phase just opens a gap or doesn't

  return { score, yards };
}

// ── Phase 2: Vision ───────────────────────────────────────────────────────────

export interface VisionResult {
  bonusYards:    number; // 0 if vision doesn't find the right hole
  foundCutback:  boolean;
}

/**
 * RB vision score determines whether they find the correct hole and
 * potentially gain bonus yards from a cutback or hole-reading.
 */
export function evaluateVision(
  rbVision:       number,
  blockingScore:  number,
): VisionResult {
  if (rbVision < cfg.visionBonusThreshold) {
    return { bonusYards: 0, foundCutback: false };
  }

  // Higher vision + decent blocking = chance to find cutback lane
  const cutbackChance = ((rbVision - cfg.visionBonusThreshold) / 24) * (0.4 + blockingScore * 0.6);
  const foundCutback  = Math.random() < cutbackChance;
  const bonusYards    = foundCutback
    ? randInt(cfg.visionBonusMin, cfg.visionBonusMax)
    : 0;

  return { bonusYards, foundCutback };
}

// ── Phase 3: Engagement ───────────────────────────────────────────────────────

export interface EngagementResult {
  powerAdvantage: number; // -1 to +1 (negative = DL wins, positive = RB wins)
}

/**
 * First-contact engagement between RB power and DL run defense at the point of attack.
 */
export function evaluateEngagement(
  rbPower:      number,
  dlRunDefense: number,
): EngagementResult {
  const powerAdvantage = (rbPower - dlRunDefense) * cfg.powerVsRunDefenseScale;
  return { powerAdvantage: Math.max(-1, Math.min(1, powerAdvantage)) };
}

// ── Phase 4: Contact / Break Tackle ──────────────────────────────────────────

export interface ContactResult {
  brokeFirstTackle: boolean;
  yardModifier:     number; // yards gained/lost at contact point
}

/**
 * Determine whether the RB breaks the initial tackle attempt.
 * LB pursuit and speed increase tackle success.
 * GDD: Contact uses Power OR Elusiveness (not blended) — selected by run type.
 *   Inside runs favor Power (driving through contact at the point of attack).
 *   Outside runs favor Elusiveness (making defenders miss in space).
 */
export function evaluateContact(
  rbElusiveness: number,
  rbPower:       number,
  lbPursuit:     number,
  lbSpeed:       number,
  powerAdvantage: number,
  runType:        'inside_run' | 'outside_run', // GDD: determines Power OR Elusiveness
): ContactResult {
  // GDD: Use the stat that matches the run type — NOT a blend of both
  const rbContactStat = runType === 'inside_run' ? rbPower : rbElusiveness;
  const contactScale  = runType === 'inside_run'
    ? cfg.breakTacklePowerScale
    : cfg.breakTackleElusivenessScale;

  const breakChance =
    cfg.breakTackleBase +
    (rbContactStat - 50) * contactScale +
    powerAdvantage * 0.15;

  const tackleBonus  =
    (lbPursuit - 50) * cfg.tackleSpeedScale +
    (lbSpeed   - 50) * cfg.tackleSpeedScale;

  const breakProb      = Math.max(0.05, Math.min(0.70, breakChance - tackleBonus));
  const brokeFirstTackle = Math.random() < breakProb;

  return {
    brokeFirstTackle,
    yardModifier: brokeFirstTackle ? 1 : 0,
  };
}

// ── Phase 5: Breakaway ────────────────────────────────────────────────────────

export interface BreakawayResult {
  bonusYards: number;
  gotFreeRun: boolean;
}

/**
 * If the RB breaks into the second level after breaking the first tackle,
 * speed determines whether they pull away for extra yards (open field only).
 * GDD: Inside = lower breakaway chance, Outside = higher breakaway chance.
 */
export function evaluateBreakaway(
  rbSpeed:          number,
  brokeFirstTackle: boolean,
  runType:          'inside_run' | 'outside_run', // GDD: run type modulates breakaway chance
): BreakawayResult {
  if (!brokeFirstTackle) {
    return { bonusYards: 0, gotFreeRun: false };
  }

  if (rbSpeed < cfg.breakawaySpeedThreshold) {
    return { bonusYards: 0, gotFreeRun: false };
  }

  // GDD: Inside runs are congested — lower chance of full breakaway
  //       Outside runs reach open field — higher chance
  const breakawayChance = runType === 'inside_run'
    ? cfg.insideBreakawayChance
    : cfg.outsideBreakawayChance;

  const gotFreeRun = Math.random() < breakawayChance;
  const bonusYards = gotFreeRun
    ? randInt(cfg.breakawayBonusMin, cfg.breakawayBonusMax)
    : 0;

  return { bonusYards, gotFreeRun };
}

// ── Fumble check ──────────────────────────────────────────────────────────────

export function checkFumble(ballSecurity: number): boolean {
  const chance = Math.max(
    0,
    cfg.baseFumbleChance - (ballSecurity - 50) * cfg.ballSecurityFumbleReduction,
  );
  return Math.random() < chance;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
