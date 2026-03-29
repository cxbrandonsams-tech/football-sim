# LOCKED VALUES — Frozen Config

> These values are calibrated and must not be changed without explicit discussion.
> Last audited: 2026-03-27 — ENGINE LOCKED

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

## Rules for Modifying This File

1. Every change to a value here must be logged in `TUNING_LOG.md` first.
2. Locked values (marked LOCKED) require explicit user confirmation before changing.
3. Calibrated values (marked CALIBRATED) can be adjusted but must be validated
   against `scripts/nfl-compare.ts` at N ≥ 1000 games before committing.
4. Never change more than 2–3 values in a single validation pass.
