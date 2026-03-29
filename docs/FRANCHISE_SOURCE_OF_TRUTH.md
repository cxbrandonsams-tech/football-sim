# FRANCHISE SOURCE OF TRUTH

> **Status:** Active canonical spec for all non-engine game design and franchise-layer systems.
> **Last updated:** 2026-03-27
> **Scope:** League structure, coaching, awards, history, multi-league architecture, playbook design, and product philosophy. Does NOT cover engine math, play resolution, or tuning constants.

---

## How This Document Relates to Other Docs

| Document | Scope | Relationship |
|----------|-------|-------------|
| `docs/ENGINE_STATE.md` | Locked engine metrics and validation baselines | Engine math is frozen. This doc governs everything *above* the engine. |
| `docs/LOCKED_VALUES.md` | Frozen tuning constants (`config.ts`) | Config numbers that drive the engine. Do not modify without explicit approval. |
| `docs/TUNING_LOG.md` | Calibration history and rationale | Historical record of why engine values are what they are. |
| `docs/game-design.md` | Player ratings, position-specific stats, engine rules | The ratings-to-engine contract. Each rating must affect simulation. |
| `PLAYBOOKS_AND_FORMATIONS.md` | Formation definitions, play structure, bucket logic | The playbook-layer spec. Lives above the engine, below this doc. |
| `CLAUDE.md` | Developer instructions, codebase architecture | Working instructions for AI assistants. References this doc for design decisions. |

**Rule:** If this document and code disagree, this document wins for design intent. If this document and `ENGINE_STATE.md` or `LOCKED_VALUES.md` conflict on engine behavior, those engine docs win.

---

## 1. League Structure

**Status: LOCKED**

### Teams
- **32 teams** modeled after NFL counterpart cities.
- Each team represents a real NFL city (e.g., there is a team in Baltimore, a team in Kansas City, etc.).
- Team names and branding are fictional — they are not the actual NFL franchises.

### Conferences and Divisions
- Two conferences with **fictional names** (not AFC/NFC).
- Each conference has four divisions: **North, South, East, West** (matching NFL structure).
- Each division contains **4 teams**.
- Division and conference alignment follows the same geographic logic as the NFL.

### Roster
- **56-player roster** per team.
- Rosters are generated when a league is created using a procedural player generation system.
- All 16 positions are represented: QB, RB, WR, TE, OT, OG, C, DE, DT, OLB, MLB, CB, FS, SS, K, P.
- Depth charts are auto-generated on creation and can be manually adjusted.

### Season Structure
- **18-week regular season** (17 games + 1 bye per team).
- Schedule is generated based on division structure and previous-season standings.
- **Postseason bracket** follows NFL format (wildcard, divisional, conference, championship).

### Salary Cap
- Hard salary cap enforced across all teams.
- Contract system with salary and years remaining.
- Free agency with asking prices and AI bidding.

---

## 2. Coaching

**Status: LOCKED**

### Staff Structure
Every team has exactly three coaching positions:
- **Head Coach (HC)** — leadership, game management, scheme preferences for both sides.
- **Offensive Coordinator (OC)** — passing, rushing, offensive scheme.
- **Defensive Coordinator (DC)** — coverage, run defense, defensive scheme.

OC and DC may be vacant during the offseason only. Vacancies must be filled before the season starts.

### Coach Attributes
- **Overall (1-99)** — composite coaching ability. Provides a modest play-effectiveness boost. This is NOT a massive multiplier — a 90 OVR coach does not dominate a 50 OVR coach. The effect is subtle and probabilistic.
- **Personality** — conservative, balanced, or aggressive. Influences situational tendencies.
- **Trait** — one visible specialty (e.g., talent_evaluator, quarterback_guru, defensive_architect). Provides a targeted bonus in a specific area.
- **Scheme** — offensive scheme (balanced, short_passing, deep_passing, run_inside, run_outside) or defensive scheme (balanced, run_focus, speed_defense, stop_short_pass, stop_deep_pass, aggressive).

### Scheme Alignment
- When an OC's offensive scheme aligns with the HC's offensive preference, a slight effectiveness bonus is applied.
- Same for DC + HC defensive alignment.
- Misalignment is not penalized — it simply does not receive the bonus.
- The bonus is subtle. It should never be the dominant factor in a game outcome.

### Coach Carousel
- Coaches can be fired (OC/DC only during offseason).
- Unemployed coaches are available for hire from a shared pool.
- AI teams manage their own coaching staffs.

---

## 3. Awards and League Recognition

**Status: LOCKED**

### Annual Awards
| Award | Description |
|-------|------------|
| **MVP** | Most Valuable Player — league-wide |
| **Offensive Player of the Year** | Best offensive season performer |
| **Defensive Player of the Year** | Best defensive season performer |
| **Offensive Rookie of the Year** | Best first-year offensive player |
| **Defensive Rookie of the Year** | Best first-year defensive player |
| **Coach of the Year** | Best coaching performance |
| **Comeback Player of the Year** | Best bounce-back season |

### All-Pro Teams
- **1st Team All-Pro** — best player at each position.
- **2nd Team All-Pro** — second-best player at each position.

