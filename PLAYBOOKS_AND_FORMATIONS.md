# PLAYBOOKS_AND_FORMATIONS.md
_Source of truth for the playbook and formation system. All formation rules, play structure, bucket definitions, and selection logic live here._

---

## Guiding Philosophy

- Plays are authored against **formation slot labels**, not specific players.
- Player-to-slot assignment happens at game time based on depth charts.
- Formations are **personnel-based** (e.g., 11 personnel = 1 RB, 1 TE, 3 WR).
- Defensive **packages** are similarly personnel-based (base 4-3, nickel, dime, etc.).
- Pre-authored plays form the base library; users can create custom plays (max 20/team) with structured route assignments and validation rules (max 3 deep, at least 1 short/medium).
- Realism over arcade behavior at every layer.

---

## Offensive Formations

### Personnel Grouping Notation
Standard NFL notation: `XY personnel` where X = number of RBs, Y = number of TEs. Remaining skill positions are WRs.

| Personnel | RBs | TEs | WRs | Common formations |
|---|---|---|---|---|
| 11 | 1 | 1 | 3 | Shotgun, Singleback, Trips |
| 12 | 1 | 2 | 2 | I-Form 2TE, Singleback 2TE |
| 21 | 2 | 1 | 2 | I-Form, Strong I |
| 22 | 2 | 2 | 1 | Power I, Jumbo |
| 10 | 1 | 0 | 4 | Empty, Spread |
| 00 | 0 | 0 | 5 | Empty 5-wide |

### Offensive Slot Labels

Each formation assigns players into named slots. Plays are authored against these slot names.

**Implemented slots** (used in code and play library):

| Slot | Meaning | Depth chart mapping |
|---|---|---|
| `X` | Split end — primary wide receiver | WR[0] |
| `Z` | Flanker — secondary wide receiver | WR[1] |
| `SLOT` | Slot receiver — inside receiver in 3-WR sets | WR[2] |
| `TE` | Tight end | TE[0] |
| `RB` | Running back | RB[0] |
| `FB` | Fullback (in 2-back sets) | RB[1] |

> **Note:** QB is always present and is not a configurable slot. The labels `SLOT_L`, `SLOT_R`, `TE1`, `TE2` were part of the original design vision for 4/5-wide and 2-TE sets but are not currently implemented. If those formations are added in the future, the slot labels will be extended.

### Formation-Specific Depth Chart

Users configure which player fills each slot for each formation. This is the **formation depth chart** — separate from the overall roster depth chart.

Example: In Shotgun 11 personnel, the user assigns:
- X → WR1
- Z → WR2
- SLOT → WR3
- TE → TE1
- RB → RB1

If a slot is unassigned, the engine falls back to the positional depth chart.

---

## Defensive Packages

### Package Types

| Package | Personnel | Alignment |
|---|---|---|
| Base 4-3 | 4 DL, 3 LB, 4 DB | Standard vs. 11/21 personnel |
| Base 3-4 | 3 DL, 4 LB, 4 DB | Standard vs. run-heavy |
| Nickel | 4 DL, 2 LB, 5 DB | vs. 3-WR sets |
| Dime | 4 DL, 1 LB, 6 DB | vs. 4-WR / spread |
| Quarter | 4 DL, 0 LB, 7 DB | vs. Hail Mary / prevent |
| Goal Line | 5 DL, 3 LB, 3 DB | Short yardage / inside the 5 |

### Defensive Slot Labels

**Implemented slots** (used in code and package definitions):

| Slot | Meaning | Depth chart mapping |
|---|---|---|
| `DE1` | Defensive end #1 | DE[0] |
| `DE2` | Defensive end #2 | DE[1] |
| `DT1` | Defensive tackle #1 | DT[0] |
| `DT2` | Defensive tackle #2 (3-tech) | DT[1] |
| `NT` | Nose tackle (3-4 base) | DT[0] |
| `LB1` | Linebacker #1 | LB[0] |
| `LB2` | Linebacker #2 | LB[1] |
| `LB3` | Linebacker #3 | LB[2] |
| `LB4` | Linebacker #4 (4-3 only) | LB[3] |
| `OLB1` | Outside linebacker #1 (3-4) | LB[0] |
| `OLB2` | Outside linebacker #2 (3-4) | LB[1] |
| `ILB1` | Inside linebacker #1 (3-4) | LB[2] |
| `ILB2` | Inside linebacker #2 (3-4) | LB[3] |
| `CB1` | Cornerback #1 | CB[0] |
| `CB2` | Cornerback #2 | CB[1] |
| `NCB` | Nickel cornerback (slot) | CB[2] |
| `DC1` | Dime cornerback #1 | CB[3] |
| `DC2` | Dime cornerback #2 | CB[4] |
| `FS` | Free safety | S[0] |
| `SS` | Strong safety | S[1] |

