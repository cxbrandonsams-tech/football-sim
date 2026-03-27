# PROJECT_CONTEXT.md
_Source of truth for project direction, locked constraints, and current priorities._

---

## Project Overview

**Name:** Football Sim
**Purpose:** A realistic American football general manager simulation game. Players manage a team across seasons — building rosters, making draft picks, signing free agents, and competing for championships. The focus is on feel, realism, and strategic depth over arcade mechanics.

**Architecture:**
- Backend: Express API + SQLite (`src/`) → deployed to Fly.io
- Frontend: React SPA + Vite (`web/`) → deployed to Vercel
- Auth: JWT Bearer tokens (bcryptjs password hashing)
- No shared server-side rendering; frontend fetches the full `League` object on nearly every action

---

## Current Phase: Playbooks & Formations

We are building a **route-based play system** organized around NFL-style formations and down/distance logic.

**Current Priorities (in order):**
1. Define offensive formations with personnel-based slots (X, Z, SLOT, TE, RB, FB, etc.)
2. Define defensive packages with package-specific depth chart slots
3. Design pre-authored plays that reference formation/package slots
4. Implement down & distance bucket logic to drive play selection
5. Map buckets to weighted playbooks; build selection flow
6. Wire play selection into the locked simulation engine

Realism over arcade behavior at every decision point.

---

## Locked Engine Statement

**The core simulation engine is COMPLETE and LOCKED.**

The engine (in `src/engine/`) has been calibrated and validated against a 1,000-game simulation benchmark. It produces realistic NFL-range statistics for passing, rushing, scoring, turnovers, and explosive plays.

**Do not change engine math, tuning constants, or probability weights unless explicitly requested.**
This includes but is not limited to:
- Scoring balance
- Yards balance
- Sack rates
- Turnover rates
- Explosive play rates
- Target share math
- Run/pass balance
- Any value in `src/engine/config.ts` (`TUNING`)

The playbook system feeds *play selection and slot assignments* into the engine — it does not alter the engine's internal math.

---

## Multiplayer Strategy Vision

Multiplayer strategy emerges from **deployment choices**, not from mechanical complexity. Specifically:

- **Formation selection** — which personnel packages to use
- **Play selection** — which plays to weight in each down/distance bucket
- **Roster usage** — which players are assigned to formation/package slots
- **Depth chart management** — who plays in which formation role

The engine resolves outcomes. Strategy lives above the engine, not inside it.

---

## Major Locked Design Decisions

| Decision | Status |
|---|---|
| Engine math is locked | Locked |
| Multiplayer strategy via deployment/roster/playbook | Locked |
| Offensive plays use formation slot references (X, Z, SLOT, TE, RB, FB) | Locked |
| Defensive plays use package slot references | Locked |
| Down/distance buckets drive play selection | Locked |
| Pre-authored plays only (no custom play creator) | Locked |
| Realism over arcade behavior | Locked |

---

## Explicitly Out of Scope (Do Not Build)

- Custom play creator / play editor
- Motion before the snap
- Audibles
- Hot routes
- Pre-snap shifts
- Coverage disguise systems
- Repetition penalties (may revisit later)
- Gameplans (removed, do not reintroduce)
- Playbook system (the old non-route-based one — replaced by this phase)
- Notification system (removed, do not reintroduce)
- Engine tuning (locked)

---

## Do Not Touch Without Explicit Approval

- `src/engine/config.ts` — all simulation tuning constants
- `src/engine/simulateGame.ts` — game loop
- `src/engine/passEngine.ts` — pass resolution
- `src/engine/runEngine.ts` — run resolution
- `src/engine/gameStats.ts` — stat accumulation
- Any probability weights, modifiers, or thresholds inside engine files

---

## How to Work in This Repo

1. **Read these docs first.** `PROJECT_CONTEXT.md`, `PLAYBOOKS_AND_FORMATIONS.md`, `IMPLEMENTATION_LOG.md` are the source of truth.
2. **Do not touch the engine.** If a feature seems to require engine changes, stop and discuss.
3. **Build vertical slices.** Complete working features, not partial systems.
4. **Update the docs.** After any meaningful design decision or implementation, update the relevant doc and add an `IMPLEMENTATION_LOG.md` entry.
5. **Realism first.** When in doubt, ask what an NFL team would do.
6. **Refer to `PLAYBOOKS_AND_FORMATIONS.md`** for all formation, package, play, and bucket rules.
7. **Refer to `docs/game-design.md`** for player rating rules — never add decorative stats.
