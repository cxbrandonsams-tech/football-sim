# Football Simulation Game Design

Version: 1.0  
Last Updated: 2026-03-24

---

# Player Ratings System (v3)

## Core Design Philosophy

- Each rating has one clear purpose  
- No redundant or overlapping stats  
- Ratings map directly to engine phases  
- Advanced behavior is handled by logic, not excess ratings  
- Hidden derived stats are used where appropriate to reduce UI clutter  

---

## Quarterback (QB)

### Core Ratings

**Accuracy**  
Determines ball placement and catchability  

**Arm Strength**  
Determines velocity, throw viability, and ability to fit passes into tight windows  
(Applies to short, medium, and deep throws with increasing impact)  

**Processing**  
Determines how well the QB reads defenses and identifies open targets  

**Decision Making**  
Determines risk-taking, target selection, and interception likelihood  

---

## Running Back (RB)

### Core Ratings

**Vision**  
Determines ability to find running lanes and make correct cuts  

**Elusiveness**  
Ability to make defenders miss in space  

**Power**  
Ability to break tackles and gain yards through contact  

**Speed**  
Breakaway ability and long-run potential  

---

## Wide Receiver (WR) / Tight End (TE)

### Core Ratings

**Route Running**  
Determines ability to create separation vs coverage  

**Speed**  
Impacts separation at all levels:
- Minor on short routes  
- Moderate on medium routes  
- Major on deep routes  

**Ball Skills**  
Ability to catch the ball, especially in contested situations  

**YAC (Yards After Catch)**  
Ability to gain additional yards after securing the catch  
Includes elusiveness, vision, and tackle-breaking in space  

---

## Offensive Line (OL)

### Core Ratings

**Pass Block**  
Ability to protect the QB against pass rush  

**Run Block**  
Ability to create lanes in the run game  

**Awareness**  
Assignment correctness (blitz pickup, stunts, pulling, etc.)  
Poor Awareness results in missed or delayed assignments  

---

## Defensive Line (DL)

### Core Ratings

**Pass Rush**  
Ability to generate pressure on the QB  

**Run Defense (Tackling)**  
Ability to stop ball carriers and control gaps  

**Discipline**  
Consistency and assignment integrity (contain, gap control, penalties)  

---

## Linebacker (LB)

### Core Ratings

**Run Defense (Tackling)**  
Ability to stop the run and finish plays  

**Pass Rush**  
Ability to pressure the QB when blitzing  

**Coverage**  
Ability to defend against the pass (applies to both man and zone responsibilities)  

**Speed**  
Impacts pursuit, coverage range, and closing ability  

**Awareness**  
Determines reaction speed, play recognition, and zone effectiveness  

**Discipline**  
Assignment integrity and reaction consistency  

---

## Cornerback (CB)

### Core Ratings

**Man Coverage**  
Ability to stay with receivers in man-to-man coverage  

**Zone Coverage**  
Ability to defend assigned areas and react to route concepts  

**Ball Skills**  
Ability to contest passes, deflect, and create turnovers  

**Speed**  
Ability to match receivers and recover on deep routes  

**Tackling**  
Ability to limit YAC and contribute in run support  

**Awareness**  
Determines reaction speed, route recognition, and zone discipline  

---

## Safety (S)

### Core Ratings

**Zone Coverage**  
Ability to defend deep zones and read developing plays  

**Man Coverage**  
Ability to cover receivers when matched up  

**Ball Skills**  
Ability to make plays on the ball (INTs, deflections)  

**Speed**  
Ability to cover ground and recover in deep coverage  

**Tackling**  
Ability to stop plays in the open field  

**Awareness**  
Determines reaction timing, play recognition, and positioning  

---

## Global / Secondary Rating

### Discipline (All Players Except QB)

Represents consistency, composure, and assignment reliability  

Impacts:
- Penalties  
- Assignment breakdown frequency  
- Mistakes under pressure  

---

