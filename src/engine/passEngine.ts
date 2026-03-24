import { TUNING } from './config';
import { type PassConcept, type PassDepth } from './playConcepts';

const cfg = TUNING.pass;

// ── Phase 1: Protection ───────────────────────────────────────────────────────

export interface ProtectionResult {
  pressureLevel: number; // 0 (clean pocket) → 1 (heavy pressure)
  sacked:        boolean;
}

/**
 * Determine whether the QB was sacked and, if not, how much pressure exists.
 * pressureLevel feeds into Decision and Throw phases.
 */
export function evaluateProtection(
  olPassBlocking: number,
  dlPassRush:     number,
): ProtectionResult {
  const olRating  = olPassBlocking;
  const dlRating  = dlPassRush;
  const advantage = dlRating - olRating;

  const sackChance = Math.max(
    cfg.minSackChance,
    Math.min(cfg.maxSackChance, cfg.baseSackChance + advantage * cfg.sackRatingScale),
  );
  const sacked = Math.random() < sackChance;

  const pressureLevel = Math.max(
    0,
    Math.min(1, (advantage / 50) * 0.8),
  );

  return { pressureLevel, sacked };
}

// ── Phase 2: Separation ───────────────────────────────────────────────────────

export interface SeparationResult {
  score:    number; // 0 (covered) → 1 (wide open)
  readIdx:  number; // which read was selected (0-based index in concept.reads)
}

/**
 * Score each read in the play concept and select the best open receiver.
 * Coverage affects separation only — it does NOT hard-gate completions.
 * Play action deception bonus is applied when concept.playAction.active = true
 * and the run game is a credible threat.
 */
export function evaluateSeparation(
  concept:         PassConcept,
  // Per-read offense ratings (parallel array matching concept.reads)
  offRatingsByRead: number[][],
  // Per-read defense ratings (parallel array matching concept.reads)
  defRatingsByRead: number[][],
  pressureLevel:   number,
  runThreatScore:  number,  // 0-100 how much of a run threat the offense poses
): SeparationResult {
  const scores: number[] = concept.reads.map((read, i) => {
    const offRatings = offRatingsByRead[i] ?? [];
    const defRatings = defRatingsByRead[i] ?? [];

    // Weighted offense score (0-99)
    const offScore = read.offWeights.reduce((sum, w, j) => {
      return sum + (offRatings[j] ?? 50) * w.weight;
    }, 0);

    // Weighted defense score (0-99)
    const defScore = read.defWeights.reduce((sum, w, j) => {
      return sum + (defRatings[j] ?? 50) * w.weight;
    }, 0);

    // Base separation (0-1)
    const base = offScore / (offScore + defScore * cfg.coverageResistance + 1);

    // Play action bonus
    let paBonus = 0;
    if (concept.playAction.active) {
      paBonus = concept.playAction.deceptionBonus;
      if (runThreatScore >= cfg.playActionRunThreatThreshold) {
        paBonus += cfg.playActionRunThreatBonus;
      }
    }

    // Pressure reduces separation slightly
    const pressurePenalty = pressureLevel * 0.10;

    return Math.max(0, Math.min(1, base + paBonus - pressurePenalty));
  });

  // Select the best read (highest separation score)
  let bestIdx   = 0;
  let bestScore = -1;
  for (let i = 0; i < scores.length; i++) {
    if ((scores[i] ?? 0) > bestScore) {
      bestScore = scores[i] ?? 0;
      bestIdx   = i;
    }
  }

  return { score: bestScore, readIdx: bestIdx };
}

// ── Phase 3: Decision ─────────────────────────────────────────────────────────

export interface DecisionResult {
  targetReadIdx: number; // read index the QB chose to throw to
  confidence:    number; // 0-1 how cleanly the QB processed the read
}

/**
 * QB decides which read to throw based on processing and decision-making.
 * High processing → more likely to find the best read.
 * High pressure → increases chance of poor decision (wrong read / early throw).
 */
