# ARCHITECTURE

> **Last updated:** 2026-03-27
> **Audience:** Engineers working on this codebase. Assumes familiarity with TypeScript, Express, React.

---

## 1. System Overview

The application is a football franchise simulation — a turn-based strategy game where users manage teams, configure playbooks, scout prospects, and simulate seasons. It runs as two completely independent services:

| Layer | Technology | Host | Purpose |
|-------|-----------|------|---------|
| **Backend** | Express + TypeScript + SQLite | Fly.io (`football-sim`, `iad` region) | Game logic, persistence, auth, API |
| **Frontend** | React + Vite SPA | Vercel (static deploy) | All UI, no server-side rendering |

The frontend talks to the backend exclusively via REST (`VITE_API_URL`). There is no shared runtime, no SSR, no WebSocket connection.

```
┌──────────────┐         REST/JSON          ┌──────────────────────┐
│  React SPA   │ ◄────────────────────────► │  Express API Server  │
│  (Vercel)    │    Authorization: Bearer    │  (Fly.io)            │
│              │                             │                      │
│  App.tsx     │                             │  server.ts           │
│  api.ts      │                             │  engine/*            │
│  types.ts    │                             │  models/*            │
└──────────────┘                             │  data/*              │
                                             │                      │
                                             │  ┌────────────────┐  │
                                             │  │ SQLite (better- │  │
                                             │  │ sqlite3)        │  │
                                             │  │ /data/football- │  │
                                             │  │ sim.db          │  │
                                             │  └────────────────┘  │
                                             └──────────────────────┘
```

---

## 2. Core Layers

### 2.1 Simulation Engine (`src/engine/`)

The engine resolves individual plays via sequential phase pipelines. It receives a `Team` pair and a `PlayType`, and returns a `PlayEvent` with yards, result, and player attributions.

**Key files:**
- `simulateGame.ts` — drives the full game loop (quarters, downs, clock, special teams)
- `passEngine.ts` / `runEngine.ts` — resolve individual pass and run plays (not directly; these are called via `simulatePlay`)
- `config.ts` — all tuning constants (`TUNING` object). **LOCKED. Do not modify.**
- `playSelection.ts` — offensive play selection (tendencies, repetition, context, meta multipliers)
- `defensiveSelection.ts` — defensive play selection (scouting, halftime, coach intelligence)
- `gameStats.ts` — box score builder from `PlayEvent[]`

**Critical invariant:** The engine only sees `PlayType` values (`inside_run`, `outside_run`, `short_pass`, `medium_pass`, `deep_pass`). It has no knowledge of playbooks, formations, or routes. All strategy-layer logic must resolve to a `PlayType` before entering the engine.

### 2.2 League / Domain Model (`src/models/`)

The `League` interface is the root aggregate. It contains everything:

```
League
├── teams: Team[]
│   ├── roster: Player[]
│   ├── depthChart: DepthChart
│   ├── coaches: CoachingStaff
│   ├── tendencies: TeamTendencies
│   ├── offensivePlan?: OffensivePlan
│   ├── defensivePlan?: DefensivePlan
│   ├── playStats?: Record<string, PlayEffStats>
│   ├── customOffensivePlays?: OffensivePlay[]
│   ├── customDefensivePlays?: DefensivePlay[]
│   ├── customOffensivePlaybooks?: Playbook[]
│   ├── customDefensivePlaybooks?: DefensivePlaybook[]
│   └── scoutingData?: Record<string, ProspectScoutingState>
├── currentSeason: Season
│   └── games: Game[]
│       ├── events?: PlayEvent[]
│       └── boxScore?: GameBoxScore
├── freeAgents: Player[]
├── draftClass?: DraftClass
├── collegeData?: CollegeData
├── draft?: Draft
├── playoff?: PlayoffBracket
├── news: NewsItem[]
├── tradeProposals: TradeProposal[]
├── history: LeagueHistory
├── seasonHistory: SeasonRecord[]
├── gmCareer?: GmCareer
├── metaProfile?: MetaProfile
├── draftPickOwnership: Record<string, string>
└── currentSeasonStats: Record<string, PlayerSeasonStats>
```

**Assumption:** The entire `League` is deserialized, mutated in-memory, and re-serialized on every write. This is a deliberate simplicity trade-off. It works because leagues are single-digit MB and writes are infrequent (user actions, not real-time).