## Hidden / Derived Ratings (Engine Only)

### Range (Safeties Only — Hidden)

Represents a defender’s ability to effectively cover large areas of the field, particularly in deep coverage  

**Formula (tunable):**
Range = (Speed * 0.6) + (Awareness * 0.4)

**Used For:**
- Deep zone coverage effectiveness  
- Over-the-top help defense  
- Closing on deep passes  
- Preventing explosive plays  

**Not Used For:**
- Man coverage  
- Short zone reactions  
- Tackling or run defense  

---

## Design Notes

- Ratings are intentionally limited to avoid stat bloat  
- Each stat maps cleanly to a phase in the engine  
- Hidden derived stats allow deeper simulation without UI complexity  
- System is built for tuning via weight adjustments, not structural changes  

---

# Engine Details

## Core Philosophy

The game engine simulates football outcomes through layered interactions rather than isolated dice rolls.

Each play resolves through the following phases:

1. Pre-Snap Context  
2. Protection vs Pass Rush  
3. Route Development / Coverage Interaction  
4. QB Decision & Throw Execution  
5. Catch Resolution  
6. After Catch / Run Outcome  

Each phase uses a focused subset of ratings to avoid redundancy while maintaining realism.

---

## 1. Pre-Snap Context

- Offensive play concept (Short / Medium / Deep)  
- Read progression (1–3 reads)  
- Defensive call (Man, Zone, or Mixed)  
- Player assignments (routes, coverage responsibilities)  
- Leverage and help structure  

---

## 2. Protection vs Pass Rush

### Offensive Factors
- Pass Block (OL)  
- Awareness (OL)  

### Defensive Factors
- Pass Rush (DL / LB)  
- Awareness / Discipline  

### Outcomes
- Clean pocket  
- Gradual pressure  
- Immediate pressure  

Impacts:
- QB timing  
- Throw accuracy  
- Decision-making  

---

## 3. Route Development & Coverage Interaction

### Speed Scaling (All Depths)

- Short → Minor impact  
- Medium → Moderate impact  
- Deep → Major impact  

---

### Man Coverage

Compare:

- WR: Route Running + Speed  
- DB: Man Coverage + Speed + Awareness  

Outcomes:
- Tight coverage  
- Slight separation  
- Clear separation  
- Defender in phase  

---

### Zone Coverage

Uses:
- Zone Coverage  
- Awareness (PRIMARY)  
- Speed  
- Safety Range  

Behavior:
- Routes stress zones  
- Defenders react, pass off, or get pulled  

Outcomes:
- Window opens  
- Window closes  
- Late reaction  
- Blown zone  

---

### Mixed Coverage

Each defender has:
- Coverage Type (Man / Zone)  
- Assignment  
- Help responsibility  

Resolved independently per defender  

---

## 4. QB Decision & Throw Execution

### QB Ratings
- Processing  
- Decision Making  

### Throw Ratings
- Accuracy  
- Arm Strength  

---

### Arm Strength Scaling

- Short → Minor  
- Medium → Moderate  
- Deep → Major  

Impacts:
- Ball travel time  
- Window tightness  
- Defender recovery  

---

## 5. Catch Resolution

### Open Catch
- WR ability  
- QB accuracy  
- Defender proximity  

### Contested Catch

Compare:
- WR Ball Skills  
- DB Ball Skills + positioning  

**Rule:**
- Route Running does NOT significantly impact contested catches  

---

## 6. After Catch (YAC)

### YAC Rating

Represents:
- Elusiveness  
- Vision  
- Tackle breaking  

### Defensive Response

Uses:
- Pursuit  
- Tackling  

---

## Coverage Rating Structure

### Defensive Backs
- Man Coverage  
- Zone Coverage  
- Ball Skills  
- Speed  
- Tackling  
- Awareness  

### Safeties
- Range (derived, hidden)  

---

## Receiver Ratings

- Route Running  
- Speed  
- Ball Skills  
- YAC  