> **Note:** The original spec used positional names (`MLB`, `WLB`, `SLB`, `DE_L`, `DE_R`, `CB_L`, `CB_R`). The implementation uses numbered slots instead, which are more flexible across different package configurations.

### Package-Specific Depth Chart

Users configure which player fills each slot per package. The engine selects the package that matches the offensive personnel on the field, or the coach/GM can set package preferences by down/distance bucket.

---

## Play Structure

### Play Types
- `PASS` — quarterback throws; route assignments resolve against coverage
- `RUN` — ball carrier runs; run engine resolves yards
- `PLAY_ACTION` — tagged PASS variant; adjusts coverage reaction timing

### Pass Play — Route Assignments

Each pass play lists participating receivers by **slot** and assigns each a **route tag**:

```
route_tag := SHORT | MEDIUM | DEEP
```

| Tag | Yards (approx.) |
|---|---|
| `SHORT` | 0–6 yards past LOS |
| `MEDIUM` | 7–14 yards past LOS |
| `DEEP` | 15+ yards past LOS |

**Example play definition (pseudo-schema):**
```
Play: "Curl Flat"
  Formation: 11 personnel / Shotgun
  Type: PASS
  Routes:
    X    → MEDIUM (curl)
    Z    → SHORT  (flat)
    SLOT → MEDIUM (hook)
    TE   → SHORT  (check-down)
    RB   → SHORT  (flat)
  Primary: X
  Hot: RB
```

### Run Play — Slot Assignments

Run plays specify the ball carrier slot and the blocking assignments:

```
Play: "Inside Zone"
  Formation: 21 personnel / I-Form
  Type: RUN
  Ball carrier: RB
  Lead blocker: FB
  Direction: INSIDE
```

---

## Down & Distance Buckets

Every snap is classified into exactly one bucket. The bucket drives which playbook is used.

### Bucket Definitions

| Bucket | Condition |
|---|---|
| `FIRST_10` | 1st down, exactly 10 yards to go |
| `FIRST_LONG` | 1st down, 11+ yards to go (penalty pushed it back) |
| `FIRST_MEDIUM` | 1st down, 4–9 yards to go (first down moved up via penalty) |
| `FIRST_SHORT` | 1st down, 1–3 yards to go |
| `SECOND_LONG` | 2nd down, 7+ yards to go |
| `SECOND_MEDIUM` | 2nd down, 4–6 yards to go |
| `SECOND_SHORT` | 2nd down, 1–3 yards to go |
| `THIRD_LONG` | 3rd down, 7+ yards to go |
| `THIRD_MEDIUM` | 3rd down, 4–6 yards to go |
| `THIRD_SHORT` | 3rd down, 1–3 yards to go |
| `FOURTH_LONG` | 4th down, 7+ yards to go |
| `FOURTH_MEDIUM` | 4th down, 4–6 yards to go |
| `FOURTH_SHORT` | 4th down, 1–3 yards to go |

### Distance Rules
- **Short:** 1–3 yards to go
- **Medium:** 4–6 yards to go
- **Long:** 7+ yards to go
- **1st & 10** is its own bucket regardless of distance classification

---

## Playbooks

### Definition

A **playbook** is a reusable, weighted collection of plays.

```
Playbook: "Two-Minute Drill"
  - Curl Flat          weight: 3
  - Slant Combo        weight: 4
  - Hitch Screen       weight: 2
  - Four Verticals     weight: 1
```

- The same play can appear in multiple playbooks with different weights.
- Weights are relative — higher weight = more likely to be selected.
- A play is only eligible if the current formation has all required slots filled.

### Bucket-to-Playbook Mapping

Each offensive game plan maps each down/distance bucket to exactly one playbook:

```
Offensive Plan:
  FIRST_10     → "Base Balanced"
  FIRST_LONG   → "Base Balanced"
  SECOND_LONG  → "Pass Heavy"
  SECOND_MEDIUM → "Balanced"
  SECOND_SHORT → "Short Yardage Run"
  THIRD_LONG   → "Spread Pass"
  THIRD_MEDIUM → "Spread Balanced"
  THIRD_SHORT  → "Power Run"
  FOURTH_SHORT → "Goal Line"
  ...
```

Each defensive game plan maps each bucket to one defensive playbook:

