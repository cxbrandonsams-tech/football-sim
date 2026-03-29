# Engine Tuning Design — NFL Stat Alignment

**Date**: 2026-03-29
**Status**: Approved

## Problem

Three structural gaps remain after config tuning:
1. PPG too low (37 vs NFL 46) — not enough TDs, no PAT variance
2. Too many shutouts (14 vs NFL 1-2) — weak teams can't sustain drives
3. Completion % too high (70% vs NFL 65%) — coverage doesn't suppress enough

## Changes

### 1. PAT/2PT Conversion System
- After every TD, simulate extra point or 2-point conversion
- XP: ~94% success, affected by kicker accuracy
- 2PT: ~48% success, short-yardage pass/run play
- AI logic: go for 2 when trailing by 2, 5, or late-game desperation
- TDs score 6 + conversion (6, 7, or 8 points)

### 2. Talent Gap Compression
- All offensive vs defensive rating comparisons compressed by 0.75×
- A 40-point talent gap becomes effectively 30
- Applied at comparison level, not to raw ratings

### 3. Trailing Team Boost (Prevent Defense)
- Trailing by 21+ at any time: +0.04 success probability
- Trailing by 14+ in Q4 with <5 min left: +0.04 success probability
- Small — prevents shutouts without making bad teams competitive

### 4. Coverage Resistance Increase
- coverageResistance: 1.50 → 1.70
- DBs suppress WR separation more aggressively

### 5. Contested/Covered Window Penalties
- contestedSuccessMod: -0.06 → -0.09
- coveredSuccessMod: -0.14 → -0.20

## Expected Outcomes
| Stat | Current | Target | NFL |
|---|---|---|---|
| PPG | 37 | 43-46 | 46 |
| Shutouts | 14 | 1-3 | 1-2 |
| Comp% | 70% | 64-66% | 65% |
| Margin | 12 | 11-12 | 11 |
