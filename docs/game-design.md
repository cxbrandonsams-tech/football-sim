# Football Simulation Game — Game Design Document (v1)

## Core Design Philosophy

### Principles
- No redundant stats
- Every rating must affect simulation
- Position-specific ratings only
- Minimal stat count (clarity > complexity)
- No generic attributes (strength, agility, awareness, etc.)
- Systems must create emergent behavior, not hard-coded archetypes

---

## Game Simulation Overview

### Passing Flow
1. Play concept (Short / Medium / Deep)
2. QB read progression (1–3 reads)
3. Separation (WR vs DB)
4. Throw (QB accuracy)
5. Catch (WR vs DB)
6. YAC
7. Safety influence on deep plays

### Run Flow
1. Blocking (OL vs DL)
2. Vision (RB)
3. Engagement (front seven)
4. Contact (Power vs Elusive)
5. Breakaway (Speed if open field)

---

## Quarterback (QB)

### Ratings
- Arm Strength
- Short Accuracy
- Medium Accuracy
- Deep Accuracy
- Processing
- Decision Making
- Mobility

### Hidden
- Pocket Presence

### Rules
- Processing = speed of reads
- Decision Making = correctness of choice
- Accuracy split by depth
- Mobility affects sacks/scramble only

---

## Running Back (RB)

### Ratings
- Vision
- Power
- Elusiveness
- Speed
- Ball Security

### Rules
- Speed only applies in open field
- Contact uses Power OR Elusiveness (not blended)

### Run Type Effects
- Inside = lower breakaway
- Outside = higher breakaway

---

## Wide Receiver (WR)

### Ratings
- Speed
- Route Running
- Hands
- YAC
- Size

### Rules
- Route Running determines getting open
- Speed affects deep routes and breakaway
- Hands is primary catch stat
- Size is a situational advantage (not required)
- Small WR can win contested catches

---

## Tight End (TE)

### Ratings
- Speed
- Route Running
- Hands
- YAC
- Size
- Blocking

### Role
- Hybrid receiver and blocker

---

## Offensive Line (OL)

### Positions
- OT
- OG
- C

### Ratings
- Pass Block
- Run Block
- Awareness

### Rule
Awareness = assignment correctness, not strength

---

## Defensive Line (DL)

### Positions
- DE
- DT

### Ratings
- Pass Rush
- Run Defense
- Discipline

### Rule
Discipline = gap responsibility

---

## Linebacker (LB)

### Ratings
- Run Defense
- Coverage
- Pass Rush
- Speed
- Pursuit

### Rules
- Speed = athleticism
- Pursuit = angles and tracking

---

## Defensive Backs (DB)

### Cornerback
- Coverage
- Ball Skills
- Speed
- Size

### Safety
- Coverage
- Ball Skills
- Speed
- Size
- Range

### Rules
- Coverage prevents separation
- Ball Skills create turnovers
- Size is minor and situational
- Range is safety-only

---

## Passing System

Separation:
WR Route Running (+ Speed deep) vs DB Coverage + Speed

Catch:
WR Hands + Size vs DB Ball Skills + Size

Deep:
Safety Range reduces big plays

---

## Run System

Flow:
OL → DL → RB Vision → Contact → Breakaway

Breakaway:
Only triggers if open field

---

## Coaching System

- HC, OC, DC
- Personality: Conservative / Balanced / Aggressive
- Traits: gameplay, development, team building

---

## Gameplan

Offense:
- Run/Pass balance
- Depth tendencies
- Tempo

Defense:
- Stop inside/outside run
- Stop short/deep pass

---

## Global Rules

- No stat overlap
- No hidden duplicate systems
- Every stat has one purpose
- Avoid feature creep

---

## Future Systems

- 2-minute drill
- Timeouts
- Trailing behavior
- Advanced QB reads
- Coaching traits expansion
- Hall of Fame
- Ring of Honor