### 2.3 Persistence (`better-sqlite3`)

**Database:** Single SQLite file at `/data/football-sim.db` (Fly.io persistent volume).

**Tables:**
| Table | Schema | Notes |
|-------|--------|-------|
| `leagues` | `id TEXT PRIMARY KEY, stateJson TEXT` | Each league is one JSON blob |
| `users` | `id, username (COLLATE NOCASE), passwordHash` | Auth accounts |

**Access pattern:**
- `dbGetLeague(id)` — parse JSON from `stateJson` column
- `dbSaveLeague(league)` — serialize full `League` to JSON, write to `stateJson`

There is no ORM, no migrations framework, no query builder. Schema changes require manual `ALTER TABLE` or DB recreation.

**Risk:** The JSON blob approach means there is no referential integrity, no partial updates, and no indexing within league data. This is acceptable for the current scale (single-digit concurrent users per league). It would not scale to hundreds of simultaneous writers without a redesign.

### 2.4 Authentication & Multi-League

**Auth:**
- JWT Bearer tokens, 30-day lifetime
- Signed with `JWT_SECRET` environment variable
- Passwords hashed with `bcryptjs`
- No sessions, no cookies (`credentials: false` in CORS)
- `requireAuth` middleware attaches `{ userId, username }` to the request

**Multi-league:**
- A user can create or join multiple independent leagues
- Each league stores `commissionerId` (the creator) and per-team `ownerId` (claimed by users)
- `getUserTeam(league)` resolves the requesting user's team within a specific league

### 2.5 API Server (`src/server.ts`)

Single Express application with ~60 route handlers. All league-mutating routes follow the same pattern:

```typescript
app.post('/league/:id/some-action', requireAuth, (req, res) => {
  const league = getLeagueOrFail(req, res);  // load + auth check
  if (!league) return;
  // ... validate input ...
  // ... mutate league in memory ...
  dbSaveLeague(updated);
  sendLeague(res, updated);  // sanitize + respond
});
```

**`sendLeague`** calls `sanitizeLeagueForClient` before responding, which strips hidden prospect fields (`trueOverall`, `trueRatings`, `truePotential`, `trueRound`) to prevent scouting data leaks.

**CORS:** Origin whitelist from `ALLOWED_ORIGINS` env var. When `ALLOW_VERCEL_PREVIEWS=true`, any `*.vercel.app` origin is allowed.

### 2.6 Frontend (`web/src/`)

Single-page React application. Nearly all logic lives in one file:

- `App.tsx` (~10,000 lines) — all views as functions, `tab` state variable drives navigation
- `api.ts` — typed wrappers for every backend endpoint
- `types.ts` — TypeScript interfaces mirroring backend models (manually kept in sync)
- `App.css` — all styles in one file, dark theme

**Navigation model:** A `tab` state variable (`'dashboard' | 'roster' | 'draft' | ...`) determines which view function renders. There is no router library. URL does not change with navigation.

**Data flow:** The `league` object is fetched once on load and held in React state. Every mutation calls an API, receives the updated league, and calls `setLeague()`. The entire UI re-derives from the current `league` state.

---

## 3. Multi-League Isolation

### League-Scoped (fully isolated per league)

Everything inside the `League` object:
- Teams, rosters, depth charts, coaches
- Season state, games, play events, box scores
- Draft class, college data, scouting state
- Trade proposals, free agents, news
- History, awards, standings
- PlayStats, metaProfile, tendencies
- GM career, reputation
- Draft pick ownership

### User-Scoped (spans leagues)

- User account (id, username, password hash)
- JWT token (authenticates across all leagues)
- League membership list (which leagues the user belongs to)

### Global (shared, not league-specific)

- Static data libraries: `OFFENSIVE_PLAYS`, `DEFENSIVE_PLAYS`, `OFFENSIVE_FORMATIONS`, `DEFENSIVE_PACKAGES`, `PLAYBOOKS`, `DEFENSIVE_PLAYBOOKS`, `COLLEGE_CONFERENCES`
- Engine configuration: `TUNING` constants in `config.ts`
- Name pools for player/coach/prospect generation

**Invariant:** No mutable global state exists. All mutation happens within a league blob. Two leagues cannot affect each other through any code path.

