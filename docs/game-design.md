# Simulation & Ratings Design

> **Version:** 2.0
> **Last Updated:** 2026-03-27
> **Status:** LOCKED — Ratings architecture and engine pipeline are finalized.

---

## Scope of This Document

This document is the canonical reference for:
- **Player ratings** — every position's rating definitions, purposes, and overall formulas
- **Derived / hidden ratings** — engine-only computed values (e.g., Safety Range)
- **Simulation pipeline** — the sequential phase-by-phase resolution of pass and run plays
- **Engine-facing design rules** — principles that govern how ratings map to outcomes

This document does NOT cover:
- League structure, coaching, awards, history, or multi-league architecture — see [`FRANCHISE_SOURCE_OF_TRUTH.md`](FRANCHISE_SOURCE_OF_TRUTH.md)
- Playbooks, formations, play selection, or weight modifiers — see [`PLAYBOOKS_AND_FORMATIONS.md`](../PLAYBOOKS_AND_FORMATIONS.md)
- Frozen tuning constants — see [`LOCKED_VALUES.md`](LOCKED_VALUES.md)
- Engine calibration metrics and validation baselines — see [`ENGINE_STATE.md`](ENGINE_STATE.md)
- Calibration change history — see [`TUNING_LOG.md`](TUNING_LOG.md)

---

# Player Ratings System (v4)

## Core Design Philosophy

- Each rating has one clear purpose
- No redundant or overlapping stats
- Ratings map directly to engine phases
- Advanced behavior is handled by logic, not excess ratings
- Hidden derived stats are used where appropriate to reduce UI clutter
- System is built for tuning via weight adjustments, not structural changes

---

## Quarterback (QB)

All QB ratings are visible and scoutable. Scouting accuracy improves with investment — raw scouts show noisy values, elite scouts show values close to true.

### Core Ratings

**Arm Strength**
Determines throw velocity, viability on all depths, and ability to fit passes into tight windows.
Impact increases with depth: minor on short, moderate on medium, major on deep.

**Pocket Presence**
Ability to sense pressure, extend plays, and maintain accuracy while moving in the pocket.
Affects throw quality under pressure and escape success.

**Mobility**
Ability to move in the pocket and gain yards on scrambles.
Minor simulation impact — primarily used for scramble events and scoring formula weight.

**Short Accuracy**
Ball placement on routes under 10 yards. Highest-weight accuracy rating.

**Medium Accuracy**
Ball placement on routes 10-20 yards.

**Deep Accuracy**
Ball placement on routes 20+ yards.

**Processing**
How well the QB reads defenses and identifies the correct target in the progression.
High processing = fewer wasted reads, better timing.

**Decision Making**
Risk-taking behavior, target selection, and interception likelihood.
The single highest-weighted QB rating in the overall formula.
High decision making = throws the ball away more, avoids forcing into coverage.

### Overall Rating Formula

```
decisionMaking  x 0.22
shortAccuracy   x 0.18
mediumAccuracy  x 0.15
pocketPresence  x 0.15
deepAccuracy    x 0.10
processing      x 0.10
armStrength     x 0.07
mobility        x 0.03
```

> Decision making being the top weight is intentional — a QB who avoids mistakes is more valuable than one with a cannon arm.

---

## Running Back (RB)

### Core Ratings

**Vision**
Ability to find running lanes, identify cutback opportunities, and make correct pre-contact decisions.

**Elusiveness**
Ability to make defenders miss in space. Wins contact resolution on outside runs and in the open field.

**Power**
Ability to break tackles and gain yards through contact. Wins contact resolution on inside runs.

**Speed**
Breakaway ability and long-run potential. Only activates in open-field situations — not on every carry.

**Ball Security**
Fumble resistance. Affects fumble probability during contact and at the end of runs.

### Overall Rating Formula

```
speed        x 0.25
vision       x 0.20
power        x 0.20
elusiveness  x 0.20
ballSecurity x 0.15
```

---

## Wide Receiver (WR)

### Core Ratings

