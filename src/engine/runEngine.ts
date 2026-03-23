import { TUNING } from './config';

const cfg = TUNING.run;

// ── Phase 1: Blocking ─────────────────────────────────────────────────────────

export interface BlockingResult {
  score:  number; // 0 (blown) → 1 (dominant)
  yards:  number; // blocking phase base yards
}

/**
 * Evaluate how well the OL handles the DL on this run.
 * The result modulates available lanes and base yards.
 */
export function evaluateBlocking(
  olRunBlocking: number,
  olStrength:    number,
  dlRunStop:     number,
  dlStrength:    number,
): BlockingResult {
  const olScore = olRunBlocking * cfg.blockingRunBlockWeight + olStrength * cfg.blockingStrengthWeight;
  const dlScore = dlRunStop     * cfg.defRunStopResistance   + dlStrength * cfg.defRunStopResistance;

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
 * First-contact engagement between RB power and DL strength at the point of attack.
 */
export function evaluateEngagement(
  rbPower:    number,
  dlStrength: number,
): EngagementResult {
  const powerAdvantage = (rbPower - dlStrength) * cfg.powerVsStrengthScale;
  return { powerAdvantage: Math.max(-1, Math.min(1, powerAdvantage)) };
}

// ── Phase 4: Contact / Break Tackle ──────────────────────────────────────────

export interface ContactResult {
  brokeFirstTackle: boolean;
  yardModifier:     number; // yards gained/lost at contact point
}

/**
 * Determine whether the RB breaks the initial tackle attempt.
 * LB hitPower and pursuit increase tackle success.
 * RB agility and power increase break-tackle chance.
 */
export function evaluateContact(
  rbAgility:   number,
  rbPower:     number,
  lbPursuit:   number,
  lbHitPower:  number,
  powerAdvantage: number,
): ContactResult {
  const breakChance =
    cfg.breakTackleBase +
    (rbAgility - 50) * cfg.breakTackleAgilityScale +
    (rbPower   - 50) * cfg.breakTacklePowerScale   +
    powerAdvantage * 0.15;

  const tackleBonus  =
    (lbPursuit  - 50) * cfg.tackleHitPowerScale +
    (lbHitPower - 50) * cfg.tackleHitPowerScale;

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
 * speed and acceleration determine whether they pull away for extra yards.
 */
export function evaluateBreakaway(
  rbSpeed:        number,
  rbAcceleration: number,
  brokeFirstTackle: boolean,
): BreakawayResult {
  if (!brokeFirstTackle) {
    return { bonusYards: 0, gotFreeRun: false };
  }

  const speedScore = (rbSpeed + rbAcceleration) / 2;
  if (speedScore < cfg.breakawaySpeedThreshold) {
    return { bonusYards: 0, gotFreeRun: false };
  }

  const gotFreeRun = Math.random() < cfg.breakawayChance;
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