---

## 4. Documentation Ownership Map

| Document | Owns | Do Not Duplicate Here |
|----------|------|----------------------|
| `ENGINE_STATE.md` | Final engine metrics, validation baselines, accepted gaps | Tuning constants (see LOCKED_VALUES) |
| `LOCKED_VALUES.md` | Frozen `config.ts` values with lock status | Engine behavior descriptions |
| `TUNING_LOG.md` | Chronological calibration change history | Current values (see LOCKED_VALUES) |
| `game-design.md` | Player ratings, overall formulas, pass/run pipeline phases | Playbook design, league structure |
| `FRANCHISE_SOURCE_OF_TRUTH.md` | League structure, coaching, awards, history, playbook architecture, product philosophy | Engine math, rating formulas |
| `NEXT_STEPS.md` | Development roadmap, priorities, deferred systems | Design specifications |
| `PLAYBOOKS_AND_FORMATIONS.md` | Formation definitions, play structure, bucket logic | Engine pipeline details |
| `CLAUDE.md` | Developer instructions, codebase conventions, deployment | Long-term design decisions |

**Rule:** Each fact should live in exactly one document. If two documents say conflicting things about the same topic, the designated owner wins.

---

## 5. Safety Guidelines

### Engine Calibration

The simulation engine is validated against NFL statistical baselines (1000+ game sample). All constants in `config.ts` are frozen.

- **Never** modify values listed in `LOCKED_VALUES.md`
- **Never** add new engine math (sack calculations, completion formulas, yard distributions) without explicit approval
- Play selection weight modifiers (tendencies, repetition, context, meta, scouting) are safe to adjust — they sit above the engine and only affect which `PlayType` is chosen, not how it resolves

### Data Integrity

- **`sanitizeLeagueForClient` must be called on every response** that includes league data. Bypassing it leaks hidden prospect ratings to the client.
- **`draftPickOwnership` keys are format-sensitive:** `"${year}:${round}:${originalTeamId}"`. Malformed keys cause silent failures in draft order resolution.
- **Type sync is manual.** Backend types in `src/models/` and frontend types in `web/src/types.ts` must be kept in sync by hand. There is no codegen or shared type package.

### Source of Truth Discipline

- Do not create new documentation that overlaps with existing docs (see ownership map above)
- If a design decision is made, record it in the appropriate document, not in code comments
- `IMPLEMENTATION_LOG.md` records what was built and why — it is a changelog, not a spec

---

## 6. Future Considerations

### Persistence Scaling

The JSON-blob-per-league approach has a ceiling. If leagues grow beyond ~10 MB or concurrent writers exceed single-digit users, consider:
- Splitting hot data (games, events) into separate tables
- Using transactions for atomic multi-field updates
- Adding an in-memory cache with write-through

**Assumption:** Current scale (< 10 leagues, < 5 concurrent users per league) is well within SQLite's capability.

### Frontend Architecture

`App.tsx` at ~10,000 lines is a maintenance risk. Natural decomposition points:
- Extract each view into its own file (`DashboardView.tsx`, `DraftView.tsx`, etc.)
- Introduce a lightweight router for URL-based navigation
- Consider a state management layer if prop drilling becomes unwieldy

**Assumption:** The single-file approach works for now because there is one primary developer and the file is well-organized with clear section comments.

### Type Safety

Backend and frontend types are manually synchronized. Drift is a real risk. Mitigation options:
- Shared types package in a monorepo
- Auto-generated types from the API schema
- Runtime validation at the API boundary (e.g., Zod)

**Assumption:** Manual sync is acceptable while the API surface is small and changes are infrequent.

### Historical Stats Storage

Player stat history is currently embedded in the league JSON blob. As seasons accumulate, this grows unbounded. Consider:
- Archiving old season data to separate storage
- Lazy-loading historical stats on demand
- Capping retained detail (e.g., keep summaries, drop play-by-play after N seasons)

### Playbook Data Model

Custom plays and playbooks are stored per-team inside the league blob. If the play library grows significantly:
- Consider a normalized play database separate from team state
- Add versioning so play definitions can be updated without breaking saved playbooks

---

*This document describes the system as it exists today. It is not aspirational. Update it when the architecture actually changes.*
