# DEVELOPMENT ROADMAP

> **Updated:** 2026-03-29
> **Engine status:** LOCKED — no play-resolution tuning.
> **Current phase:** Polish, presentation, and franchise experience.

---

## 1. Current Status

The simulation engine is calibrated and frozen. See `ENGINE_STATE.md` for final metrics.

The project has completed:

| System | Status |
|--------|--------|
| Play-resolution engine (pass + run pipelines) | LOCKED |
| Position-specific ratings (16 positions) | LOCKED |
| Playbook & formation system (offense + defense) | COMPLETE |
| Custom play creator (offense + defense) | COMPLETE |
| Play selection pipeline (tendencies, repetition, context, meta) | COMPLETE |
| Opponent scouting & halftime adjustments | COMPLETE |
| Coach intelligence scaling | COMPLETE |
| League meta evolution | COMPLETE |
| Play effectiveness tracking | COMPLETE |
| Natural language commentary | COMPLETE |
| Drive summaries & postgame recaps | COMPLETE |
| Weekly league reports & headlines | COMPLETE |
| Gameplan UI (presets, recommendations, weekly prep) | COMPLETE |
| Coaching grade & reputation | COMPLETE |
| Season summary / year-end report | COMPLETE |
| College football layer (conferences, standings, leaders) | COMPLETE |
| Combine / Pro Day system | COMPLETE |
| Draft room UI with feedback & tension | COMPLETE |
| Draft pick trading (during draft) | COMPLETE |
| College-Scouting integration | COMPLETE |
| Penalty system (6 types, accept/decline, discipline rating) | COMPLETE |
| PAT / 2-point conversion system | COMPLETE |
| Talent gap compression | COMPLETE |
| Trailing team boost (prevent defense) | COMPLETE |
| Special teams scoring (return TDs, blocked kicks) | COMPLETE |
| Pick-six and fumble return TDs | COMPLETE |
| Safety detection (1-yard threshold) | COMPLETE |
| Clock model (real 15-min quarters) | COMPLETE |
| Two-minute drill with timeouts and spikes | COMPLETE |
| Full UI overhaul with design system | COMPLETE |
| Team logos (32 teams, TeamLogo component) | COMPLETE |
| Football field visualization with broadcast commentary | COMPLETE |
| Hall of Fame (era-relative scoring) | COMPLETE |
| Ring of Honor (team-specific legacy) | COMPLETE |
| Auth hardening (stale token handling) | COMPLETE |
| NFL overtime rules (regular season + postseason) | COMPLETE |
| Play-by-play broadcast experience (10 features) | COMPLETE |

---

## 2. What Is Locked / Out of Scope

**Engine tuning is CLOSED.** Do not modify:
- Any play-resolution constants in `config.ts`
- `offenseAdvantage`, `baseSackChance`, `coverageResistance`, `baseYACYards`
- Explosive play system (`bigPlay`, `breakawayUpgrade*`, `yacBreakaway*`)
- Red zone penalties
- `TUNING.personnel.roleMult`, `targetWeightExponent`, `targetWeightNoise`

See `LOCKED_VALUES.md` for the full frozen config list.

**Do not reintroduce:**
- Legacy gameplans (`GameplanSettings` / `PlaycallingWeights`) — replaced by tendencies/archetypes
- Legacy notification system — removed

---

## 3. Current Phase: Polish & Franchise Experience

Active development focus areas:
- Expanding the play library (more formations, more plays per formation)
- Roster management workflow improvements
- Trade AI and free agency depth
- Multi-season storylines and franchise identity

---

## 4. Immediate Priorities

These are the highest-value next tasks:

### 4.1 Expand the Play Library
- Add more formations (Trips, Bunch, Pistol, Spread, etc.)
- Add more plays per existing formation (target 8-12 per formation)
- Add more defensive plays and packages
- Ensure variety across run/pass/play-action concepts

### 4.2 Roster Management Polish
- Cut/sign workflow, practice squad, roster limits UI
- In-season free agent pickups
- Injury replacement workflow

### 4.3 Trade AI Improvements
- Need-based evaluation, win-now vs rebuild logic
- Counter-offer system
- Future pick valuation

---

## 5. Near-Term Roadmap

| Priority | System | Description |
|----------|--------|-------------|
| 1 | Play library expansion | More formations, plays, and defensive packages |
| 2 | Roster management polish | Cut/sign workflow, practice squad, roster limits UI |
| 3 | Free agency improvements | Market dynamics, bidding wars, AI negotiation depth |
| 4 | Trade AI improvements | Need-based evaluation, win-now vs rebuild logic |
| 5 | Enhanced draft experience | Mock drafts, trade-up AI, draft grades |
| 6 | Multi-season storylines | Rivalries, dynasty tracking, narrative arcs |

---

## 6. Medium-Term Roadmap

| System | Description |
|--------|-------------|
| Player archetypes | Playstyle identities beyond ratings (pocket passer, power back, press-man CB) |
| Progression system review | Development curves, breakout seasons, aging, decline over 10-year franchise |
| Contract/cap depth | Cap pressure, dead money, extensions, restructures |
| History & records UI | Career stat browsers, franchise records, league-wide records |

---

## 7. Deferred Systems

These are not planned for near-term development. Do not build without explicit request.

- Motion / pre-snap shifts
- Audibles (changing the play at the line)
- Hot routes (per-play route adjustments)
- Full college simulation (currently cosmetic only)
- ~~Overtime rules~~ — DONE (NFL modified sudden death, regular + postseason)
- Player holdouts / contract disputes
- Fan/media narrative system
- Coaching hiring/firing consequences (reputation is tracked but has no gameplay effect yet)
- Future-year draft pick trading beyond the current draft

---

## Related Documents

| Document | What It Covers |
|----------|---------------|
| `ENGINE_STATE.md` | Final engine metrics and validation baselines |
| `LOCKED_VALUES.md` | Frozen tuning constants |
| `TUNING_LOG.md` | Calibration change history |
| `game-design.md` | Ratings architecture and simulation pipeline |
| `FRANCHISE_SOURCE_OF_TRUTH.md` | League structure, coaching, awards, playbook design, product philosophy |
| `HALL_OF_FAME_AND_RING_OF_HONOR.md` | Era-relative legacy scoring, induction thresholds, UI display |

---

*This roadmap reflects the state of the project as of 2026-03-29. Update as priorities shift.*