### Exclusions
- **No Pro Bowl.** The game does not include a Pro Bowl or all-star game event.

### Hall of Fame
- Players are inducted into the Hall of Fame after retirement based on career achievements.
- Ring of Honor is tracked per team for franchise legends.

---

## 4. Historical Data Retention

**Status: LOCKED**

The game retains long-term historical data across seasons. This data is never pruned and forms the basis for career tracking, records, and legacy features.

### Retained History
| Category | What Is Stored |
|----------|---------------|
| **Player career stats** | Per-season stat lines for every player, including after retirement |
| **Previous season stats** | Full stat breakdown per player per year (passing, rushing, receiving, defense) |
| **Team history** | Wins, losses, playoff appearances, championships, division finishes per season |
| **GM history** | Season records, trades made, draft picks, FA signings, legacy score, reputation |
| **Coach history** | Per-coach season records, scheme, overall rating over time |
| **Awards history** | All award winners by year, all All-Pro selections |
| **Champions log** | Championship winners and runners-up by year |
| **Hall of Fame** | Inducted players with career summaries |
| **Ring of Honor** | Per-team franchise legends |

### Design Principle
History is append-only. Completed seasons are never modified. The game should feel like a living sports universe with a real past.

---

## 5. Multi-League Architecture and Identity

**Status: LOCKED**

### User Model
- Users authenticate via username/password (JWT-based).
- A single user account can belong to **multiple independent leagues**.
- Each league is a completely separate universe — teams, rosters, history, and state are isolated.

### League Model
- Each league is stored as a single JSON blob in SQLite.
- Leagues have a commissioner (the creator) who controls advancement.
- Leagues support public/private visibility with invite codes.
- Each league can have multiple human-controlled teams (multiplayer) alongside AI teams.

### Isolation Guarantee
- No data leaks between leagues.
- A user's actions in League A have zero effect on League B.
- Team ownership, player state, draft classes, and history are entirely per-league.

---

## 6. Product Philosophy

**Status: LOCKED (principles) / ACTIVE (priorities)**

### Core Principles
1. **Realism over arcade behavior.** Every system should feel grounded in how real football works. When in doubt, choose the realistic option.
2. **Engine is complete and locked.** The simulation engine has been calibrated against NFL statistical baselines and validated. Do not suggest engine tuning unless explicitly requested.
3. **Vertical slices over partial systems.** Build complete, working features rather than half-finished frameworks. A finished small feature beats an unfinished large one.
4. **Simple and tunable.** Prefer designs that are easy to understand and adjust. Avoid over-engineering.
5. **Gameplay feel matters.** Perfect statistical accuracy is secondary to a satisfying gameplay experience.

### Current Development Phase
The engine layer is frozen. Active development is focused on the **strategy and presentation layers**:
- Playbook and formation system (see Section 7)
- Custom play creation (offensive and defensive)
- Game presentation (commentary, recaps, weekly reports)
- Scouting and draft experience (college, combine, draft room)
- Coaching intelligence and adaptation systems
- Dashboard and weekly prep workflow

### Shelved Systems
The following systems have been explicitly removed or shelved. Do not reintroduce without explicit request:
- **Legacy gameplans** — replaced by the tendencies/archetype system
- **Legacy notification system** — removed

---

## 7. Playbook and Play Selection Design

**Status: LOCKED (architecture) / EXTENSIBLE (content)**

### Architecture
Playbooks are the strategy layer that sits between the user's intent and the engine's play resolution. The engine only receives a `PlayType` (e.g., `inside_run`, `short_pass`, `deep_pass`) — it does not know about playbooks, formations, or routes.

### Play Design
- Plays are **route-based**, not global short/medium/deep concepts.
- Each play belongs to exactly one **formation** (defined by personnel grouping).
- Pass plays define routes per receiver slot, each tagged with a **depth** (SHORT, MEDIUM, DEEP).
- Run plays define a **ball carrier slot** (RB or FB).
- Each play maps to an **engineType** that the simulation engine understands.

### Playbook Structure
- A **Playbook** is a named, weighted collection of plays.
- Each entry has a `playId` and a `weight` (relative probability).
- Built-in playbooks are read-only. Users create custom playbooks.

### Offensive Plan
- An **Offensive Plan** maps every **down-and-distance bucket** (13 total) to a playbook ID.
- On each snap, the engine classifies the situation into a bucket, selects the assigned playbook, and picks a play using weighted random selection.

### Weight Modifiers (Selection Pipeline)
Play weights are modified by a chain of multipliers before the random pick:

```
finalWeight = baseWeight x tendency x repetition x context x meta
```

| Modifier | Source | Max Effect |
|----------|--------|-----------|
| Tendency | Team's gameplan sliders (7 fields) | +/-25% |
| Repetition | Recent play history (last 6 plays) | x0.4 to x1.0 |
| Context | Score, time, field position | +/-25% |
| Meta | League-wide offensive trends | +/-10% |

