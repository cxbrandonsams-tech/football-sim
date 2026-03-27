# ENGINE STATE — Source of Truth

> Last updated: 2026-03-27
> **STATUS: LOCKED — Engine calibration complete. No further play-resolution tuning.**
> Validation baseline: 1000 games, `scripts/nfl-compare.ts` + 496 games, `scripts/dist-analysis.ts`

---

## Final Snapshot vs NFL Targets

| Metric | Sim | NFL Target | Status |
|---|---|---|---|
| Pts / team / game | 21.4 | 22.0 – 24.5 | ↓ accepted structural gap |
| Pts / drive | 1.899 | 1.95 – 2.15 | ↓ accepted structural gap |
| Drives / game (both) | 22.9 | 22.0 – 25.0 | ✓ |
| RZ trips / team | 2.9 | 3.0 – 4.0 | ↓ borderline / noise |
| RZ TD % | 65.1% | 52 – 62% | ↑ structural (accepted) |
| FG make % | 84.1% | 83 – 88% | ✓ |
| TDs / game (both) | 4.9 | 5.0 – 7.0 | ↓ borderline |
| 3rd-down conversion | 39.5% | 39 – 42% | ✓ |
| QB completion % | 67.3% | 64 – 67.5% | ✓ |
| QB attempts / team | 35.7 | 32 – 37 | ✓ |
| RB carries / team | 26.8 | 24 – 29 | ✓ |
| RB yards / team | 121.0 | 105 – 130 | ✓ |
| RB YPC | 4.51 | 4.20 – 4.60 | ✓ |
| Runs 20+ % | 2.4% | 1.5 – 2.5% | ✓ |
| Pass yards / team | 255.1 | 220 – 255 | ✓ (at ceiling) |
| Pass 20+ % | 6.5% | 5.0 – 7.5% | ✓ |
| WR+TE receptions / game | 39.0 | 28 – 40 | ✓ |
| RB receptions / game | 9.0 | 6 – 12 | ✓ |
| All-scrimmage 20+ / game | 6.0 | 6.0 – 9.0 | ✓ (at floor) |
| Runs 20+ / game | 1.3 | 1.0 – 2.0 | ✓ |
| Passes 20+ / game | 4.7 | 4.0 – 7.0 | ✓ |
| Long TDs (30+) / game | 0.7 | 0.5 – 0.9 | ✓ |
| Sacks / team | 2.4 | 2.3 – 2.8 | ✓ |
| TFLs / team | 5.3 | 5.0 – 8.0 | ✓ |
| Turnovers / game | 2.8 | 2.0 – 3.2 | ✓ |
| INTs / team | 0.8 | 0.7 – 1.1 | ✓ |
| Fumbles / team | 0.6 | 0.5 – 1.0 | ✓ |
| Punts / game | 9.8 | 7.0 – 11.0 | ✓ |

### Target Share by Slot (496 games, dist-analysis)

| Slot | Sim | NFL Norm | Status |
|---|---|---|---|
| WR1 | 25.5% | 23 – 27% | ✓ |
| WR2 | 23.2% | 15 – 22% | ↑ slightly high |
| WR3 | 12.0% | 8 – 13% | ✓ |
| TE1 | 16.8% | 12 – 18% | ✓ |
| TE2 | 4.7% | 3 – 7% | ✓ |
| RB1 | 15.5% | 10 – 14% | ↑ slightly high |
| RB2 | 2.3% | 2 – 5% | ✓ |

### Leaderboard Projections (17-game season)

| Category | Sim Leader | NFL Target | Status |
|---|---|---|---|
| QB passing yards | ~5,897 | 4,800 – 5,400 | ↑ (N=1000 variance; prior run 5,337 ✓) |
| RB rushing yards | ~2,075 | 1,500 – 2,100 | ✓ |
| WR receiving yards | ~1,891 | 1,500 – 1,900 | ✓ |
| TE receiving yards | ~957 | 800 – 1,100 | ✓ |
| Sacks | ~20.4 | 17 – 22 | ✓ |
| INTs | ~7.3 | 6 – 9 | ✓ |

---

## Accepted Structural Issues (closed, will not tune)

### 1. Scoring gap (~0.6 pts/team below 22.0 floor)
- **Root cause:** `defRunDefenseResistance: 0.90` tightens the run game → fewer sustained drives.
  Correct run calibration (YPC, TFLs ✓) creates this structural tradeoff.
- **Decision (2026-03-27):** Accept. Increasing `offenseAdvantage` to 0.070 would push pass yards
  and completion% out of range. 21.4 pts/team is within realistic NFL variance for lower-scoring games.
  `offenseAdvantage` locked at 0.065.

### 2. RZ TD% high (65.1% vs 52–62% target)
- **Root cause:** Drive endpoint bias — RZ trips represent sustained drives biased toward success.
- **Decision:** Accept. Do not tune directly. Would require fundamental drive logic change.

### 3. QB leaderboard variance
- **Root cause:** Methodology artifact — same QB faces all 31+ opponents across large sample.
  Prior N=1000 run produced 5,337 (in range). Variance between runs is expected.
- **Decision:** Accept. Not a code issue.

### 4. WR2/RB1 target share slightly high
- **Root cause:** WR2 absorbs redistributed targets from WR1 reduction. RB check-down multiplier generous.
- **Decision:** Accept. Not causing stat inflation at leaderboard level.

---

## Engine Architecture Notes

- **Pass success path:** `simulateGame.ts` — fully inlined (passEngine.ts is NOT called for completion).
  Chain: protection → separation → window state → throw quality → successProb → YAC → INT
- **Run success path:** `simulateGame.ts` — rating-ratio formula.
  `baseProb = oRating / (oRating + dRating * defRunDefenseResistance)`
  runEngine.ts phases (evaluateBlocking etc.) are exported but NOT called in main game loop.
- **defRunDefenseResistance:** was dead code at 0.40 (only used in runEngine.ts evaluateBlocking).
  Wired into simulateGame.ts ratio formula as of 2026-03-27.
- **d3 penalties:** Applied as `fatigueAdj` parameter in `simulatePlay()`. Pass only. No effect on runs.
- **ROLE_MULT:** Moved from hardcoded constant in simulateGame.ts to `TUNING.personnel.roleMult` in config.ts.
  Controls target weight by receiver role × depth combination.
- **Target weight formula:** `w = roleMult × (ratingScore/50)^exponent × (1 ± noise)`
  `targetWeightExponent: 0.80`, `targetWeightNoise: 0.10`
