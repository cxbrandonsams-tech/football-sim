/**
 * Centralized simulation tuning constants.
 * All "magic numbers" live here — never scatter them through engine files.
 */
export const TUNING = {
  // ── Pass engine ───────────────────────────────────────────────────────────
  pass: {
    // Protection phase
    baseSackChance:        0.050,
    minSackChance:         0.03,
    maxSackChance:         0.18,
    sackRatingScale:       0.002,   // per point of (passRush − passBlocking)

    // Separation phase (coverage suppresses separation; does NOT gate completion)
    separationRouteWeight: 0.50,    // routeRunning contribution
    separationSpeedWeight: 0.30,
    separationReleaseWeight: 0.20,
    coverageResistance:    0.40,    // how much manCoverage suppresses separation

    // Decision phase
    processingReadlineScalar: 0.01, // per point above 50
    decisionPenaltyScale:  0.005,   // per point of pressure on poor decision-makers

    // Throw phase — accuracy by depth
    shortAccuracyBase:     0.75,
    mediumAccuracyBase:    0.62,
    deepAccuracyBase:      0.45,
    accuracyRatingScale:   0.004,   // per point above/below 70

    // Catch phase
    catchingBase:          0.80,
    catchingRatingScale:   0.003,   // per point of catching above 70

    // Ball Skills: affects pass breakups only (not coverage/separation)
    ballSkillsBreakupChance: 0.15,  // base chance DB breaks up a catchable ball
    ballSkillsRatingScale:  0.003,  // per point of ballSkills above 70

    // Interception (on incompletions only)
    baseIntChance:         0.05,
    minIntChance:          0.02,
    maxIntChance:          0.12,
    intCoverageScale:      0.001,   // per point (manCoverage − decisionMaking)

    // Play action deception bonus to separation
    playActionDeceptionBase:       0.08,
    playActionRunThreatBonus:      0.04,  // extra if team has credible run game
    playActionRunThreatThreshold:  70,    // RB power+vision avg needed for bonus
  },

  // ── Run engine ────────────────────────────────────────────────────────────
  run: {
    // Blocking phase
    blockingBase:            0.55,
    blockingRunBlockWeight:  0.50,
    blockingStrengthWeight:  0.50,
    defRunStopResistance:    0.40,

    // Vision phase
    visionBonusThreshold:    75,      // vision above this grants bonus yards
    visionBonusMin:          1,
    visionBonusMax:          3,

    // Engagement phase
    powerVsStrengthScale:    0.01,    // per point (RB power − DL strength)

    // Contact / break-tackle phase
    breakTackleBase:         0.20,
    breakTackleAgilityScale: 0.004,
    breakTacklePowerScale:   0.003,
    tackleHitPowerScale:     0.003,   // LB hitPower increases tackle chance

    // Breakaway phase
    breakawaySpeedThreshold: 85,
    breakawayBonusMin:       5,
    breakawayBonusMax:       15,
    breakawayChance:         0.12,

    // Fumble
    baseFumbleChance:        0.012,
    ballSecurityFumbleReduction: 0.0003, // per point of ballSecurity above 50

    // Yards on success
    insideRunMin:   2,
    insideRunMax:  10,
    outsideRunMin:  3,
    outsideRunMax: 14,

    // Yards on failure (even failed runs typically gain a yard or two)
    failYardsMin: -1,
    failYardsMax:  2,
  },

  // ── Pass yards by depth ───────────────────────────────────────────────────
  passYards: {
    shortMin:   4,
    shortMax:   9,
    mediumMin:  9,
    mediumMax: 19,
    deepMin:   14,
    deepMax:   28,
  },

  // ── Defensive gameplan modifiers ──────────────────────────────────────────
  // Each focus provides a bonus vs. the targeted play type at a cost to others.
  gameplan: {
    stopInsideRun: {
      offSuccessPenalty: -0.08,   // offense inside run success rate penalty
      defResistBonus:     0.06,   // defense inside run resist bonus
      passCost:          -0.04,   // defense pass resistance weakened (tradeoff)
    },
    stopOutsideRun: {
      offSuccessPenalty: -0.08,
      defResistBonus:     0.06,
      passCost:          -0.04,
    },
    stopShortPass: {
      defResistBonus:    0.08,
      runCost:          -0.06,   // defense run resistance weakened (tradeoff)
    },
    stopDeepPass: {
      defResistBonus:    0.10,   // Safety Range bonus active
      runCost:          -0.05,
      shortPassCost:    -0.04,   // short pass defense also softened
    },
    // ── Offensive play-action bonus ─────────────────────────────────────────
    // Added to separation on pass plays when play-action usage is medium/high.
    playAction: {
      low:    0,
      medium: 0.04,   // half the full play-action deception base
      high:   0.08,   // = pass.playActionDeceptionBase
    },
    // ── Tempo: delta to playsPerQuarter from the offensive team's setting ───
    tempo: {
      slow:   -5,   // 35 plays/quarter
      normal:  0,   // 40 plays/quarter (default)
      fast:   +5,   // 45 plays/quarter
    },
  },

  // ── Coaching modifiers ────────────────────────────────────────────────────
  coaching: {
    overallToSuccessScalar: 0.001, // per point of coach overall above 70
    maxCoachBonus:          0.06,
    minCoachPenalty:       -0.04,
  },

  // ── Scheme bonuses ────────────────────────────────────────────────────────
  // All values are additive success-probability adjustments.
  // Positive = helps offense succeed.  Negative = hurts offense (helps defense).
  // Keep these small — schemes flavor play, they don't decide outcomes.
  scheme: {
    // ── Offensive scheme → bonus applied to offense success prob by play type ──
    offensive: {
      balanced:       { inside_run: 0,     outside_run: 0,     short_pass: 0,     medium_pass: 0,    deep_pass: 0    },
      short_passing:  { inside_run: -0.03, outside_run: -0.03, short_pass: 0.06,  medium_pass: 0.02, deep_pass: -0.04 },
      deep_passing:   { inside_run: -0.03, outside_run: -0.03, short_pass: -0.03, medium_pass: 0.02, deep_pass: 0.07  },
      run_inside:     { inside_run: 0.07,  outside_run: -0.02, short_pass: -0.03, medium_pass: -0.03, deep_pass: -0.03 },
      run_outside:    { inside_run: -0.02, outside_run: 0.07,  short_pass: -0.03, medium_pass: -0.03, deep_pass: -0.03 },
    },
    // ── Defensive scheme → penalty applied to offense success prob by play type ─
    // Positive = defense stops it better (offense success goes down).
    defensive: {
      balanced:        { inside_run: 0,     outside_run: 0,     short_pass: 0,     medium_pass: 0,    deep_pass: 0    },
      run_focus:        { inside_run: 0.06,  outside_run: 0.06,  short_pass: -0.04, medium_pass: -0.03, deep_pass: -0.03 },
      speed_defense:    { inside_run: -0.02, outside_run: 0.05,  short_pass: 0.02,  medium_pass: 0.02, deep_pass: 0.04  },
      stop_short_pass:  { inside_run: -0.04, outside_run: -0.04, short_pass: 0.07,  medium_pass: 0.02, deep_pass: -0.02 },
      stop_deep_pass:   { inside_run: -0.03, outside_run: -0.03, short_pass: -0.03, medium_pass: 0.02, deep_pass: 0.08  },
      aggressive:       { inside_run: -0.04, outside_run: -0.04, short_pass: 0.04,  medium_pass: 0.05, deep_pass: 0.06  },
    },
    // ── Alignment bonuses ─────────────────────────────────────────────────────
    // Extra bonus when playcalling aligns with OC scheme (scheme preferred plays > threshold).
    alignmentBonus:   0.03,
    // Additional bonus when HC scheme matches OC or DC scheme.
    hcMatchBonus:     0.02,
    // Threshold: fraction of plays that must match the scheme's preferred category.
    alignmentThreshold: 0.30,
    // OC / DC overall contribution to success prob (per point above 70).
    ocOverallScale:   0.0008,
    dcOverallScale:   0.0008,
    // HC global boost applied to both sides (per point above 70).
    hcOverallScale:   0.0004,
  },

  // ── Season awards ─────────────────────────────────────────────────────────
  // Scoring formulas for end-of-season awards. All values are additive weights
  // applied to stat totals to produce a raw "award score" per player/coach.
  awards: {
    /** Minimum games played to qualify for individual player awards. */
    minGamesPlayed: 10,
    /** Maximum age to qualify for rookie awards. */
    rookieMaxAge:   23,

    // ── MVP ──────────────────────────────────────────────────────────────────
    // QB-biased: non-QB score is multiplied by nonQBMultiplier.
    // Team wins reward playing on a winning team.
    mvp: {
      passingYardsScale:   0.04,
      passingTDBonus:      6,
      intPenalty:          4,
      rushingYardsScale:   0.1,
      rushingTDBonus:      6,
      teamWinBonus:        2,    // per team win
      sackAllowedPenalty:  0.5,
      nonQBMultiplier:     0.85, // bias toward QB
    },

    // ── Offensive Player of the Year ─────────────────────────────────────────
    // Any skill-position player. RB/WR/TE get a multiplier so they can beat QBs.
    opoy: {
      passingYardsScale:   0.03,
      passingTDBonus:      4,
      intPenalty:          3,
      rushingYardsScale:   0.1,
      rushingTDBonus:      6,
      receivingYardsScale: 0.1,
      receivingTDBonus:    6,
      skillPositionMult:   1.10, // RB/WR/TE bonus
    },

    // ── Defensive Player of the Year ─────────────────────────────────────────
    dpoy: {
      sackBonus:      6,
      intCaughtBonus: 8,
      overallScale:   0.3, // baseline from player overall (keeps non-stat-fillers competitive)
    },

    // ── Coach of the Year ─────────────────────────────────────────────────────
    // Rewards wins, improvement over prior year, and making the playoffs.
    coy: {
      winScale:         3,
      improvementScale: 5,  // per win gained over prior year
      playoffBonus:     10,
    },

    // ── Comeback Player of the Year ───────────────────────────────────────────
    // Requires a prior season in history. Rewards production rebound.
    comeback: {
      minCurrentProduction: 600,  // raw production score threshold to qualify
      lowPriorThreshold:    400,  // prior production below this = extra bonus
      lowPriorBonus:        200,
    },
  },

  // ── Field goal ────────────────────────────────────────────────────────────
  fieldGoal: {
    baseChance:          0.98,   // kickers are accurate close-in
    distancePenalty:     0.012,  // per yard beyond 20
    kickPowerBonus:      0.004,  // per point of kickPower above 70
    minChance:           0.25,
    attemptYardLine:     70,     // attempt FG at or beyond this yard line on 4th
                                 // = opponent's 30 yard line ≈ 47-yard FG
  },

  // ── Punt ──────────────────────────────────────────────────────────────────
  punt: {
    minYards:          35,
    maxYards:          52,
    /** Starting yardLine for the receiving team when the ball is kicked into the end zone. */
    touchbackYardLine: 20,
  },

  // ── Big-play burst ────────────────────────────────────────────────────────
  bigPlay: {
    speedThreshold: 82,
    burstChance:    0.15,
    burstBonusMin:  5,
    burstBonusMax:  12,
  },

  // ── Game structure ────────────────────────────────────────────────────────
  game: {
    playsPerQuarter: 40,
    /**
     * Global offense success-probability bonus.
     * Reflects the offense's inherent play-calling advantage (they know the
     * snap count and route assignments; the defense must react).
     * Shifts equal-strength matchups from 50% to ~62% success.
     * Set to 0 to restore perfect parity; raise to give offense more edge.
     */
    offenseAdvantage: 0.12,
  },

  // ── Player progression ────────────────────────────────────────────────────
  progression: {
    /**
     * Age bands in ascending order (maxAge is inclusive).
     * Each band defines the base improve/decline probability and
     * how much change can happen in a single offseason.
     */
    ageBands: [
      //                                                      maxGain maxLoss numRatings
      { maxAge: 22, improveChance: 0.60, declineChance: 0.10, maxGain: 3, maxLoss: 2, numRatings: 2 },
      { maxAge: 25, improveChance: 0.52, declineChance: 0.15, maxGain: 2, maxLoss: 2, numRatings: 2 },
      { maxAge: 28, improveChance: 0.38, declineChance: 0.28, maxGain: 2, maxLoss: 2, numRatings: 1 },
      { maxAge: 32, improveChance: 0.22, declineChance: 0.45, maxGain: 1, maxLoss: 2, numRatings: 1 },
      { maxAge: 99, improveChance: 0.10, declineChance: 0.65, maxGain: 1, maxLoss: 3, numRatings: 1 },
    ],
    // Work Ethic thresholds and their effect on improve/decline probabilities
    workEthicHighThreshold: 70,   // WE at or above this → bonus
    workEthicLowThreshold:  40,   // WE at or below this → penalty
    workEthicImproveBonus:  0.12, // added to improveChance for high WE
    workEthicDeclineSave:   0.10, // subtracted from declineChance for high WE
    workEthicImprovePenalty: 0.12, // subtracted from improveChance for low WE
    workEthicDeclineBonus:   0.10, // added to declineChance for low WE
    // Stamina drift each offseason (on top of outcome-driven direction)
    staminaGainPerImprove: 1,   // base stamina gain when outcome = improve
    staminaLossPerDecline: 1,   // base stamina loss when outcome = decline
    staminaRandomRange:    1,   // ±1 additional random stamina drift
  },

  // ── Retirement ────────────────────────────────────────────────────────────
  retirement: {
    /** Players younger than this never retire. */
    minRetirementAge: 28,
    /**
     * Age-based retirement probability curve.
     * Entries must be in ascending minAge order.
     * The matching entry is the last one where minAge ≤ player.age.
     */
    ageCurve: [
      { minAge: 28, chance: 0.02 },
      { minAge: 29, chance: 0.03 },
      { minAge: 30, chance: 0.05 },
      { minAge: 31, chance: 0.08 },
      { minAge: 32, chance: 0.12 },
      { minAge: 33, chance: 0.18 },
      { minAge: 34, chance: 0.25 },
      { minAge: 35, chance: 0.34 },
      { minAge: 36, chance: 0.45 },
      { minAge: 37, chance: 0.58 },
      { minAge: 38, chance: 0.70 },
      { minAge: 39, chance: 0.80 },
      { minAge: 40, chance: 0.90 },
    ],
    /** Overall below this → extra retirement probability (aging bench warmers). */
    lowOverallThreshold: 55,
    lowOverallBonus:     0.08,
    /** Overall at or above this → reduced retirement probability (elite longevity). */
    eliteOverallThreshold: 75,
    eliteOverallSave:      0.05,
  },

  // ── In-game fatigue ───────────────────────────────────────────────────────
  fatigue: {
    /** Per-play fatigue buildup for a player with stamina=50 (scaled by (100-stamina)/50). */
    buildupPerPlay:       0.006,
    /** How much each unit of fatigue (0–1) reduces the offense successProb. */
    effectivenessPenalty: 0.05,
  },

  // ── In-game injuries ──────────────────────────────────────────────────────
  injury: {
    /** Base per-play injury chance for any involved player. */
    baseChancePerPlay:   0.0008,
    /** Per point of discipline above 50, reduces injury chance. */
    disciplineReduction: 0.0008,
    /** Per point of stamina below 70, increases injury chance. */
    staminaInjuryScale:  0.0005,
    /** Per-play floor — even elite players can get hurt. */
    minChancePerPlay:    0.0002,
    /** Injury chance multiplier applied at fatigue = 1.0 (linearly scaled). */
    fatigueMult:         1.5,
    // Severity tiers — weights must sum to 1.0
    minor:    { weight: 0.60, weeksMin: 1, weeksMax: 1 },
    moderate: { weight: 0.30, weeksMin: 2, weeksMax: 4 },
    major:    { weight: 0.10, weeksMin: 5, weeksMax: 8 },
  },
} as const;