**Route Running**
Ability to create separation vs. coverage. Primary factor in man coverage matchups.

**Speed**
Separation at all depths:
- Short routes -> minor impact
- Medium routes -> moderate impact
- Deep routes -> major impact

**Hands**
Ability to catch the ball. Used for open catch success and contested catch resolution.
Higher hands = fewer drops, better contested catches.

**YAC (Yards After Catch)**
Ability to gain additional yards after securing the catch.
Bundles elusiveness, vision, and tackle-breaking in space.

**Size**
Physical presence. Influences contested catch outcomes and used in the overall formula.

### Overall Rating Formula

```
hands        x 0.30
routeRunning x 0.25
speed        x 0.25
yac          x 0.12
size         x 0.08
```

---

## Tight End (TE)

TE shares most ratings with WR but adds **Blocking** as a distinct dimension. This makes TE a dual-threat rating, balancing pass-catching ability with run game contribution.

### Core Ratings

**Route Running** — Same as WR: ability to create separation vs. coverage.

**Speed** — Same depth-scaling as WR. TEs typically lower than WR but still meaningful on seam routes.

**Hands** — Catch ability in both open and contested situations.

**YAC** — Post-catch yardage production.

**Size** — More impactful for TE than WR: TEs are larger targets and win more contested catches.

**Blocking** — Ability to block in both run and pass protection. Used in the blocking phase of run plays. A high blocking TE meaningfully improves run game; a low blocking TE reduces it.

### Overall Rating Formula

```
hands        x 0.25
blocking     x 0.22
routeRunning x 0.20
speed        x 0.15
yac          x 0.10
size         x 0.08
```

---

## Offensive Line (OL)

Applies to OT, OG, and C. No distinction between positions in the rating system.

### Core Ratings

**Pass Blocking** — Ability to protect the QB against pass rush. Primary factor in protection resolution.

**Run Blocking** — Ability to create running lanes. Primary factor in blocking phase of run plays.

**Awareness** — Assignment correctness: blitz pickup, stunt recognition, pulling assignments. Poor awareness results in missed or delayed assignments.

**Discipline** — Penalty avoidance: false starts, holding, illegal formation. A low discipline lineman is a drive-killer. Distinct from Awareness: Awareness is about knowing assignments; Discipline is about not losing composure and committing penalties.

### Overall Rating Formula

```
passBlocking x 0.42
runBlocking  x 0.37
awareness    x 0.13
discipline   x 0.08
```

---

## Defensive Line (DL)

Applies to DE and DT.

### Core Ratings

**Pass Rush** — Ability to generate pressure on the QB. Compared against OL Pass Blocking in protection resolution.

**Run Defense** — Ability to stop ball carriers and control gaps. Used in blocking phase of run plays.

**Discipline** — Gap control, contain integrity, and assignment consistency. A high discipline DL doesn't get sucked inside on counters or lose contain on mobile QBs.

> Note: This is a position-specific simulation rating, distinct from `PersonalityRatings.discipline` (see Personality Ratings below).

### Overall Rating Formula

```
passRush   x 0.45
runDefense x 0.35
discipline x 0.20
```

---

## Linebacker (LB)

Applies to OLB and MLB.

### Core Ratings

**Run Defense** — Ability to stop the run and finish plays at the point of attack.

**Pass Rush** — Ability to pressure the QB when blitzing. Lower weight than DL: LBs are secondary rushers.

**Coverage** — Ability to defend against the pass in both man and zone assignments.

**Speed** — Athleticism and lateral range. Affects pursuit, coverage range, and closing ability.

**Pursuit** — Angles and tracking: ability to take correct pursuit angles and run down ball carriers. Distinct from Speed: a slow LB with high Pursuit can still make plays; a fast LB with poor Pursuit over-runs them.

**Awareness** — Assignment correctness, pre-snap reads, and zone effectiveness.

**Discipline** — Penalty avoidance: offsides, late hits, roughing the passer. Also affects assignment integrity under pressure and misdirection.

