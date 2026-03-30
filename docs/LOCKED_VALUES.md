# LOCKED VALUES — Frozen Config

> These values are calibrated and must not be changed without explicit discussion.
> Last audited: 2026-03-29 — ENGINE LOCKED

**This document owns:** Every frozen numeric constant from `src/engine/config.ts` with its lock status and modification rules.

**See also:**
- [`ENGINE_STATE.md`](ENGINE_STATE.md) — validation baselines and accepted gaps
- [`TUNING_LOG.md`](TUNING_LOG.md) — why each value was set to its current number
- [`game-design.md`](game-design.md) — how ratings feed into the engine pipeline

---

## Pass Engine

```typescript
// src/engine/config.ts — TUNING.pass

baseSackChance:        0.062   // LOCKED — calibrated, do not reduce
minSackChance:         0.03
maxSackChance:         0.18
sackRatingScale:       0.002

coverageResistance:    1.50    // LOCKED — structural baseline; changing shifts all window distributions

shortAccuracyBase:     0.59
mediumAccuracyBase:    0.46
deepAccuracyBase:      0.25
accuracyRatingScale:   0.003
separationThrowScale:  0.45

catchingBase:          0.80
baseYACYards:          0.5     // LOCKED — do not change; part of explosive calibration
yacNetScale:           0.05

baseIntChance:         0.047
minIntChance:          0.02
maxIntChance:          0.115
intCoverageScale:      0.001
intThrowQualityScale:  0.08
intPressureScale:      0.07

ballSkillsBreakupChance: 0.15
ballSkillsRatingScale:   0.003
ballSkillsIntScale:      0.0008
sizeAdvantageScale:      0.001

// Window state thresholds
openThreshold:       0.60      // LOCKED — shifting any threshold recalibrates all window distributions
softOpenThreshold:   0.48
tightThreshold:      0.35
contestedThreshold:  0.22

// Window success modifiers
openSuccessMod:       0.04
softOpenSuccessMod:   0.02
tightSuccessMod:      0.00
contestedSuccessMod: -0.06
coveredSuccessMod:   -0.14

// INT modifiers per window
openIntMod:          -0.015
softOpenIntMod:      -0.005
tightIntMod:          0.000
contestedIntMod:      0.025
coveredIntMod:        0.055
```

---

## Run Engine

```typescript
// src/engine/config.ts — TUNING.run

blockingBase:              0.55
defRunDefenseResistance:   0.90   // CALIBRATED (was dead code at 0.40); wired 2026-03-27

tflChance:       0.32             // CALIBRATED (was 0.25)
tflTypicalMin:  -2
tflTypicalMax:  -1
tflBigChance:    0.15
tflBigMin:      -5
tflBigMax:      -3

baseFumbleChance: 0.022           // CALIBRATED (was 0.013)

// Yards on success — two-tier distribution (LOCKED shape)
insideRunMin:      3
insideRunMax:      7
outsideRunMin:     4
outsideRunMax:     9
insideLongChance:  0.18
insideLongMin:     8
insideLongMax:    15
outsideLongChance: 0.22
outsideLongMin:    9
outsideLongMax:   16

// Breakaway (LOCKED — explosive system)
breakawaySpeedThreshold: 70
insideBreakawayChance:   0.04
outsideBreakawayChance:  0.16
breakawayBonusMin:        8
breakawayBonusMax:       28
```

---

## Pass Yards by Depth

```typescript
// src/engine/config.ts — TUNING.passYards

shortMin:   4
shortMax:   8
mediumMin:  7    // CALIBRATED (was 8 → 6 → 7)
mediumMax:  9    // CALIBRATED (was 10 → 8 → 9)

// Bomb system (LOCKED — explosive system)
mediumBombChance: 0.06
mediumBombMin:    22
mediumBombMax:    46
deepBombChance:   0.18
deepBombMin:      30
deepBombMax:      65

// YAC breakaway (LOCKED — explosive system)
yacBreakawayBaseChance: 0.029
yacBreakawaySpeedScale: 0.0005
yacBreakawayMin:        20
yacBreakawayMax:        60
```

---

## Big Play / Explosive System

```typescript
// src/engine/config.ts — TUNING.bigPlay  (FULLY LOCKED)

speedThreshold: 82
burstChance:    0.19
burstBonusMin:  10
burstBonusMax:  34
breakawayUpgradeChancePass: 0.030
breakawayUpgradeChanceRun:  0.015
breakawayUpgradeMin:        20
breakawayUpgradeMax:        36
```

