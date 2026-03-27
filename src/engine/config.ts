/**
 * Centralized simulation tuning constants.
 * All "magic numbers" live here — never scatter them through engine files.
 */
export const TUNING = {
  // ── Pass engine ───────────────────────────────────────────────────────────
  pass: {
    // Protection phase
    baseSackChance:        0.062,   // calibrated, do not reduce
    minSackChance:         0.03,
    maxSackChance:         0.18,
    sackRatingScale:       0.002,   // per point of (passRush − passBlocking)

    // Separation phase (coverage suppresses separation; does NOT gate completion)
    separationRouteWeight: 0.60,    // routeRunning contribution
    separationSpeedWeight: 0.40,
    // coverageResistance: multiplier on defScore in the ratio denominator.
    // At 1.00, denominator was 50+50+1=101 at avg → baseline separation 0.495 (too high).
    // At 1.50, denominator is 50+75+1=126 → baseline separation 0.397 (defense slight edge).
    // Higher value → defense has a structural positional advantage; WR must earn separation.
    // The PA bonus then provides a slight offense lift over this coverage-biased floor.
    coverageResistance:    1.50,    // how much coverage suppresses separation

    // Decision phase
    processingReadlineScalar: 0.01, // per point above 50
    decisionPenaltyScale:  0.005,   // per point of pressure on poor decision-makers

    // Throw phase — accuracy by depth.
    // Recalibrated for coverageResistance=1.50 and playAction.medium=0.02.
    // At avg ratings (50), separation=0.417 → throwQ separation contribution=0.188.
    // Bases raised vs previous to keep baseline success rates identical.
    //   (higher base compensates for the lower separation contribution at the new resistance)
    shortAccuracyBase:     0.59,    // short  target: ~76% success at avg
    mediumAccuracyBase:    0.46,    // medium target: ~63% success at avg
    deepAccuracyBase:      0.25,    // deep   target: ~42% success at avg
    // Reduced from 0.004 → 0.003 so QB accuracy is still the dominant driver but
    // not so large (~6.75pp 50→80) that WR/CB matchups feel irrelevant.
    accuracyRatingScale:   0.003,   // per point above/below 70
    // Weight of separation score inside resolveThrowQuality.
    // Raised from 0.07 → 0.45 so a 30-pt rating swing (~0.07 separation delta)
    // produces ~3pp pass-success impact instead of 0.4pp.
    separationThrowScale:  0.45,    // per unit of separationScore (0-1)

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
    // baseYACYards: every completion earns this many yards after catch at neutral ratings.
    // At 50 vs 50, yacNet = 0, so without a baseline every completion produces exactly
    // route distance with no after-catch gain. 2 yards reflects realistic average YAC.
    // Rating differences then modify this baseline: elite YAC + poor tackling → more;
    // average YAC + elite tackling → less (floors at 0 via Math.max).
    baseYACYards:          0.5,     // yards after catch at neutral ratings; differential from WR YAC vs def tackling shifts up/down
    yacNetScale:           0.05,    // per point of net WR YAC advantage above/below neutral

    // Interception (on incompletions only)
    baseIntChance:         0.047,
    minIntChance:          0.02,
    maxIntChance:          0.115,
    intCoverageScale:      0.001,   // per point (coverage − decisionMaking)
    // Low throw quality increases INT chance — wild/inaccurate balls are easier to pick
    intThrowQualityScale:  0.08,    // per unit (0.5 - throwQuality) above 0
    // Pressure increases INT chance — QB rushing his reads throws riskier balls
    intPressureScale:      0.07,    // per unit of pressureLevel (0-1)

    // GDD: QB Mobility affects sacks/scramble only
    mobilityReductionScale:    0.0015, // per point of mobility above 50, reduces sack chance
    // Scramble — independent of the sack window.
    // QBs scramble based on two factors: inherent opportunism (even from a clean pocket,
    // a mobile QB will take off if nothing is open) and pressure (defense closing in).
    // scrambleChance = (baseOpportunity + pressureLevel * pressureScale) * (mobility / 100)
    // At avg (mobility=50, pressure=0): (0.04 + 0) * 0.5 = 2.0% per dropback — rare but possible.
    // At mobile (mobility=85, pressure=0.5): (0.04 + 0.03) * 0.85 = 5.95% per dropback.
    scrambleBaseOpportunity:   0.04,   // base scramble rate per dropback (before mobility/pressure)
    scramblePressureScale:     0.06,   // additional scramble probability per unit of pressureLevel
    scrambleYardsMin:          2,
    scrambleYardsMax:          10,

    // Play action deception bonus to separation
    playActionDeceptionBase:       0.08,
    playActionRunThreatBonus:      0.04,  // extra if team has credible run game
    playActionRunThreatThreshold:  70,    // RB power+vision avg needed for bonus

    // ── Window states ────────────────────────────────────────────────────────
    // After resolveSeparation(), the 0-1 score maps into a discrete football
    // window state. Thresholds are calibrated so that average-rated matchups
    // (separation ≈ 0.40) land in 'tight', preserving existing baseline rates.
    window: {
      // Separation → window state thresholds (upper bound, exclusive)
      // open ≥ 0.60 | soft_open ≥ 0.48 | tight ≥ 0.35 | contested ≥ 0.22 | covered < 0.22
      openThreshold:       0.60,
      softOpenThreshold:   0.48,
      tightThreshold:      0.35,
      contestedThreshold:  0.22,

      // Success probability modifiers per window state.
      // Centered on 'tight' = 0 so average-rating games remain calibrated.
      openSuccessMod:       0.04,
      softOpenSuccessMod:   0.02,
      tightSuccessMod:      0.00,
      contestedSuccessMod: -0.06,
      coveredSuccessMod:   -0.14,

      // INT chance modifiers per window state (applied inside the INT formula)
      openIntMod:          -0.015,
      softOpenIntMod:      -0.005,
      tightIntMod:          0.000,
      contestedIntMod:      0.025,
      coveredIntMod:        0.055,

      // Contested window: WR hands vs CB ballSkills decides the catch
      contestedBallSkillsScale: 0.004, // per point net advantage (WR hands − CB ballSkills)

      // Soft-open window: receiver has space after the catch
      softOpenYACBonus:     1,       // flat extra YAC yards when window is soft_open

      // QB throwaway on covered windows: smart QBs avoid forcing it.
      // No base chance — only QBs above the DM threshold can throw away.
      // DM=50 (avg): 0% throwaway. DM=65: 5% chance. DM=80: 20% chance.
      throwawayDMThreshold:     50,   // DM above this unlocks throwaway ability
      throwawayBaseChance:      0.00, // no base — threshold-gated entirely by DM scale
      throwawayDMScale:         0.013,// per DM point above threshold (80→0.39, 65→0.20, 50→0)
      throwawayPressurePenalty: 0.15, // pressure makes throwing away harder (sack or throw)

      // Bad QB INT amplifier on risky windows (tight/contested/covered)
      badDMIntScale: 0.0015,          // per point decisionMaking below 50
    },
  },

  // ── Run engine ────────────────────────────────────────────────────────────
  run: {
    // Blocking phase
    blockingBase:               0.55,
    defRunDefenseResistance:    0.90,   // was 0.40 (dead code); now wired into ratio formula. <1.0 = slight offense lean; >1.0 = defense amplified

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
    breakawaySpeedThreshold: 70,   // separate from bigPlay.speedThreshold (passes); allows starter/elite RBs to burst
    breakawayBonusMin:       8,    // was 5  — bigger minimum on breakaways
    breakawayBonusMax:       28,   // was 15 — allows 12-44 yd outside runs
    // GDD: Inside = lower breakaway chance, Outside = higher breakaway chance
    // Replaces the single breakawayChance for run plays (passes still use bigPlay.burstChance)
    insideBreakawayChance:   0.04,   // lower — inside runs are congested
    outsideBreakawayChance:  0.16,   // higher — outside runs reach open field

    // GDD: TE acts as hybrid blocker — contributes to run blocking
    teBlockingWeight:        0.20,   // TE contributes 20% of run blocking composite

    // Tackles for loss (TFL) — applied to failed run plays only
    // At avg ratings (success ≈ 55%), ~12 failed runs/team/game.
    // tflChance: 0.25 → ~4 TFLs/team/game.
    tflChance:       0.32,   // fraction of failed runs that become TFLs (was 0.25)
    tflTypicalMin:  -2,      // typical TFL (stuffed at the line, -1 to -2 yd)
    tflTypicalMax:  -1,
    tflBigChance:    0.15,   // fraction of TFLs that are big losses (-3 to -5)
    tflBigMin:      -5,
    tflBigMax:      -3,

    // Fumble
    baseFumbleChance:        0.022,
    ballSecurityFumbleReduction: 0.0003, // per point of ballSecurity above 50

    // Yards on success — two-tier distribution (2026-03 reshape)
    // Short tier (most carries): max ≤ 9 keeps this entirely below the 10+ bucket.
    // Breakthrough tier (minority): RB gets into the second level for a moderate gain.
    // Burst (+8–28 via speed) and the upgrade layer (breakawayUpgradeChanceRun) handle 20+.
    insideRunMin:      3,    // short tier
    insideRunMax:      7,    // short tier  (was 12 — capped to keep base below 10-yard tier)
    outsideRunMin:     4,    // short tier
    outsideRunMax:     9,    // short tier  (was 16 — capped to keep base below 10-yard tier)
    // Breakthrough tier — fires with this probability on successful inside / outside carries
    insideLongChance:  0.18, // 18% of inside successes reach the second level
    insideLongMin:     8,    //   range: 8–15 yards (all in 10–19 bucket)
    insideLongMax:    15,
    outsideLongChance: 0.22, // 22% of outside successes reach the second level
    outsideLongMin:    9,    //   range: 9–16 yards (9-yd just outside short tier)
    outsideLongMax:   16,

    // Yards on failure (even failed runs typically gain a yard or two)
    failYardsMin: -1,
    failYardsMax:  2,
  },

  // ── Pass yards by depth ───────────────────────────────────────────────────
  // Normal ranges give calibrated per-depth averages. Bomb mechanisms and the
  // YAC breakaway system add a fat tail without altering baseline efficiency.
  passYards: {
    shortMin:   4,
    shortMax:   8,
    mediumMin:  7,
    mediumMax:  9,
    // Medium bomb: 6% of medium completions travel 22–46 yards.
    mediumBombChance: 0.06,
    mediumBombMin:    22,
    mediumBombMax:    46,
    deepMin:   10,
    deepMax:   12,
    // Long bomb: 18% of deep catches travel 30-65 yards.
    deepBombChance: 0.18,
    deepBombMin:    30,
    deepBombMax:    65,
    // Short-pass / medium-pass YAC breakaway: receiver beats pursuit into open field.
    // Applies AFTER bomb checks; adds explosive variance without altering base distributions.
    // Chance scales with receiver speed — faster WRs break more tackles in space.
    // Average receiver (speed 65): ~2.9%.  Elite (speed 85): ~3.9%.
    yacBreakawayBaseChance: 0.029,   // base chance for all short/medium completions
    yacBreakawaySpeedScale: 0.0005,  // per point of receiver speed above 50
    yacBreakawayMin:        20,      // minimum yards on a breakaway
    yacBreakawayMax:        60,      // maximum yards — occasional score from midfield
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
    // Applied on every pass play as a scheme-level modifier (teams that use PA frequently
    // keep defenses more honest). Reduced from 0.04/0.08 — values were too large given
    // they apply to all pass plays, not just designated PA snaps.
    playAction: {
      low:    0,
      medium: 0.02,   // slight scheme-level PA threat bonus
      high:   0.04,   // meaningful PA-heavy scheme advantage
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
        dist1:    0.62,  // 4th and 1
        dist2:    0.40,  // 4th and 2
        dist3:    0.20,  // 4th and 3
        dist5:    0.12,  // 4th and 4-5
        distLong: 0.04,  // 4th and 6+
      },
      goalLineBump:          0.22,  // extra chance when inside opponent's 10
      personalityMultiplier: {
        conservative: 0.50,
        balanced:     1.00,
        aggressive:   1.70,
      } as Record<string, number>,

      // Situational adjustments (additive, Q4 score-based; scaled by aggressiveness)
      trailingBigBoost:    0.18,  // trailing 2+ scores (≥14) in Q4
      trailingSmallBoost:  0.08,  // trailing 1 score (7–13) in Q4
      leadingBigCut:       0.12,  // leading 2+ scores (≥14)
      ownHalfCut:          0.10,  // own side of field, unscaled
      trailBigDiff:        14,
      trailSmallDiff:       7,
      leadBigDiff:         14,
      desperateFGSecondsLeft: 150,  // Q4 clock threshold for desperation FG (~2.5 min)
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
    distancePenalty:     0.007,  // per yard beyond 20
    kickPowerBonus:      0.004,  // per point of kickPower above 70
    minChance:           0.25,
    attemptYardLine:     67,     // attempt FG at or beyond this yard line on 4th
                                 // = opponent's 33 yard line ≈ 50-yard FG  (was 70/47 yds, +3 yd range)
    desperationYardLine: 59,     // trailing 2+ scores Q4 late: attempt from opponent's 41 ≈ 58-yard FG  (was 62)
  },

  // ── Punt ──────────────────────────────────────────────────────────────────
  punt: {
    minYards:          35,
    maxYards:          52,
    /** Starting yardLine for the receiving team when the ball is kicked into the end zone. */
    touchbackYardLine: 20,
  },

  // ── Kickoff return (pre-2011 / Hester-era model) ──────────────────────────
  // Touchbacks spot at the 20 (pre-2011 rule). High return rate, more variance.
  kickoffReturn: {
    touchbackRate:      0.22,   // 22% touchbacks (target 20–30%)
    touchbackYardLine:  20,     // pre-2011 rule: own 20
    catchYardLine:       5,     // returner catches near own 5
    returnBaseMin:      12,
    returnBaseMax:      30,     // avg base 21 yds → drive at own ~26
    returnerBonusScale: 0.20,   // (krScore − 50) × 0.20
    returnerBonusCap:    8,     // ±8 yard cap
    bigReturnChance:    0.04,   // 4% of returns are explosive (40–70 yds)
    bigReturnMin:       40,
    bigReturnMax:       70,
  },

  // ── Punt return ────────────────────────────────────────────────────────────
  puntReturn: {
    fairCatchRate:      0.45,   // 45% fair catch / dead ball (target 40–50%)
    returnBaseMin:       4,
    returnBaseMax:      16,     // avg base 10 yds (target 8–10)
    returnerBonusScale: 0.12,   // (prScore − 50) × 0.12
    returnerBonusCap:    6,     // ±6 yard cap
    bigReturnChance:    0.04,   // 4% of returns are 20+ yds
    bigReturnMin:       20,
    bigReturnMax:       42,
  },

  // ── Returner composite weights ─────────────────────────────────────────────
  returner: {
    krSpeedWeight:       0.65,   // KR: speed + elusiveness (RB) or speed + yac (WR)
    krElusivenessWeight: 0.35,
    prSpeedWeight:       0.65,   // PR: speed + hands + yac (WR only)
    prHandsWeight:       0.20,
    prYacWeight:         0.15,
  },

  // ── Big-play burst ────────────────────────────────────────────────────────
  // Reduced frequency but much bigger range — creates meaningful 20-40 yd gains
  // instead of frequent minor additions. Net expected yards per burst-eligible
  // play is roughly neutral vs previous (0.10*19 ≈ 0.17*8.5).
  bigPlay: {
    speedThreshold: 82,
    burstChance:    0.19,   // was 0.14 — raised to create more burst-driven 20+ plays
    burstBonusMin:  10,     // unchanged
    burstBonusMax:  34,     // was 28 — larger ceiling for elite speed merchants
    // Breakaway upgrade layer: independent post-resolution chance to convert a normal
    // gain into a chunk play. Only fires if yards < 20 (naturally excludes bomb/YAC/burst
    // outcomes which already produce 20+ yards). Applies to runs, short, medium passes.
    // Deep passes excluded — they already carry an 18% bomb probability.
    breakawayUpgradeChancePass: 0.030,  // short/medium passes
    breakawayUpgradeChanceRun:  0.015,  // runs — lower to avoid scoring inflation
    breakawayUpgradeMin:        20,
    breakawayUpgradeMax:        36,
  },

  // ── Game structure ────────────────────────────────────────────────────────
  game: {
    playsPerQuarter: 36,
    /**
     * Global offense success-probability bonus.
     * Reflects the offense's inherent play-calling advantage (they know the
     * snap count and route assignments; the defense must react).
     * Kept small — the separation + throw quality phases already model the
     * structural advantage; this is just a small residual edge.
     * Set to 0 to restore perfect parity; raise to give offense more edge.
     */
    offenseAdvantage: 0.065,   // was 0.055; bumped for scoring recovery (run system tightened)
  },

  // ── Clock model ───────────────────────────────────────────────────────────
  // Primary quarter-ender: clockSeconds <= 0.
  // Safety fallback: quarterPlays >= maxPlaysPerQuarter prevents infinite loops.
  clock: {
    secondsPerQuarter: 900,
    maxPlaysPerQuarter: 55,   // safety cap — quarter always ends even if clock logic fails

    // Clock runoff ranges (min, max seconds); randomized each play for realism
    runoff: {
      incompleteMin:  6,  incompleteMax: 10,   // incomplete pass — clock stops
      sidelineMin:    8,  sidelineMax:   12,   // completed but out-of-bounds proxy
      completeMin:   27,  completeMax:   36,   // completion in bounds  (was 28/38, −5% for A1)
      runMin:        29,  runMax:        40,   // run play or sack or scramble  (was 30/42, −5% for A1)
      tdMin:         20,  tdMax:         22,   // scoring play — stops for PAT/kickoff
      fgMin:         18,  fgMax:         25,   // field goal attempt
      puntMin:       12,  puntMax:       20,   // punt
    },

    // Probability a completed pass is treated as "sideline" (clock stops)
    sidelinePassChance: 0.31,

    // Tempo modifier: seconds per play added/removed (applied to non-stop-clock plays)
    tempoModifier: {
      normal:     0,
      hurry_up:  -12,
      clock_kill: +10,
    } as Record<string, number>,
  },

  // ── Situational playcalling ───────────────────────────────────────────────
  // All run% values are additive percentage-point deltas applied to the team's base runPct.
  // All depth values are additive pp shifts applied after the run/pass decision.
  // Clamp prevents any adjustment from overriding the base tendency entirely.
  situational: {
    // ── Score differential thresholds (offensive team's score − defensive) ──
    leadSmallDiff:  7,   // "holding a lead"
    leadLargeDiff: 14,   // "leading comfortably"
    trailSmallDiff: 7,   // "trailing" (use as abs value, applied when scoreDiff < −N)
    garbageDiff:   21,   // "garbage time" — winning team stops trying

    // ── Clock thresholds (clockSeconds remaining in current quarter) ─────────
    lateGameSeconds:   240,   // ~4 minutes left — urgency window
    twoMinuteSeconds:  120,   // ~2-minute drill

    // ── Field position ──────────────────────────────────────────────────────
    backedUpYardLine:    20,   // own territory, protect ball

    // ── Run% adjustments (pp) ────────────────────────────────────────────────
    backedUpRunBoost:     8,   // own territory: protect ball, force run
    leadSmallRunBoost:    5,   // leading by 7+ any time: slight run lean (mirrors trailRunCut)
    clockKillRunBoost:   20,   // Q4 late, leading by 7+: run the clock
    comfortLeadRunBoost: 10,   // leading by 14+ any time: lean on run game
    trailRunCut:         10,   // trailing by 7+: pass more
    urgentTrailRunCut:   20,   // Q4 late, trailing by 7+: urgent pass mode
    twoMinuteRunCut:     30,   // Q4 final plays, still behind: near pass-only
    garbageRunBoost:     15,   // blowout win late: run it out

    // ── Aggressiveness scale bounds ─────────────────────────────────────────
    // aggScale = 1 + ((aggressiveness - 50) / 100)
    // Applied to all score/clock run% and pass-depth adjustments only.
    // D&D nudges and backedUpRunBoost are not scaled.
    aggressivenessMin: 0.5,   // aggressiveness=0  → 0.5× adjustments
    aggressivenessMax: 1.5,   // aggressiveness=100 → 1.5× adjustments

    // ── Pass depth adjustments (pp shifts, renormalized after) ──────────────
    // 2-minute drill: quick short routes to stop the clock
    twoMinuteShortBoost:  25,
    twoMinuteDeepCut:     10,
    // Trailing urgently in Q4: more shots downfield
    urgentTrailShortCut:  10,
    urgentTrailMediumBoost: 5,
    urgentTrailDeepBoost: 10,
    // Clock-kill: if forced to pass, keep it short and safe
    clockKillShortBoost:  15,
    clockKillDeepCut:     10,
    // Garbage time: winner takes what's there
    garbageShortBoost:    10,
    garbageDeepCut:        5,
  },

  // ── Long-yardage conversion resistance ───────────────────────────────────
  // Negative additive penalty applied to pass success probability only,
  // when the offense is behind the sticks. Does not affect run plays or
  // yards-on-completion distributions — purely reduces completion rate in
  // specific down/distance buckets so drives stall more after negative plays.
  longYardage: {
    d2LongThreshold:  8,    // 2nd and 8+
    d3MedThreshold:   5,    // 3rd and 5–7
    d3LongThreshold:  8,    // 3rd and 8+
    d3VeryThreshold: 12,    // 3rd and 12+

    d2LongPenalty:   0.06,  // −6%  on 2nd and 8+
    d3ShortPenalty:  0.03,  // −3%  on 3rd and 1–4 passes
    d3MedPenalty:    0.02,  // −2% on 3rd and 5–7  (was 0.12 → 0.07 → 0.02)
    d3LongPenalty:   0.07,  // −7% on 3rd and 8–11 (was 0.19 → 0.13 → 0.07)
    d3VeryPenalty:   0.23,  // −23% on 3rd and 12+  (was 0.12)
    d3RunPenalty:    0.05,  // −5%  on any 3rd down run (defense keys up stops)
    d3SackBonus:     0.018, // +1.8% sack chance on any 3rd down pass
  },

  // ── Red zone modifiers ────────────────────────────────────────────────────
  // Applied in simulateGame when yardLine crosses the threshold.
  // Reflects tighter spacing, compressed routes, and prepared goal-line defenses.
  //
  // TUNING STATUS (locked): These values produce ~68–69% RZ TD%, which is slightly
  // above the NFL benchmark of 55–65%. This is the structural floor given the sim's
  // yardage distributions — pushing harder breaks overall scoring balance (~21 pts/game).
  // WATCH ITEM: Monitor RZ TD% across future validation runs. If playcalling, clock
  // management, or situational logic changes naturally pull it toward 60–65%, great.
  // Revisit only if it rises significantly (>72%) or causes gameplay weirdness.
  redZone: {
    yardLine:            80,    // start of red zone (opponent's 20)
    goalLineYardLine:    90,    // inside opponent's 10 — extra run difficulty
    passSuccessPenalty:  0.03,  // flat reduction to pass successProb inside red zone (locked floor)
    rushSuccessPenalty:  0.02,  // flat reduction to rush successProb inside goal line  (was 0.04, −5% relative RZ TD%)
    sackBonus:           0.01,  // extra sack probability inside red zone  (was 0.02, eased for scoring recovery)
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
  // ── Personnel packages ────────────────────────────────────────────────────
  // Controls on-field receiver pools and ratings-driven stat distribution.
  personnel: {
    // Package selection: cumulative fractions for [22, 21, 12, 11, 10] in that order.
    // Each situation's values must sum to 1.0.
    packages: {
      goalLine:     { pkg22: 0.60, pkg21: 0.18, pkg12: 0.18, pkg11: 0.04, pkg10: 0.00 },
      redZone:      { pkg22: 0.05, pkg21: 0.18, pkg12: 0.38, pkg11: 0.37, pkg10: 0.02 },
      shortYardage: { pkg22: 0.15, pkg21: 0.35, pkg12: 0.28, pkg11: 0.22, pkg10: 0.00 },
      twoMinute:    { pkg22: 0.00, pkg21: 0.00, pkg12: 0.05, pkg11: 0.35, pkg10: 0.60 },
      standard:     { pkg22: 0.01, pkg21: 0.08, pkg12: 0.24, pkg11: 0.59, pkg10: 0.08 },
    },

    // Target weight shaping (applied after role × rating computation)
    targetWeightExponent: 0.80,  // diminishing returns: weight^0.8 (was 0.90) — more aggressive flattening reduces WR1 concentration
    targetWeightNoise:    0.10,  // ±10% uniform noise (was 0.075) — more game-to-game variance in target distribution

    // Role opportunity multipliers by pass depth.
    // Controls how much positional role (WR1 vs WR2 vs slot vs TE vs RB) matters
    // relative to ratings in the target selection lottery.
    // Moved from hardcoded constant in simulateGame.ts — 2026-03-27.
    //
    // Key calibration goals:
    //   WR1 target share ~23–27%  (was 31% with old values)
    //   TE target share  ~15–20%  (was 15%, borderline)
    //   RB target share  ~10–15%  (was 10%, acceptable)
    roleMult: {
      featured_route:  { short: 1.10, medium: 1.10, deep: 1.20 },  // WR1 — was 1.15/1.25/1.50
      secondary_route: { short: 1.00, medium: 1.10, deep: 1.20 },  // WR2 — was 1.00/1.05/1.15
      slot:            { short: 1.10, medium: 1.00, deep: 0.50 },  // WR3 — was 1.05/0.90/0.50
      inline_option:   { short: 0.85, medium: 0.90, deep: 0.40 },  // TE (heavy sets) — was 0.80/0.70/0.25
      seam_route:      { short: 0.90, medium: 1.00, deep: 0.70 },  // TE (12/21 pkg) — unchanged
      check_down:      { short: 1.00, medium: 0.65, deep: 0.10 },  // RB — was 0.90/0.50/0.10
    },

    // Sack credit: weight = max(0, passRush − threshold); linear so elites dominate but backups contribute
    sackCreditThreshold: 40,
  },
} as const;