export function evaluateDecision(
  processing:      number,
  decisionMaking:  number,
  pressureLevel:   number,
  separationScores: number[], // from evaluateSeparation for each read
): DecisionResult {
  // Processing score (0-1): how well QB surveys the field
  const processScore = Math.min(1, 0.5 + (processing - 50) * cfg.processingReadlineScalar);

  // Under pressure, poor decision-making hurts more
  const decisionPenalty = pressureLevel * (70 - decisionMaking) * cfg.decisionPenaltyScale;
  const confidence = Math.max(0, Math.min(1, processScore - decisionPenalty));

  // With high confidence, QB finds the best read.
  // With low confidence, QB might default to first read even if not optimal.
  const bestReadIdx = separationScores.reduce(
    (best, score, i) => score > (separationScores[best] ?? 0) ? i : best,
    0,
  );

  const targetReadIdx = confidence > 0.5 ? bestReadIdx : 0;

  return { targetReadIdx, confidence };
}

// ── Phase 4: Throw ────────────────────────────────────────────────────────────

export interface ThrowResult {
  quality:    number; // 0 (terrible throw) → 1 (perfect)
  completed:  boolean;
  depth:      PassDepth;
}

/**
 * Determine throw quality based on QB accuracy for the given depth,
 * pocket pressure, and the separation the receiver achieved.
 */
export function evaluateThrow(
  depth:          PassDepth,
  shortAccuracy:  number,
  mediumAccuracy: number,
  deepAccuracy:   number,
  pressureLevel:  number,
  separationScore: number,
): ThrowResult {
  const accuracyRating =
    depth === 'short'  ? shortAccuracy  :
    depth === 'medium' ? mediumAccuracy : deepAccuracy;

  const accuracyBase =
    depth === 'short'  ? cfg.shortAccuracyBase  :
    depth === 'medium' ? cfg.mediumAccuracyBase : cfg.deepAccuracyBase;

  const accuracyMod = (accuracyRating - 70) * cfg.accuracyRatingScale;
  const pressurePenalty = pressureLevel * 0.18;

  const quality = Math.max(
    0,
    Math.min(1, accuracyBase + accuracyMod - pressurePenalty + separationScore * 0.10),
  );

  return { quality, completed: Math.random() < quality, depth };
}

// ── Phase 5: Catch / Contest ──────────────────────────────────────────────────

export interface CatchResult {
  caught:   boolean;
  brokenUp: boolean; // DB broke up a catchable ball
  yards:    number;
}

/**
 * Determine whether the receiver catches the ball and whether the DB contests it.
 *
 * - Ball Skills (DB): affects pass breakups only, not coverage/separation.
 * - Catching (WR): increases catch probability on contested or difficult balls.
 */
export function evaluateCatch(
  hands:          number,
  dbBallSkills:   number,
  throwQuality:   number,
): CatchResult {
  // Catch chance
  const catchMod  = (hands - 70) * cfg.handsRatingScale;
  const catchProb = Math.max(0, Math.min(1, cfg.catchingBase + catchMod + throwQuality * 0.15));

  // DB breakup chance (only if ball is catchable)
  const breakupMod  = (dbBallSkills - 70) * cfg.ballSkillsRatingScale;
  const breakupProb = Math.max(0, cfg.ballSkillsBreakupChance + breakupMod);

  const brokenUp = Math.random() < breakupProb;
  const caught   = !brokenUp && Math.random() < catchProb;

  return { caught, brokenUp, yards: 0 }; // yards set by caller based on depth
}

// ── Interception check ────────────────────────────────────────────────────────

/**
 * On an incompletion, check whether the DB intercepted the ball.
 * coverage vs decisionMaking — poor decisions under pressure are punished.
 */
export function checkInterception(
  dbCoverage:       number,
  qbDecisionMaking: number,
  pressureLevel:    number,
): boolean {
  const advantage = (dbCoverage - qbDecisionMaking) * cfg.intCoverageScale;
  const pressureBonus = pressureLevel * 0.04;
  const chance = Math.max(
    cfg.minIntChance,
    Math.min(cfg.maxIntChance, cfg.baseIntChance + advantage + pressureBonus),
  );
  return Math.random() < chance;
}