---

## Long Yardage (3rd-down Penalties)

```typescript
// src/engine/config.ts — TUNING.longYardage  (CALIBRATED)

d2LongThreshold:  8
d3MedThreshold:   5
d3LongThreshold:  8
d3VeryThreshold: 12

d2LongPenalty:   0.06   // unchanged
d3ShortPenalty:  0.03   // unchanged
d3MedPenalty:    0.02   // CALIBRATED (was 0.12 → 0.07 → 0.02)
d3LongPenalty:   0.07   // CALIBRATED (was 0.19 → 0.13 → 0.07)
d3VeryPenalty:   0.23   // unchanged
d3RunPenalty:    0.05   // unchanged
d3SackBonus:     0.018  // unchanged
```

---

## Field Goal

```typescript
// src/engine/config.ts — TUNING.fieldGoal  (CALIBRATED)

baseChance:       0.98
distancePenalty:  0.007   // CALIBRATED (was 0.009)
kickPowerBonus:   0.004
minChance:        0.25
attemptYardLine:  67
```

---

## Game Structure

```typescript
// src/engine/config.ts — TUNING.game

offenseAdvantage: 0.065   // LOCKED — calibrated 2026-03-27; 0.070 considered and rejected
                          // (would push pass yards and completion% above ceiling)

// Red zone (LOCKED FLOOR — documented in config)
passSuccessPenalty: 0.03
rushSuccessPenalty: 0.02
sackBonus:          0.01
```

---

## Target Distribution (Personnel)

```typescript
// src/engine/config.ts — TUNING.personnel  (LOCKED)

targetWeightExponent: 0.80   // LOCKED — flattens skill-rating curve; was 0.90
targetWeightNoise:    0.10   // LOCKED — play-to-play variety; was 0.075

roleMult: {
  featured_route:  { short: 1.10, medium: 1.10, deep: 1.20 },  // LOCKED — was 1.15/1.25/1.50
  secondary_route: { short: 1.00, medium: 1.10, deep: 1.20 },  // LOCKED
  slot:            { short: 1.10, medium: 1.00, deep: 0.50 },  // LOCKED
  inline_option:   { short: 0.85, medium: 0.90, deep: 0.40 },  // LOCKED — was 0.80/0.70/0.25
  seam_route:      { short: 0.90, medium: 1.00, deep: 0.70 },  // LOCKED
  check_down:      { short: 1.00, medium: 0.65, deep: 0.10 },  // LOCKED — was 0.90/0.50/0.10
}
// Achieved: WR1 share 25.5% ✓, WR leader 1,891 ✓, TE leader 957 ✓
```

---

## PAT / 2-Point Conversion

```typescript
// src/engine/config.ts — TUNING.pat

xpBaseChance:       0.94    // NFL XP success rate
xpKickerBonus:      0.002   // per point of kickAccuracy above 70
twoPtBaseChance:    0.48    // NFL 2PT success rate
twoPtOffBonus:      0.003   // per point of QB overall above 70
goFor2LateQtr:      4       // Q4 only
goFor2LateDiff:     5       // trailing by ≤5 late
```

---

## Talent Gap Compression

```typescript
// src/engine/config.ts — TUNING.talentCompression

factor:             0.80    // CALIBRATED — a 40-pt rating gap becomes 32
```

---

## Trailing Team Boost

```typescript
// src/engine/config.ts — TUNING.trailingBoost

bigLeadDiff:        21      // trailing by 21+ at any time
bigLeadBonus:       0.10    // strong success boost (prevent defense)
lateGameDiff:       14      // trailing by 14+ in Q4 late
lateGameSeconds:    300     // Q4 with <5 minutes left
lateGameBonus:      0.08    // late-game trailing boost
```

---

## Special Teams

```typescript
// src/engine/config.ts — TUNING.specialTeams

kickReturnTDChance:    0.012   // ~1.2% of kick returns are TDs
puntReturnTDChance:    0.008   // ~0.8% of punt returns
blockedFGChance:       0.015   // ~1.5% of FG attempts blocked
blockedPuntChance:     0.008   // ~0.8% of punts blocked
blockedReturnTDChance: 0.30    // 30% of blocks returned for TD
```

