# DEVELOPMENT ROADMAP

> **Updated:** 2026-03-27
> **Engine status:** LOCKED — no play-resolution tuning.
> **Current phase:** Playbooks, formations, and strategy systems.

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

## 3. Current Phase: Strategy & Presentation

Active development focus areas:
- Expanding the play library (more formations, more plays per formation)
- Deepening the weekly coaching workflow
- Polishing the draft-to-season lifecycle
- Building out the franchise management experience

---

## 4. Immediate Priorities

These are the highest-value next tasks:

### 4.1 Expand the Play Library
- Add more formations (Trips, Bunch, Pistol, Spread, etc.)
- Add more plays per existing formation (target 8-12 per formation)
- Add more defensive plays and packages
- Ensure variety across run/pass/play-action concepts

### 4.2 Live Game Experience
- Center-field visualization with ball tracking
- Around-the-league score panels during a week's games
- Broadcast-style presentation with scoreboard and game state
- Clean, readable, not graphically complex

### 4.3 Schedule & Matchup UI
- Visual schedule with results, upcoming games, bye weeks
- Matchup preview cards with head-to-head context
- League-wide schedule browser

---

## 5. Near-Term Roadmap

| Priority | System | Description |
|----------|--------|-------------|
| 1 | Play library expansion | More formations, plays, and defensive packages |
| 2 | Live game broadcast UI | Field visualization, scoreboard, around-the-league |
| 3 | Schedule & matchup experience | Visual schedule, preview cards |
| 4 | Roster management polish | Cut/sign workflow, practice squad, roster limits UI |
| 5 | Free agency improvements | Market dynamics, bidding wars, AI negotiation depth |
| 6 | Trade AI improvements | Need-based evaluation, win-now vs rebuild logic |

---

## 6. Medium-Term Roadmap

| System | Description |
|--------|-------------|
| Player archetypes | Playstyle identities beyond ratings (pocket passer, power back, press-man CB) |
| Progression system review | Development curves, breakout seasons, aging, decline over 10-year franchise |
| Contract/cap depth | Cap pressure, dead money, extensions, restructures |
| History & records UI | Career stat browsers, franchise records, league-wide records |
| Enhanced draft experience | Mock drafts, trade-up AI, draft grades |
| Multi-season storylines | Rivalries, dynasty tracking, narrative arcs |

---

## 7. Deferred Systems

These are not planned for near-term development. Do not build without explicit request.

- Motion / pre-snap shifts
- Audibles (changing the play at the line)
- Hot routes (per-play route adjustments)
- Full college simulation (currently cosmetic only)
- Overtime rules (currently ties go to higher seed)
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

---

*This roadmap reflects the state of the project as of 2026-03-27. Update as priorities shift.*