### Overall Rating Formula

```
runDefense x 0.24
speed      x 0.18
pursuit    x 0.16
coverage   x 0.16
awareness  x 0.10
passRush   x 0.06
discipline x 0.10
```

---

## Cornerback (CB)

### Core Ratings

**Man Coverage** — Ability to stay with receivers in 1-on-1 coverage. Compared against WR Route Running + Speed.

**Zone Coverage** — Ability to defend assigned areas, read route combinations, and pass off receivers correctly.

**Ball Skills** — Ability to contest passes, deflect, and create turnovers. Drives INT and PBU generation.

**Speed** — Ability to match receiver speed and recover on deep routes. Paired with man coverage in separation matchups.

**Size** — Physical presence. Minor influence on contested catches; small weight in overall formula.

**Tackling** — Open-field tackle success. Used in YAC resolution: limits yards after catch.

**Awareness** — Pre-snap reads, route recognition, and zone discipline.

**Discipline** — Pass interference and holding avoidance. A low discipline CB gives up big plays through penalties even when in good position.

### Overall Rating Formula

```
manCoverage  x 0.23
speed        x 0.23
zoneCoverage x 0.18
ballSkills   x 0.14
awareness    x 0.09
discipline   x 0.08
tackling     x 0.03
size         x 0.02
```

---

## Safety (S)

Applies to FS and SS. Both share the same rating set; the Range derived stat skews most useful for FS.

### Core Ratings

**Zone Coverage** — Ability to defend deep zones and read developing plays. Primary rating for most safeties.

**Man Coverage** — Ability to cover receivers when matched up: relevant for TE coverage and slot assignments.

**Ball Skills** — Ability to make plays on the ball (INTs, deflections). Same role as CB Ball Skills.

**Speed** — Ability to cover ground, close on deep passes, and recover.

**Size** — Physical presence. Minor weight in contested situations and overall formula.

**Tackling** — Open-field tackle success. Safeties are often the last line of defense.

**Awareness** — Read recognition, positioning, and reaction timing. Also feeds the hidden Range derivation.

**Discipline** — Unnecessary roughness and pass interference avoidance. Safeties who blitz or play the ball aggressively are most at risk without this rating.

### Overall Rating Formula

```
zoneCoverage x 0.23
speed        x 0.20
manCoverage  x 0.14
awareness    x 0.14
ballSkills   x 0.12
discipline   x 0.08
tackling     x 0.06
size         x 0.03
```

---

## Special Teams (K / P)

### Core Ratings

**Kick Power** — Distance potential on field goals, kickoffs, and punts.

**Kick Accuracy** — Accuracy on field goal attempts. Applied against distance and pressure modifiers.

**Composure** — Consistency under pressure. Affects performance in high-leverage kick situations (late game, loud crowd, long distance).

### Overall Rating Formula

```
kickPower    x 0.45
kickAccuracy x 0.40
composure    x 0.15
```

---

## Personality Ratings (All Positions)

A separate block of meta-game ratings that affect contracts and development.
**These are not used by the play simulation engine.**

**Work Ethic** — Affects progression and training rolls. High work ethic -> better development outcomes.

**Loyalty** — Affects contract demands. High loyalty -> player accepts below-market deals.

**Greed** — Affects contract demands. High greed -> player pushes for maximum value.

> Discipline is NOT a personality rating. It is a position-specific simulation rating for OL, DL, LB, CB, and Safety — a direct driver of penalty frequency in the engine.

---

## Hidden / Derived Ratings

### Range (Safeties Only)

Represents a defender's ability to cover large areas of the field in deep coverage.

**Formula:**
```
Range = (Speed x 0.6) + (Awareness x 0.4)
```

**Used for:**
- Deep zone coverage effectiveness
- Over-the-top help defense
- Closing on deep passes
- Preventing explosive plays

**Not used for:**
- Man coverage
- Short zone reactions
- Tackling or run defense

Range is not stored as a field — it is calculated on demand by `calcRange()`. It should not be shown in the standard ratings UI.