```
Defensive Plan:
  FIRST_10     → "Base Coverage"
  SECOND_LONG  → "Nickel Pass Rush"
  THIRD_LONG   → "Dime Cover 2"
  THIRD_SHORT  → "Goal Line Stacks"
  ...
```

---

## Play Selection Flow

### Offensive Selection (`resolvePlay` in `playSelection.ts`)

On each offensive snap:

1. **Resolve bucket** — classify down and yards-to-go into one of the 13 buckets via `classifyBucket()`
2. **Find playbook** — look up the bucket in the team's `offensivePlan`. If the assigned playbook is not found, fall back to `DEFAULT_OFFENSIVE_PLAN` for that bucket.
3. **Build candidate pool** — resolve each playbook entry to an `OffensivePlay` from the built-in library or the team's custom plays
4. **Apply weight modifiers** — multiply each play's base weight through the modifier pipeline (see below)
5. **Weighted selection** — randomly pick from the modified pool via `weightedPick()`
6. **Record history** — add the selected play to the per-team play history (for repetition tracking)
7. **Resolve slot assignments** — map the play's formation slots to actual players from the formation depth chart
8. **Send to engine** — pass the resolved `PlayType` to `simulatePlay()`. The engine receives only the type (e.g., `inside_run`, `deep_pass`), not the play object.

### Weight Modifier Pipeline (Offensive)

Each candidate play's base weight is multiplied through this chain:

```
finalWeight = baseWeight × tendency × repetition × context × meta
```

| Modifier | Source | Max Effect | Details |
|----------|--------|-----------|---------|
| **Tendency** | Team's `TeamTendencies` sliders | ±25% | `runPassBias` → run/pass balance. `aggressiveness` → deep/short tilt. `shotPlayRate` → additional deep boost. |
| **Repetition** | Play history (last 6 plays) | ×0.4 to ×1.0 | Same play last snap → ×0.6. Same play 2+ times in window → ×0.4. Same concept → ×0.7. Same formation → ×0.85. Floor: 0.1. |
| **Context** | Game situation | ±25% | Losing late → pass boost. Winning late → run boost. Red zone → deep suppressed. Backed up → pass suppressed. |
| **Meta** | League-wide `MetaProfile` | ±10% | Counter-trend: if league is pass-heavy, run gets a slight boost (and vice versa). Requires 50+ league-wide plays tracked. |

**Critical invariant:** All modifiers affect only which play is *selected*. They do not change how the engine *resolves* the play once selected. A deep pass that gets a ×1.3 selection boost still resolves with the exact same engine probabilities as one that wasn't boosted.

### Defensive Selection (`resolveDefensivePlay` in `defensiveSelection.ts`)

Mirrors the offensive flow with its own modifier pipeline:

```
finalWeight = baseWeight × preGameScouting × halftimeScouting
```

| Modifier | Source | Max Effect | Details |
|----------|--------|-----------|---------|
| **Pre-game scouting** | Opponent's season-long `playStats` | ±20% (scaled by coach intelligence) | Pass-heavy opponent → boost coverage. Run-heavy → boost run-stopping. Deep-heavy → suppress blitz. |
| **Halftime scouting** | Opponent's first-half play data | ±30% (1.5× intensity, scaled by coach intelligence) | Same logic as pre-game but from live game data. |

Coach intelligence (derived from DC overall + HC game management + defensive_architect trait) scales both scouting intensities (factor 0.3–1.0) and adds noise (0–15%) for lower-quality coaching staffs.

### Tendency Sliders — Active vs. Stored

The `TeamTendencies` interface has 7 fields. Their current wiring status:

| Field | Side | Status | Effect |
|-------|------|--------|--------|
| `runPassBias` | Offense | **ACTIVE** | Adjusts run vs. pass play weights |
| `aggressiveness` | Offense | **ACTIVE** | Adjusts deep vs. short play weights |
| `shotPlayRate` | Offense | **ACTIVE** | Additional deep pass boost/penalty |
| `playActionRate` | Offense | **STORED, NOT WIRED** | Saved to database, displayed in UI, but does not currently affect play selection |
| `blitzRate` | Defense | **STORED, NOT WIRED** | Saved to database, displayed in UI, but does not currently affect defensive play selection |
| `coverageAggression` | Defense | **STORED, NOT WIRED** | Same — stored but not wired |
| `runCommitment` | Defense | **STORED, NOT WIRED** | Same — stored but not wired |