### Custom Plays
- Users can create up to **20 custom offensive plays** and **20 custom defensive plays** per team.
- Custom plays use the same `OffensivePlay` / `DefensivePlay` interfaces as built-in plays.
- Validation rules enforce balance: max 3 deep routes, at least 1 short/medium, valid slots for formation.
- Custom plays are available in the playbook editor alongside built-in plays.

### Defensive Selection
- Mirrors the offensive system: defensive plans map buckets to defensive playbooks.
- Defensive plays define a package (personnel), front, coverage scheme, and optional blitz.
- Defensive weights are modified by **opponent scouting** (pre-game and halftime) and **coach intelligence**.

### Deprecated
- The old `GameplanSettings` / `PlaycallingWeights` system is deprecated. It still exists in the codebase for backward compatibility but is not the active design. The **tendencies + archetype + playbook** system is the canonical play selection architecture.

---

## 8. Scouting and Draft

**Status: LOCKED (architecture) / EXTENSIBLE (content)**

### Draft Class
- ~300 prospects generated each offseason.
- Prospects have public fields (name, position, college, height, weight, combine results) and hidden fields (true ratings, true overall, true potential, true round).
- Hidden fields are stripped before sending data to the client.

### Scouting
- 3 scouting levels per prospect (10/20/35 points).
- Each level reveals more accurate projected round, strengths, weaknesses, and scout notes.
- Scout quality (head scout's overall rating) affects accuracy of revealed information.
- Scouting budget is per-season, derived from team budget allocation.

### Combine / Pro Day
- Athletic testing results (40-yard, bench, vertical, broad jump, 3-cone, shuttle) generated alongside draft class.
- Results are public (no scouting required).
- Stock movement (rising/falling/neutral) influences scouting projected rounds by +/-0.5.

### College Layer
- 5 conferences (SEC, Big Ten, ACC, Big 12, Pac-12), 10 teams each.
- Standings and stat leaders generated (cosmetic — no college games simulated).
- Prospects are assigned to conference teams.

### Draft
- 7-round draft with pick order based on previous-season standings.
- Pick trading supported via the existing trade infrastructure.
- AI teams draft based on team needs and prospect ratings.

---

## 9. Coaching Intelligence and Adaptation

**Status: LOCKED (architecture) / EXTENSIBLE (tuning)**

### Pre-Game Scouting
- Defenses build a scouting profile from the opponent's season-long `playStats`.
- Profile includes pass rate, run rate, deep rate, short rate.
- Defensive play weights are adjusted based on opponent tendencies (max +/-20%).

### Halftime Adjustments
- First-half offensive data is tracked separately per team.
- At halftime, defenses rebuild scouting profiles from live game data.
- Halftime adjustments are 1.5x stronger than pre-game scouting.

### Coach Intelligence
- Derived from DC overall (70%) + HC game management (30%) + defensive_architect trait bonus.
- Scales scouting intensity (factor 0.3-1.0) and adds noise (0-15%).
- Better coaches make more accurate and consistent adjustments. Worse coaches are noisier.

### League Meta
- League-wide pass/run/deep rates computed each week from all teams' play stats.
- Counter-meta multiplier gives a subtle boost (+/-10%) to plays that go against the league trend.
- Creates natural oscillation: pass-heavy meta -> run becomes slightly more effective -> meta rebalances.

---

## 10. Game Presentation

**Status: ACTIVE / EXTENSIBLE**

### Play-by-Play
- Natural language commentary with 3-5 varied templates per play type and result.
- Deterministic seeding prevents re-render flickering.
- Play explanation system shows weight modifiers when toggled on.

### Postgame
- Drive summaries reconstructed from play events.
- Key moment tagging (touchdowns, turnovers, big plays, long drives).
- Headline + recap paragraph generation.
- Gameplan review scoring (effective/mixed/poor).

### Weekly Reports
- Auto-generated headlines from standings, game results, stats, and meta.
- Weekly Prep panel with opponent scouting and gameplan recommendation.
- Performance Notes showing best/worst plays and meta comparison.

### Season-Level
- Coaching Grade (A-F) from cumulative game performance scores.
- Coach Reputation (0-100) with tier labels, updated at season end.
- Year-End Report with headline, highlights, and outlook.

---

## Future Considerations

The following are NOT currently implemented but are natural extension points. Do not build these without explicit request.

- **Motion / pre-snap shifts** — formation adjustments before the snap.
- **Audibles** — changing the called play at the line of scrimmage.
- **Hot routes** — individual route adjustments per play.
- **Future-year draft pick trading** — trading picks for years beyond the current draft.
- **Coaching hiring/firing consequences** — reputation affecting available coaching candidates.
- **Fan/media narrative system** — generated storylines based on performance trends.
- **Full college simulation** — simulating college games (currently cosmetic standings only).
- **Overtime rules** — currently ties go to the higher seed in playoffs.
- **Player holdouts / contract disputes** — off-field drama affecting roster management.

---

*This document is the canonical source of truth for franchise-layer game design. When in doubt about a design decision at the strategy, presentation, or management layer, defer to this document. For engine-level questions, defer to `ENGINE_STATE.md` and `docs/game-design.md`.*
