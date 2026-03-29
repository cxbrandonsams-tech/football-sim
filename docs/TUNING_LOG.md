# TUNING LOG — Chronological History

> Format: date · change · reason · observed effect

**This document owns:** The chronological record of every calibration change, why it was made, and what effect it had.

**See also:**
- [`LOCKED_VALUES.md`](LOCKED_VALUES.md) — current frozen values
- [`ENGINE_STATE.md`](ENGINE_STATE.md) — final validation snapshot

---

## Phase 1–5 (pre-2026-03 sessions)

- Position-specific player ratings, coaching staff, config scaffolding established.
- Run distribution reshaped (two-tier: short gains + breakthrough tier).
- Explosive play system added (bigPlay burst + breakaway upgrade layer).
- Sack/TFL system calibrated.
- Personnel/target distribution system added.
- Leaderboard attribution fixed (QB yards credited to correct player).

---

## 2026-03 Recalibration Session

### Fix A — Fumbles too low
- `baseFumbleChance: 0.013 → 0.022`
- Result: fumbles/team 0.30 → 0.50 ✓

### Fix B — FG make% too low
- `distancePenalty: 0.009 → 0.007`
- Result: FG make% 81.3% → 84.4% ✓ (now 84.1% at final validation)

### Fix C — 3rd-down conversion (phase 1)
- `d3LongPenalty: 0.19 → 0.13`
- Result: small improvement; also pushed pass yards to 258.9 (above 255 ceiling)
- Required paired offset → medium pass range cut

### Fix D — Pass yard inflation offset (phase 1)
- `mediumMin: 8 → 7`, `mediumMax: 10 → 9` (avg medium gain 9 → 8 yards)
- Result: pass yards 258.9 → 249.4 ✓
- Side effect: scoring regressed ~1 pt/team (medium plays now shorter)

### Fix E — 3rd-down (phase 2, d3Med)
- `d3MedPenalty: 0.12 → 0.07`
- Result: ~0.1pp improvement (negligible — d3Med has very low leverage)
- Root cause analysis: ~50% run rate on 3rd-and-medium; penalty only hits pass plays

### Fix F — Run blocking variance (structural fix)
- `defRunDefenseResistance: 0.40 → 0.90` (parameter was dead code; wired into ratio formula)
  Formula in simulateGame.ts: `baseProb = oRating / (oRating + dRating * defRunDefenseResistance)`
  At 0.90: defense contributes 90% of rated value (slight offense lean preserved)
- `tflChance: 0.25 → 0.32`
- Result: YPC 4.77→4.41 ✓, TFLs/team 3.0→5.4 ✓, 3rd-down partially recovered
- Tradeoff: run game tighter, reducing drive sustain → scoring structural gap

  > Note: value 0.75 was tried first (wrong direction — weakened defense, raised YPC to 4.77).
  > Corrected to 0.90 which dampens defense by 10% while keeping offense slight edge.

### Fix G — 3rd-down + scoring recovery (Pair C)
- `d3MedPenalty: 0.07 → 0.02`
- `d3LongPenalty: 0.13 → 0.07`
- `mediumMin: 7 → 6`, `mediumMax: 9 → 8` (avg medium 8 → 7 yards)
- Result: 3rd-down improved 37.5% → 38.4%, but scoring regressed 20.3 → 20.0
- Lesson: medium range cut always hurts scoring more than d3 improvements help

### Fix H — Medium range partial revert
- `mediumMin: 6 → 7`, `mediumMax: 8 → 9` (restored to post-Fix D values)
- Result: scoring 20.0 → 20.4, 3rd-down 38.6%, QB leader 6,091 → 5,220 ✓

### Fix I — Global scoring lever
- `offenseAdvantage: 0.055 → 0.065`
- Result: pts/team 20.4 → 21.4, 3rd-down 38.6% → 39.5% ✓, pass yards 248.8 → 255.1
- Decision: locked at 0.065. Increasing further to 0.070 would risk pushing completion%
  and pass yards above ceiling. The 0.6 pt/team gap below floor is accepted as structural.

### Fix J — Target distribution (receiving leaderboard fix)
- Moved ROLE_MULT from hardcoded constant in simulateGame.ts to `TUNING.personnel.roleMult` in config.ts
- Reduced featured_route multipliers: `{ short: 1.15→1.10, medium: 1.25→1.10, deep: 1.50→1.20 }`
- Increased check_down short: `0.90→1.00`
- Increased inline_option: `{ short: 0.80→0.85, medium: 0.70→0.90 }`
- `targetWeightExponent: 0.90 → 0.80` (flattens skill-rating curve)
- `targetWeightNoise: 0.075 → 0.10` (more play-to-play variety)
- Result: WR leader 2,212 → 1,891 ✓, TE leader meaningful (957 yds), WR1 share 31% → 25.5% ✓

