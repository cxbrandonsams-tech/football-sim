# PLAYBOOKS_AND_FORMATIONS.md
_Source of truth for the playbook and formation system. All formation rules, play structure, bucket definitions, and selection logic live here._

---

## Guiding Philosophy

- Plays are authored against **formation slot labels**, not specific players.
- Player-to-slot assignment happens at game time based on depth charts.
- Formations are **personnel-based** (e.g., 11 personnel = 1 RB, 1 TE, 3 WR).
- Defensive **packages** are similarly personnel-based (base 4-3, nickel, dime, etc.).
- Pre-authored plays only — no custom play creator.
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

Each formation assigns players into named slots. Plays are authored against these slot names:

| Slot | Meaning |
|---|---|
| `X` | Split end — wide receiver aligned to the weak/left side |
| `Z` | Flanker — wide receiver aligned to the strong/right side, typically in motion-capable position |
| `SLOT` | Slot receiver — inside receiver in 3-WR sets |
| `SLOT_L` | Left slot (in 4- or 5-wide sets) |
| `SLOT_R` | Right slot (in 4- or 5-wide sets) |
| `TE` | Tight end (single TE sets) |
| `TE1` | Primary tight end (2TE sets) |
| `TE2` | Secondary tight end / H-back (2TE sets) |
| `RB` | Running back |
| `FB` | Fullback (in 2-back sets) |
| `QB` | Quarterback (always present) |

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

| Slot | Meaning |
|---|---|
| `DT` | Defensive tackle (0/1/2 tech) |
| `DT1` | Nose tackle / primary DT |
| `DT2` | 3-tech DT |
| `DE_L` | Left defensive end |
| `DE_R` | Right defensive end |
| `MLB` | Middle linebacker |
| `WLB` | Weak-side linebacker |
| `SLB` | Strong-side linebacker |
| `CB_L` | Left cornerback |
| `CB_R` | Right cornerback |
| `NICKEL_CB` | Slot cornerback (nickel package only) |
| `DIME_CB` | Second slot corner (dime package only) |
| `SS` | Strong safety |
| `FS` | Free safety |

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

On each snap, the engine executes this sequence:

1. **Resolve bucket** — classify down and yards-to-go into one of the 13 buckets
2. **Find playbook** — look up the bucket in the offensive/defensive game plan
3. **Filter valid plays** — remove plays where required formation slots are empty/unfilled
4. **Weighted selection** — randomly pick a play proportional to weights
5. **Resolve slot assignments** — map each slot in the play to the assigned player from the formation depth chart
6. **Send to engine** — pass the resolved play + player assignments into the locked simulation engine

### Fallback Rules

- If the assigned playbook is empty after filtering → fall back to the **default playbook** for that down type (run/pass balanced)
- If no default playbook covers the situation → fall back to a **generic balanced play** (inside zone run or a short pass)
- Fallbacks are logged for debugging but do not crash the game

---

## Future Ideas (Not Being Built Yet)

These are intentionally deferred. Do not implement without explicit approval:

- **Custom play creator** — user-authored plays
- **Motion before the snap**
- **Audibles** — changing the called play at the line
- **Hot routes** — individual route adjustments
- **Pre-snap shifts** — formation shifts before snap
- **Coverage disguise** — defensive pre-snap deception
- **Repetition penalties** — reduced effectiveness of overused plays
- **Dynamic playbooks** — AI-driven play-calling adjustments mid-game
- **Personnel substitution logic** — auto-substituting players based on game state