---

## Rating Design Principles

- Ratings are intentionally limited to avoid stat bloat
- Each stat maps cleanly to a phase in the engine
- Hidden derived stats allow deeper simulation without UI complexity
- System is built for tuning via weight adjustments, not structural changes
- "Ball Skills" on DBs (turnovers) and "Hands" on WR/TE (catching) are intentionally named differently — they serve different engine roles

---

# Simulation Engine Pipeline

## Core Philosophy

The engine simulates football outcomes through layered, sequential interactions rather than isolated dice rolls.

Each phase feeds directly into the next — the output of phase 1 becomes an input to phase 2, and so on. This is a **sequential resolution pipeline**, not a parallel system.

The engine has two separate pipelines: one for **pass plays** and one for **run plays**.

All tuning constants live in `config.ts` (`TUNING` object) and are never hardcoded in engine functions. See [`LOCKED_VALUES.md`](LOCKED_VALUES.md) for the frozen values.

---

## Pass Play Pipeline (6 Phases)

### Phase 1: Pre-Snap Context

Sets the frame for everything that follows.

- Offensive play concept (Short / Medium / Deep read)
- Read progression (1-3 receivers)
- Defensive call (Man, Zone, or Mixed)
- Player assignments (routes, coverage responsibilities)
- Leverage, help structure, and play-action flag

**Output -> Phase 2:** Play type, coverage structure, and whether play-action is active.

### Phase 2: Protection vs. Pass Rush

Determines pocket conditions for the QB.

**Offensive factors:**
- Pass Blocking (OL)
- Awareness (OL — stunt/blitz pickup)

**Defensive factors:**
- Pass Rush (DL / LB)
- Discipline (DL)

**Outcomes:** Clean pocket / Gradual pressure / Immediate pressure (sack)

**Output -> Phase 4:** Pressure level modifies QB throw timing and accuracy.

### Phase 3: Route Development & Coverage Interaction

Determines how much separation the receiver creates. Runs concurrently with Phase 2 but its output feeds Phase 4.

**Speed scaling applies at all depths:**
- Short -> minor impact
- Medium -> moderate impact
- Deep -> major impact

**Man Coverage:**
Compare WR (Route Running + Speed) vs. DB (Man Coverage + Speed + Awareness).
Outcomes: tight / slight separation / clear separation / defender in phase.

**Zone Coverage:**
Uses Zone Coverage + Awareness (primary) + Speed + Safety Range.
Routes stress zones; defenders react, pass off, or get pulled out of position.
Outcomes: window open / window closes / late reaction / blown zone.

**Play-Action Bonus:**
When play-action is active, separation scores receive a positive modifier — defenders are briefly held by the run fake.

**Output -> Phase 4:** Separation state (window open/tight/covered) and defender positioning.

### Phase 4: QB Decision & Throw Execution

QB reads the separation states from Phase 3 and pressure from Phase 2, then selects a target and executes the throw.

**Decision inputs:**
- Processing (reads the correct window)
- Decision Making (risk tolerance — will he throw into coverage?)
- Pressure state from Phase 2

**Throw execution inputs:**
- Short / Medium / Deep Accuracy (depth-matched to the route)
- Arm Strength (scaling: minor short, moderate medium, major deep)

**Arm Strength also affects:**
- Ball travel time
- Window tightness tolerance
- Defender recovery time before the ball arrives

**Output -> Phase 5:** Throw quality (on target / slightly off / contested / INT risk).

### Phase 5: Catch Resolution

**Open catch:**
- WR Hands
- QB throw quality (from Phase 4)
- Defender proximity

**Contested catch:**
- WR Hands vs. DB Ball Skills + positioning

> Route Running does NOT significantly impact contested catches — separation creation is Phase 3's job; Phase 5 is about securing the ball once the throw is already in the air.

**Output -> Phase 6:** Catch made / incomplete / INT.

### Phase 6: After Catch (YAC)

Only reached if Phase 5 results in a catch.