---

## Turnover Returns

```typescript
// src/engine/config.ts — TUNING.turnoverReturn

pickSixChance:         0.12    // ~12% of INTs returned for TD
fumbleReturnTDChance:  0.08    // ~8% of fumble recoveries returned
```

---

## Safety

```typescript
// src/engine/config.ts — TUNING.safety

yardLineThreshold:   1       // CHANGED 2026-03-29: was 5 — only behind 1-yard line triggers safety
sackSafetyChance:    0.40    // 40% of sacks inside threshold
runSafetyChance:     0.25    // 25% of TFL runs inside threshold
```

---

## Overtime

```typescript
// src/engine/config.ts — TUNING.overtime — ADDED 2026-03-29

secondsPerPeriod:    600     // 10 minutes per OT period
maxPlaysPerPeriod:   40      // safety cap per OT period
// Regular season: 1 OT period max (can still tie)
// Postseason: unlimited OT periods (no ties)
// NFL modified sudden death rules apply
```

---

## Penalties

```typescript
// src/engine/config.ts — TUNING.penalties
// Accept/decline system added 2026-03-29: opposing team decides
// whether to accept or decline based on play result comparison.

// Defensive penalties (help offense)
dpiChance:              0.045   // pass interference
dpiYardsMin:            12
dpiYardsMax:            35
dpiDisciplineScale:     0.0005
defHoldingChance:       0.035
defHoldingYards:        5
roughingChance:         0.012
roughingYards:          15
offsidesChance:         0.020
offsidesYards:          5

// Offensive penalties (hurt offense)
holdingChance:          0.020
holdingYards:           10
holdingDisciplineScale: 0.0003
falseStartChance:       0.010
falseStartYards:        5
falseStartDisciplineScale: 0.0003
```

---

## Two-Minute Drill

```typescript
// src/engine/config.ts — TUNING.twoMinuteDrill

timeoutsPerHalf:     3
timeoutClockSave:    35
spikeClockCost:      3
hurryUpReduction:   -15
passBoost:          0.20
hurryUpCompBonus:   0.03
```

---

## Clock Model

```typescript
// src/engine/config.ts — TUNING.clock

secondsPerQuarter: 900
maxPlaysPerQuarter: 55

runoff.incompleteMin:  8   runoff.incompleteMax: 14
runoff.sidelineMin:   10   runoff.sidelineMax:  16
runoff.completeMin:   30   runoff.completeMax:  40
runoff.runMin:        32   runoff.runMax:       42
runoff.tdMin:         45   runoff.tdMax:        55
runoff.fgMin:         30   runoff.fgMax:        40
runoff.puntMin:       25   runoff.puntMax:      35

sidelinePassChance: 0.31

tempoModifier.normal:      0
tempoModifier.hurry_up:  -12
tempoModifier.clock_kill: +10
```

---

## Updated Core Values (Post-Lock Retuning)

These core values were adjusted during the post-lock mechanics additions:

```typescript
offenseAdvantage:         0.115   // was 0.065 — raised for ~44-46 PPG with new mechanics
baseSackChance:           0.050   // was 0.062 — reduced
blockingBase:             0.52    // was 0.55 — tightened
defRunDefenseResistance:  1.00    // was 0.90 — full defensive value
shortAccuracyBase:        0.52    // was 0.59 — reduced
mediumAccuracyBase:       0.42    // was 0.46 — reduced
deepAccuracyBase:         0.22    // was 0.25 — reduced
coverageResistance:       1.60    // was 1.50 — increased
contestedSuccessMod:     -0.09    // was -0.06
coveredSuccessMod:       -0.20    // was -0.14
insideRunMin: 2  insideRunMax: 6  // was 3-7
outsideRunMin: 3 outsideRunMax: 8 // was 4-9
passSuccessPenalty (RZ):  0.02    // was 0.03
attemptYardLine (FG):     58      // was 67
```

---

## Rules for Modifying This File

1. Every change to a value here must be logged in `TUNING_LOG.md` first.
2. Locked values (marked LOCKED) require explicit user confirmation before changing.
3. Calibrated values (marked CALIBRATED) can be adjusted but must be validated
   against `scripts/nfl-compare.ts` at N ≥ 1000 games before committing.
4. Never change more than 2–3 values in a single validation pass.