---

## Engine Flow Summary

1. Protection resolves  
2. Routes vs coverage  
3. Separation determined  
4. QB reads progression  
5. Throw executed  
6. Catch resolved  
7. YAC determined  

---

## Design Principles

- No redundant stats  
- Clear phase separation  
- Tunable system  
- Realistic without unnecessary complexity  


# Future System: Playbooks and Play Calling

## Design Goal
The long-term playbook system should give users meaningful control over offensive identity without requiring manual play calling every snap. Users will build custom playbooks from a large shared database of available plays, and the simulation engine will call from those playbooks based on down and distance.

This system is intentionally planned as a later feature. The current priority is building a strong, believable simulation engine first.

---

## Core Vision

### 1. Plays are route-based, not globally tagged as Short / Medium / Deep
A play should not be labeled as only “Short,” “Medium,” or “Deep.”

Instead, each eligible receiver route within the play has its own route type and depth classification.

**Example: Singleback-Big: Quick Slants**
- WR1: Slant — Short  
- TE: Flat — Short  
- WR2: Go — Deep  

This allows one play to contain a mix of short, medium, and deep concepts, which better matches real football and gives the engine more realistic read and coverage interactions.

---

### 2. Users create playbooks from a large play database
The game should eventually include a large library of available plays.

Users will:
- Browse the available play pool  
- Select plays they want in their team’s playbook  
- Build a custom offensive identity from those plays  

The system should support broad variety so different teams can feel meaningfully different.

---

### 3. Playbooks are organized by down and distance
Users should assign plays into situational buckets rather than using one flat list.

**Examples:**
- 1st & 10  
- 2nd & Short  
- 2nd & Medium  
- 2nd & Long  
- 3rd & Short  
- 3rd & Medium  
- 3rd & Long  
- 4th & Short  
- Goal Line  
- Red Zone  
- 2-Minute Drill  
- Backed Up  

The CPU will call plays from the appropriate situational bucket during simulation.

---

### 4. Plays have call weights
Within each down-and-distance bucket, plays should have configurable weights.

This allows users to influence call frequency without requiring exact percentages.

**Example:**
- Inside Zone — weight 10  
- Slant Flat — weight 8  
- Four Verticals — weight 2  

The CPU should randomly select from the bucket using these weights.

This creates both identity and variation.

---

### 5. Repetition should create a penalty
Repeatedly calling the same play too often should create diminishing effectiveness.

This prevents unrealistic abuse and encourages variety.

Repetition penalties can affect:
- Defensive anticipation  
- Reduced separation  
- Faster defensive reactions  
- Lower overall play success  

The goal is not to make a play unusable, but to reduce effectiveness if overused.

---

## Relationship to the Engine
This system should sit on top of the simulation engine, not replace it.

The engine will still resolve:
- Protection  
- Separation  
- Coverage interaction  
- QB decision making  
- Throw quality  
- Catch outcome  
- YAC  
- Run success  

The playbook system determines:
- Which play is called  
- Which routes are run  
- Which players are involved in the concept  
- How often certain concepts appear in specific situations  

---

## Current Development Priority
This system is important, but not the current priority.

For now:
- Focus remains on building a strong simulation engine  
- The existing Gameplan system should be removed from the long-term design  
- The current Playbook system should also be removed from the long-term design  
- Both will be reintroduced later in a redesigned form  

The goal is a polished simulation engine before adding user-driven playbook customization.

---

## Future Implementation Notes
When implemented, this system should support:

- A large predefined database of offensive plays  
- Route-by-route tagging for each eligible receiver  
- Situational playbook buckets by down and distance  
- Weighted play selection  
- Repetition penalties  
- Easy user customization  
- CPU teams using the same system  

---

## Summary
The future playbook system will be a customizable, situational, weighted play-calling framework built from a large play database. Plays are defined by the individual routes within them rather than a single depth label. This system will be implemented after the core simulation engine is fully stable and refined.