> The four "stored but not wired" fields exist in the data model and UI to support future wiring. They do not affect gameplay in the current implementation. Defensive adaptation is driven entirely by opponent scouting + halftime adjustments + coach intelligence.

### Fallback Rules

- If a team has no `offensivePlan` → fall back to `selectPlayType()` (legacy path in `simulateGame.ts` with its own down/distance + situational adjustments)
- If the assigned playbook is not found → use `DEFAULT_OFFENSIVE_PLAN` for that bucket
- If a playbook resolves to zero valid plays → return null (engine uses legacy fallback)
- Fallbacks are counted in `playSelectionStats` for debugging

---

## Additional Implemented Systems

These systems are live and affect gameplay. They are implemented in code but were added after the original spec was written.

### Play Effectiveness Tracking

Per-team, per-play cumulative stats tracked during simulation:
- `calls` — number of times a play was called
- `totalYards` — total yards gained
- `successes` — plays with 4+ yards or a first down
- `firstDowns` — first downs converted
- `touchdowns` — touchdowns scored
- `turnovers` — turnovers committed

Stored on `team.playStats` (keyed by play ID). Reset at the start of each new season. Displayed in the playbook UI next to each play entry.

### Play Explanation System

When a play is selected via the playbook path, the system generates human-readable `explanation` strings attached to the `PlayEvent`. These describe which modifiers influenced the selection:
- Tendency reasons ("Run-heavy tendency → run boost")
- Repetition reasons ("Repeated play → heavy penalty")
- Context reasons ("Trailing late → pass emphasis")
- Meta reasons ("Counter-meta → slight boost")

Visible in the game viewer via the "Logic" toggle button. Explanations are only generated for plays resolved through the playbook system, not the legacy fallback path.

### Coach Intelligence (Defensive Only)

Defensive scouting effectiveness is scaled by coach quality:
- **Factor (0.3–1.0):** Derived from DC overall (70%) + HC game management (30%) + defensive_architect trait bonus (+0.08). Scales the intensity of all scouting multipliers.
- **Noise (0–15%):** Inverse of factor. Low-intelligence coaches have inconsistent adjustments that can occasionally move in the wrong direction.

### League Meta Evolution

A `MetaProfile` is computed each week from all teams' `playStats`:
- `passRate` — league-wide fraction of pass plays
- `runRate` — league-wide fraction of run plays
- `deepRate` — fraction of passes that are deep

The meta counter-trend multiplier gives plays that go against the league trend a small boost (max ±10%). This creates natural oscillation: when everyone passes, running becomes slightly more effective, and vice versa.

Requires 50+ league-wide tracked plays before activating (typically week 2–3).

---

## Implementation Notes

### Engine Separation

The playbook system sits entirely above the simulation engine. The boundary is:

```
Playbook layer → resolves to a PlayType (e.g., 'inside_run', 'deep_pass')
Engine layer   → receives PlayType, resolves yards/result/events
```

No playbook logic modifies engine probabilities, yard distributions, or outcome calculations. The engine has no knowledge of playbooks, formations, routes, or weight modifiers.

### What Modifiers Can and Cannot Do

**Can do:** Change which play is called more or less often. A tendency slider that boosts runs makes run plays more likely to be selected. The engine still resolves each run play identically.

**Cannot do:** Change how effective a play is once called. There is no mechanism for a "boosted" play to resolve with better probabilities than a "non-boosted" one. All plays of the same `engineType` resolve through the same engine path.

### Debug Observability

- `PLAY_SELECTION_DEBUG=1` — logs ~5% of offensive play selections with full weight pipeline
- `DEF_SELECTION_DEBUG=1` — logs ~5% of defensive play selections with package/coverage details
- `playSelectionStats` / `defensiveSelectionStats` — counters for legacy fallback vs. new path resolution rates

---

## Future Ideas (Not Being Built Yet)

These are intentionally deferred. Do not implement without explicit approval:

- ~~**Custom play creator**~~ — ✅ Implemented (Phase 1 MVP, 2026-03-27)
- ~~**Repetition penalties**~~ — ✅ Implemented (window of 6, multiplicative penalties)
- **Motion before the snap**
- **Audibles** — changing the called play at the line
- **Hot routes** — individual route adjustments
- **Pre-snap shifts** — formation shifts before snap
- **Coverage disguise** — defensive pre-snap deception
- **Wiring `playActionRate`** — connecting the play-action tendency slider to the selection pipeline
- **Wiring defensive tendencies** — connecting `blitzRate`, `coverageAggression`, `runCommitment` to defensive play selection
- **Personnel substitution logic** — auto-substituting players based on game state
