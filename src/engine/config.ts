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
    separationRouteWeight: 0.60,    // routeRunning contribution
    separationSpeedWeight: 0.40,
    coverageResistance:    0.40,    // how much coverage suppresses separation

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
    handsRatingScale:      0.003,   // per point of hands above 70

    // Ball Skills: affects pass breakups AND interception generation
    ballSkillsBreakupChance: 0.15,  // base chance DB breaks up a catchable ball
    ballSkillsRatingScale:  0.003,  // per point of ballSkills above 70
    // GDD: Ball Skills create turnovers — contributes to INT chance (not just breakups)
    ballSkillsIntScale:     0.0008, // per point of ballSkills above 50, adds to INT chance

    // GDD: WR Size vs DB Size — small situational modifier on contested passes
    // Size is minor and situational (GDD); small WR can still win
    sizeAdvantageScale:     0.001,  // per point of (wrSize - dbSize)

    // YAC phase — WR YAC vs (CB Tackling + Safety Tackling + LB Pursuit) / 3
    // GDD: YAC uses YAC vs Tackling/Pursuit; positive = bonus yards after catch
    yacNetScale:           0.05,    // per point of net WR YAC advantage

    // Interception (on incompletions only)
    baseIntChance:         0.05,
    minIntChance:          0.02,
    maxIntChance:          0.12,
    intCoverageScale:      0.001,   // per point (coverage − decisionMaking)

    // GDD: QB Mobility affects sacks/scramble only
    mobilityReductionScale:    0.0015, // per point of mobility above 50, reduces sack chance
    scrambleMobilityThreshold: 60,     // mobility floor before scramble is an option
    scrambleYardsMin:          2,
    scrambleYardsMax:          10,

    // Play action deception bonus to separation
    playActionDeceptionBase:       0.08,
    playActionRunThreatBonus:      0.04,  // extra if team has credible run game
    playActionRunThreatThreshold:  70,    // RB power+vision avg needed for bonus
  },

  // ── Run engine ────────────────────────────────────────────────────────────
  run: {
    // Blocking phase
    blockingBase:               0.55,
    defRunDefenseResistance:    0.40,

    // Vision phase
    visionBonusThreshold:    75,      // vision above this grants bonus yards
    visionBonusMin:          1,
    visionBonusMax:          3,

    // Engagement phase
    powerVsRunDefenseScale:       0.01,    // per point (RB power − DL runDefense)

    // Contact / break-tackle phase
    breakTackleBase:              0.20,
    breakTackleElusivenessScale:  0.004,
    breakTacklePowerScale:        0.003,
    tackleSpeedScale:             0.003,   // LB speed increases tackle chance

    // Breakaway phase
    breakawaySpeedThreshold: 85,
    breakawayBonusMin:       5,
    breakawayBonusMax:       15,
    // GDD: Inside = lower breakaway chance, Outside = higher breakaway chance
    // Replaces the single breakawayChance for run plays (passes still use bigPlay.burstChance)
    insideBreakawayChance:   0.06,   // lower — inside runs are congested
    outsideBreakawayChance:  0.18,   // higher — outside runs reach open field

    // GDD: TE acts as hybrid blocker — contributes to run blocking
    teBlockingWeight:        0.20,   // TE contributes 20% of run blocking composite

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

    // 4th-down go-for-it base probabilities and personality multipliers
    fourthDown: {
      baseProb: {
        dist1:    0.55,  // 4th and 1
        dist2:    0.35,  // 4th and 2
        dist3:    0.20,  // 4th and 3
        dist5:    0.12,  // 4th and 4-5
        distLong: 0.04,  // 4th and 6+
      },
      goalLineBump:          0.20,  // extra chance when inside opponent's 10
      personalityMultiplier: {
        conservative: 0.50,
        balanced:     1.00,
        aggressive:   1.70,
      } as Record<string, number>,
    },

    // Coach carousel & pool
    carousel: {
      poolTargetSize:      15,   // target number of unemployed coaches
      traitChanceHC:       0.35, // probability initial HC gets a trait
      traitChanceCoord:    0.25, // probability initial OC/DC gets a trait
      traitChanceInternal: 0.40, // probability internal coordinator gets a trait
      traitChancePool:     0.30, // probability pool coach gets a trait
      internalOvrPenalty:  8,    // OVR below external pool avg for internal promotions
      // HC firing thresholds (AI teams only)
      firing: {
        belowWinThreshold:  4,    // < 4 wins: high fire chance
        midWinThreshold:    7,    // 4-6 wins: moderate chance; 7+: low chance
        probBelowThreshold: 0.60,
        probMidWins:        0.25,
        probHighWins:       0.05,
      },
    },

    // Coaching trait effect sizes — all modest and centralized
    traits: {
      talentEvaluatorScoutingBonus:  2,      // +N scouting actions per season
      contractNegotiatorDiscount:    0.05,   // 5% off FA signing salaries
      offensivePioneerBonus:         0.025,  // +2.5% pass / play-action success
      quarterbackGuruBonus:          0.015,  // +1.5% QB completion / INT reduction
      runGameSpecialistBonus:        0.025,  // +2.5% run success
      defensiveArchitectBonus:       0.020,  // +2.0% defensive resistance (pass)
      passRushSpecialistBonus:       0.025,  // +2.5% sack/pressure effectiveness
      turnovertMachineBonus:         0.020,  // +2.0% turnover generation (pass def)
      playerDeveloperImproveBonus:   0.10,   // +10% improve chance in progression
      playerDeveloperDeclineSave:    0.05,   // -5% decline chance in progression
      youthDeveloperImproveBonus:    0.15,   // +15% improve chance for yearsPro <= 3
      veteranStabilizerDeclineSave:  0.08,   // -8% decline chance for age >= 30
    } as Record<string, number>,
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

  // ── Scouting system ───────────────────────────────────────────────────────
  scouting: {
    // Point costs for each scouting pass (escalating)
    pass1Cost:          10,
    pass2Cost:          20,
    pass3Cost:          35,
    // Scouting points per unit of team scoutingBudget (budget 5 → 150 pts)
    pointsPerBudgetUnit: 30,
    // Default budget tier for new teams (5 → 150 points)
    defaultBudgetTier:   5,
    // How many rounds of variance the projected round has per scout level
    roundVarianceL1: 2,  // wide early look
    roundVarianceL2: 1,  // tighter after film study
    roundVarianceL3: 1,  // still uncertain even at max
    // Rating noise (added to each true rating before ranking strengths/weaknesses)
    ratingNoiseL1: 22,   // rough — often picks wrong strengths
    ratingNoiseL2: 11,   // moderate
    ratingNoiseL3:  5,   // low but never zero
    // Per point of scout overall above/below 70 — scales noise up or down
    scoutQualityFactor: 0.20,
  },

  // ── Development traits ────────────────────────────────────────────────────
  // Modifiers applied on top of age-band + workEthic in progressPlayer.
  // declineSave: positive = saves from declining; negative = adds to decline chance.
  devTraits: {
    superDev:    { improveBonus: 0.15, declineSave:  0.08 },
    normal:      { improveBonus: 0.00, declineSave:  0.00 },
    lateBloomer: { improveBonus: -0.08, declineSave: 0.04 },
    bust:        { improveBonus: -0.15, declineSave: -0.08 },
    declining:   { improveBonus: -0.12, declineSave: -0.15 },
    /** Late bloomer activates peak modifiers once yearsPro reaches this. */
    lateBloomerPeakYears:        4,
    lateBloomerPeakImproveBonus: 0.20,
    lateBloomerPeakDeclineSave:  0.12,
  },

  // ── Trades ────────────────────────────────────────────────────────────────
  trades: {
    /** Default AI acceptance threshold: incoming / outgoing must be >= this. */
    aiAcceptThreshold:        0.85,
    /** Contenders slightly more willing to overpay for proven players. */
    contenderThreshold:       0.80,
    /** Rebuilders eager for picks/youth — lower threshold when getting them. */
    rebuilderPickThreshold:   0.75,
    /** Rebuilders wary of trading away vets with no youth/pick return. */
    rebuilderNoPickThreshold: 0.90,
    /** Min offer-value / asked-value ratio for a shop offer to be generated. */
    shopMinRatio:             0.82,
    /** Max shop offers generated per player. */
    shopMaxOffers:            3,
    /** Max AI-to-AI trades per offseason advance. */
    aiMaxTrades:              3,
    /** Max candidate pair attempts for AI-to-AI matching. */
    aiMaxAttempts:            15,
    /** AI-to-AI trades are skipped when offer ratio is below this. */
    aiLopsidedThreshold:      0.80,
  },

  // ── Free agency ───────────────────────────────────────────────────────────
  freeAgency: {
    /** FAs request this multiple of their market salary (5% premium). */
    salaryPremium:        1.05,
    /** Offer ≥ this fraction of asking salary always accepted (if years OK). */
    autoAcceptThreshold:  1.00,
    /** Offer below this fraction of asking salary always rejected. */
    acceptThreshold:      0.88,
    /** Max years any FA will demand. */
    maxDemandYears:       4,
    /** CPU teams compete for FAs with overall at or above this in the initial round. */
    cpuCompeteMinOvr:     62,
    /** Fraction of open roster spots CPU fills in the initial FA round. */
    cpuInitialSignFrac:   0.40,
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

  // ── Hall of Fame / Legacy scoring (Phase 31) ──────────────────────────────
  hof: {
    /** Minimum legacy score required for induction. */
    inductionThreshold: 120,
    /** Score added per season of professional play. */
    longevityPerYear:   3,
    /** Score added per championship won (as a member of the winning team). */
    championshipBonus:  20,
    /** Score bonus for all-time rank in a position's primary stat(s). */
    rankBonus: {
      top3:  25,
      top5:  15,
      top10:  8,
    },
    /** Award point values. Keyed by AwardType string. */
    awardPoints: {
      MVP:             30,
      OPOY:            20,
      DPOY:            20,
      OROY:            10,
      DROY:            10,
      AllPro1:         15,
      AllPro2:          8,
      Comeback_Player: 10,
    },
    /**
     * Career stat multipliers per position group.
     * All nine tracked stats listed for every group; zero = not relevant.
     */
    statWeights: {
      QB:  { passingYards: 0.018, passingTDs: 5.0, rushingYards: 0.008, rushingTDs: 2.0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
      RB:  { passingYards: 0, passingTDs: 0, rushingYards: 0.050, rushingTDs: 6.0, receivingYards: 0.015, receivingTDs: 2.0, receptions: 0.30, sacks: 0, interceptionsCaught: 0 },
      WR:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0.050, receivingTDs: 6.0, receptions: 0.40, sacks: 0, interceptionsCaught: 0 },
      TE:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0.050, receivingTDs: 6.0, receptions: 0.40, sacks: 0, interceptionsCaught: 0 },
      OL:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 0, interceptionsCaught: 0 },
      DL:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks: 10.0, interceptionsCaught: 4.0 },
      LB:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks:  8.0, interceptionsCaught: 6.0 },
      CB:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks:  3.0, interceptionsCaught: 12.0 },
      SAF: { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks:  4.0, interceptionsCaught: 10.0 },
      ST:  { passingYards: 0, passingTDs: 0, rushingYards: 0, rushingTDs: 0, receivingYards: 0, receivingTDs: 0, receptions: 0, sacks:  0,   interceptionsCaught: 0 },
    },
    /** Minimum score (inclusive) for each tier label. */
    tierThresholds: {
      outside_shot:  30,
      building:      55,
      strong:        80,
      likely:       100,
      hall_of_famer: 120,
    },
  },

  // ── Ring of Honor / Team Legacy (Phase 34) ───────────────────────────────
  ringOfHonor: {
    /** Minimum team-legacy score to enter a team's Ring of Honor. */
    inductionThreshold:        45,
    /** Score to trigger jersey retirement (above inductionThreshold). */
    jerseyRetirementThreshold: 80,
    /** Points per season played with the team. */
    longevityPerYear:           2,
    /**
     * Loyalty bonus: extra points per season spent with the team
     * beyond loyaltyThreshold.  Rewards franchise cornerstones.
     */
    loyaltyThreshold: 3,
    loyaltyBonus:     4,
    /** Points added per championship won while on this specific team. */
    championshipBonus: 15,
    /** Award point values — mirrors HoF but slightly scaled down. */
    awardPoints: {
      MVP:             25,
      OPOY:            15,
      DPOY:            15,
      OROY:             8,
      DROY:             8,
      AllPro1:         12,
      AllPro2:          5,
      Comeback_Player:  8,
    },
    // Stat weights are shared with TUNING.hof.statWeights — same multipliers,
    // only applied to team-filtered seasons instead of full career.
  },

  // ── Front-office personality biases (Phase 36) ───────────────────────────
  //
  // All values are modest adjustments on top of existing football logic.
  // Personality biases the decision, never replaces it.
  frontOffice: {
    /**
     * Draft scoring adjustments.
     *   youthBonus     — extra score for prospects aged ≤ 22
     *   veteranBonus   — extra score for prospects aged ≥ 25 (negative = penalty)
     *   needMultiplier — scales the existing posNeedBonus (1.0 = no change)
     */
    draft: {
      balanced:     { youthBonus: 0,  veteranBonus: 0,  needMultiplier: 1.0 },
      aggressive:   { youthBonus: 0,  veteranBonus: 3,  needMultiplier: 1.2 },
      conservative: { youthBonus: 0,  veteranBonus: 0,  needMultiplier: 0.9 },
      win_now:      { youthBonus: -2, veteranBonus: 4,  needMultiplier: 1.3 },
      rebuilder:    { youthBonus: 6,  veteranBonus: -3, needMultiplier: 0.8 },
      development:  { youthBonus: 8,  veteranBonus: -2, needMultiplier: 0.9 },
    } as Record<string, { youthBonus: number; veteranBonus: number; needMultiplier: number }>,

    /**
     * Free-agency scoring adjustments.
     *   agePenaltyMult — multiplier on the existing direction age penalty
     *   highOvrBonus   — flat bonus for FA overall ≥ 75 (negative = penalty)
     */
    freeAgency: {
      balanced:     { agePenaltyMult: 1.0, highOvrBonus:  0 },
      aggressive:   { agePenaltyMult: 0.7, highOvrBonus:  4 },
      conservative: { agePenaltyMult: 1.2, highOvrBonus: -2 },
      win_now:      { agePenaltyMult: 0.5, highOvrBonus:  6 },
      rebuilder:    { agePenaltyMult: 1.5, highOvrBonus: -3 },
      development:  { agePenaltyMult: 1.2, highOvrBonus: -2 },
    } as Record<string, { agePenaltyMult: number; highOvrBonus: number }>,

    /**
     * Trade evaluation adjustments.
     *   thresholdAdjust — added to the direction-based acceptance threshold
     *                     (negative = more willing to accept; positive = pickier)
     *   pickValueBonus  — added to incoming-pick value when team evaluates picks
     *                     (positive = values picks highly; negative = indifferent)
     */
    trades: {
      balanced:     { thresholdAdjust:  0,     pickValueBonus:  0 },
      aggressive:   { thresholdAdjust: -0.03,  pickValueBonus: -3 },
      conservative: { thresholdAdjust:  0.04,  pickValueBonus:  0 },
      win_now:      { thresholdAdjust: -0.05,  pickValueBonus: -5 },
      rebuilder:    { thresholdAdjust:  0.02,  pickValueBonus:  8 },
      development:  { thresholdAdjust:  0.03,  pickValueBonus:  6 },
    } as Record<string, { thresholdAdjust: number; pickValueBonus: number }>,

    /**
     * Coaching carousel adjustments.
     *   firingProbAdjust — added to each firing probability tier
     *                      (positive = more trigger-happy; negative = patient)
     *   hiringPoolSize   — how many pool candidates to consider (lower = pickier)
     */
    coaching: {
      balanced:     { firingProbAdjust:  0,     hiringPoolSize: 3 },
      aggressive:   { firingProbAdjust:  0.06,  hiringPoolSize: 2 },
      conservative: { firingProbAdjust: -0.06,  hiringPoolSize: 3 },
      win_now:      { firingProbAdjust:  0.08,  hiringPoolSize: 1 },
      rebuilder:    { firingProbAdjust:  0.03,  hiringPoolSize: 4 },
      development:  { firingProbAdjust: -0.02,  hiringPoolSize: 5 },
    } as Record<string, { firingProbAdjust: number; hiringPoolSize: number }>,
  },

  // ── GM Career / Personal Legacy (Phase 35) ──────────────────────────────
  gmLegacy: {
    /** Points per championship won as GM. */
    championshipBonus:     30,
    /** Points per playoff appearance. */
    playoffBonus:          10,
    /** Points per winning-record season (wins > losses). */
    winningSeasonBonus:     5,
    /** Points per win across all GM seasons (small contribution). */
    winScale:               0.5,
    /** Points per complete season managed. */
    longevityPerYear:        2,
    /** Achievement point values by achievement id. */
    achievementPoints: {
      first_championship:      20,
      dynasty:                 40,
      perennial_contender:     15,
      rebuild_artist:          15,
      ironman:                 10,
      active_gm:                5,
      deal_maker:              10,
      draft_expert:            10,
    } as Record<string, number>,
    /** Thresholds for legacy tier labels (for display). */
    tierThresholds: {
      building:    30,
      established: 60,
      respected:   100,
      elite:       150,
      legendary:   200,
    },
  },

  // ── News / storyline generation (Phase 29) ────────────────────────────────
  news: {
    // Milestone thresholds — must be crossed for a news item to be generated.
    // Each value is triggered exactly once per player per season.
    milestones: {
      passingYards:        [1000, 2000, 3000, 4000] as const,
      passingTDs:          [10, 20, 30, 40]          as const,
      rushingYards:        [500, 1000, 1500]          as const,
      rushingTDs:          [5, 10, 15]                as const,
      receivingYards:      [500, 1000, 1500]          as const,
      receivingTDs:        [5, 10, 15]                as const,
      sacks:               [5, 10, 15]                as const,
      interceptionsCaught: [3, 5, 7]                  as const,
    },
    // Stat-race headlines: earliest week they can appear (to avoid week-1 noise)
    // and max per-week cap across all race items.
    statRace: {
      firstEligibleWeek: 5,   // don't generate stat-race items before week 5
      maxPerWeek:        2,   // cap at 2 stat-race items per simulated week
    },
    // Streak detection
    streak: {
      minLength: 3,    // at least this many consecutive W or L to generate an item
    },
    // Feed balancing per simulated week
    feedBalance: {
      maxRecapPerWeek:      1,
      maxMilestonesPerWeek: 3,
    },
  },
} as const;