---

## Final Config Deltas vs Original Baseline

| Parameter | Original | Final (Locked) |
|---|---|---|
| `baseFumbleChance` | 0.013 | **0.022** |
| `distancePenalty` (FG) | 0.009 | **0.007** |
| `d3MedPenalty` | 0.12 | **0.02** |
| `d3LongPenalty` | 0.19 | **0.07** |
| `mediumMin` | 8 | **7** |
| `mediumMax` | 10 | **9** |
| `defRunDefenseResistance` | 0.40 (dead) | **0.90 (live)** |
| `tflChance` | 0.25 | **0.32** |
| `offenseAdvantage` | 0.055 | **0.065** |
| `targetWeightExponent` | 0.90 | **0.80** |
| `targetWeightNoise` | 0.075 | **0.10** |
| `TUNING.personnel.roleMult` | hardcoded | **in config** |

**ENGINE LOCKED 2026-03-27. No further play-resolution changes.**

---

## 2026-03-28 — Post-Lock Mechanics Additions

After the core engine lock, new NFL mechanics were layered on top of the locked play-resolution pipeline. These do not modify pass/run completion formulas — they add new scoring paths and game management systems.

### Phase K — Penalty System
- Added 6 penalty types: DPI, defensive holding, roughing, offsides, offensive holding, false start
- `discipline` rating added to OL, CB, LB, Safety positions — modulates penalty frequency
- Defensive penalties extend drives (auto first downs); offensive penalties negate plays
- Net effect: ~12-13 penalties/game (NFL avg 12.5)

### Phase L — PAT / 2-Point Conversion
- After every TD, `resolveConversion()` replaces flat +7 scoring
- XP: 94% base success, 2PT: 48% base success
- AI goes for 2 when trailing by specific amounts in Q4
- Net effect: ~6.6 pts per TD instead of 7.0

### Phase M — Talent Compression + Trailing Boost
- `compress(diff)` at factor 0.80 — reduces rating gaps (40→32 pts)
- Applied to sack chance and run success probability
- Trailing by 21+: +0.10 offense success bonus (prevent defense)
- Trailing by 14+ in Q4 late: +0.08 bonus
- **Result:** Shutouts reduced from 12/season to ~2/season

### Phase N — Special Teams Scoring
- Kick return TDs (1.2%), punt return TDs (0.8%)
- Blocked FGs (1.5%) and blocked punts (0.8%) with 30% return TD chance
- Pick-six: 12% of interceptions returned for TD
- Fumble return TDs: 8% of fumble recoveries
- **Result:** +1-2 pts/game from non-drive scoring

### Phase O — Safety
- Fires when offense is sacked or TFL'd inside own 5-yard line
- 40% chance on sacks, 25% on TFL runs
- Awards 2 points + possession change

### Phase P — Clock Model
- Real 15-minute quarters (900 seconds) with variable runoffs
- TD runoffs: 45-55s (includes PAT + kickoff + return)
- **Result:** ~125 plays/game matching NFL average

### Phase Q — Two-Minute Drill
- Activated when trailing with <2 min in a half
- 3 timeouts per team per half, intelligent usage
- Spike plays (stop clock, lose 1 down)
- Hurry-up completion bonus +3%, pass rate boost +20%

### Phase R — Offense Advantage Retuning
- `offenseAdvantage: 0.065 → 0.115` to target ~44-46 PPG with all new mechanics
- Multiple accuracy bases reduced (short 0.59→0.52, medium 0.46→0.42, deep 0.25→0.22)
- `coverageResistance: 1.50 → 1.60`, contested/covered mods tightened
- Run yard ranges reduced (inside 2-6, outside 3-8)
- `baseSackChance: 0.062 → 0.050`, `blockingBase: 0.55 → 0.52`
- `defRunDefenseResistance: 0.90 → 1.00`
- FG `attemptYardLine: 67 → 58`
- **Result:** Combined PPG ~44-46 (NFL 44.7), completion% ~65-67%, plays/game ~125

---

## 2026-03-29 — Team Logos & Auth Fix

- Added 32 team logo images (`team_{abbr}.png`)
- Created `TeamLogo` component integrated across all views
- Fixed 500 error on claim-team when user no longer exists in wiped DB
- `requireAuth` now verifies user exists in DB; frontend auto-clears on 401