**Offensive:** YAC rating (bundles elusiveness, vision, tackle-breaking)

**Defensive response:** Pursuit (LB), Tackling (CB / Safety)

---

## Run Play Pipeline (5 Phases + Fumble Check)

### Phase 1: Blocking Evaluation

Determines the quality of the run lane.

**Offensive factors:**
- Run Blocking (OL)
- Awareness (OL — pulling, combo blocks)
- Blocking (TE — contributes when TE is assigned as a blocker)

**Defensive factors:**
- Run Defense (DL)
- Discipline (DL — gap control)
- Run Defense (LB — second-level pursuit)

**Output -> Phase 2:** Blocking score (poor / average / good lane created).

### Phase 2: Vision / Hole Reading

RB evaluates the lane from Phase 1 and decides where to go.

**Input:** Blocking score from Phase 1 + RB Vision

High Vision = identifies the correct hole, finds cutbacks when primary lanes close.
Low Vision = hits wrong gap, loses yards even when blocking is adequate.

**Output -> Phase 3:** Adjusted lane quality after RB decision-making.

### Phase 3: Initial Engagement

First contact with a defender.

**Inputs:** Blocking score from Phase 2, DL Run Defense, LB Run Defense

Determines whether the RB hits clean space or immediately engages a tackler.

**Output -> Phase 4:** Contact state (clean / engaged).

### Phase 4: Contact Resolution

If the RB engages a tackler, this phase resolves break-tackle attempts.

**Resolution is Power OR Elusiveness — not blended.** The run type and situation determine which applies:

- **Inside runs / contact in a phone booth:** Power wins
- **Outside runs / space situations:** Elusiveness wins
- **The better fit for the situation is used**, not an average of both

**Output -> Phase 5:** Yards gained up to this point, whether runner is in the open field.

### Phase 5: Breakaway

Only reached if the RB reaches the open field after Phase 4.

**Input:** RB Speed

Speed triggers a bonus yardage roll for big-play potential.
Speed does NOT activate on every carry — only in genuine open-field situations.

Inside vs. outside run differences:
- Outside runs have higher breakaway potential
- Inside runs cap at shorter breakaway distances

### Fumble Check

Runs at the end of contact resolution (Phase 4) and after big hits.

**Input:** RB Ball Security

Low ball security + heavy contact = elevated fumble probability.

---

## Pipeline Summaries

### Pass Play Flow

```
1. Pre-snap context set
2. Protection resolves -> pocket state determined
3. Routes run vs. coverage -> separation state determined
4. QB reads progression -> selects target -> throw executed
5. Catch resolved (open or contested)
6. YAC determined
```

Each step receives the output of the previous step. Step 2 and Step 3 run in parallel, but both feed into Step 4.

### Run Play Flow

```
1. Blocking evaluated -> lane quality determined
2. RB Vision applied -> hole selected
3. Initial engagement -> contact state determined
4. Break-tackle resolved (Power or Elusiveness, situation-dependent)
5. Breakaway (Speed bonus, open field only)
6. Fumble check (after contact)
```

---

## Foundational Engine Principles

1. **No redundant stats** — every rating has exactly one engine purpose.
2. **Clear phase separation** — each phase has defined inputs and outputs.
3. **Sequential resolution** — each phase feeds the next; no isolated dice rolls.
4. **Tunable constants** — all numeric values live in `config.ts`, never hardcoded.
5. **Realism first** — realistic outcomes over arcade behavior, always.
6. **Separate pipelines** — run and pass have distinct phase logic.
7. **Ratings drive outcomes** — no decorative stats; if it exists, it affects simulation.

---

*For playbook design and play selection systems, see [`PLAYBOOKS_AND_FORMATIONS.md`](../PLAYBOOKS_AND_FORMATIONS.md) and [`FRANCHISE_SOURCE_OF_TRUTH.md`](FRANCHISE_SOURCE_OF_TRUTH.md). For frozen engine metrics, see [`ENGINE_STATE.md`](ENGINE_STATE.md).*
