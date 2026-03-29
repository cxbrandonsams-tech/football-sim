# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

**Frontend → Vercel. Backend → Fly.io. They are completely separate services.**

### Architecture
- `web/` is deployed to Vercel (static React SPA, no server)
- `src/` is deployed to Fly.io (Express API + SQLite)
- The frontend talks to the backend via `VITE_API_URL` — never via a relative path in production

### Environment variables

**Vercel** (set in Project → Settings → Environment Variables):
| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://football-sim.fly.dev` |

**Fly.io** (set with `fly secrets set KEY=value --app football-sim`):
| Variable | Notes |
|---|---|
| `JWT_SECRET` | Random hex string — `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | Comma-separated exact origins, e.g. `https://your-app.vercel.app` |
| `ALLOW_VERCEL_PREVIEWS` | Set to `"true"` to allow any `*.vercel.app` origin (useful during dev) |

`NODE_ENV`, `PORT`, and `DATA_DIR` are set in `fly.toml [env]` — not as secrets.

### CORS rules
- CORS is handled by the `cors` npm package in `src/server.ts` — **never add manual `res.setHeader('Access-Control-*')` calls**
- Allowed origins come exclusively from `ALLOWED_ORIGINS` env var
- Auth uses JWT Bearer tokens, not cookies — `credentials: false`
- To add a new frontend domain: add it to `ALLOWED_ORIGINS` on Fly, redeploy
- For Vercel preview branches: set `ALLOW_VERCEL_PREVIEWS=true` on Fly instead of listing each preview URL

### Adding a new allowed frontend domain
```bash
fly secrets set ALLOWED_ORIGINS="https://your-app.vercel.app,https://new-domain.com" --app football-sim
fly deploy --app football-sim
```

### Verify CORS and health on deploy
```bash
curl https://football-sim.fly.dev/health
# Returns: { ok, env, cors: { originsConfigured, vercelPreviewsAllowed } }
```

### Local dev
- Backend: `npm run dev` (ts-node, port 3000, no ALLOWED_ORIGINS = all origins open)
- Frontend: `cd web && npm run dev` (Vite proxy → localhost:3000, no VITE_API_URL needed)
- See `web/.env.example` and `.env.example` for all variables

## Commands

### Backend (root)
```bash
npx ts-node src/server.ts        # Run the API server
npx ts-node src/cli.ts           # Run the CLI
npx ts-node src/tools/simrun.ts  # Run a standalone simulation
```

### Frontend (web/)
```bash
cd web && npm run dev      # Vite dev server
cd web && npm run build    # tsc -b && vite build (type-check + bundle)
cd web && npm run lint     # ESLint
```

There is no test suite. The benchmark script at `scripts/bench.ts` is the closest thing — run it with `npx ts-node scripts/bench.ts` to validate simulation output against expected stat ranges.

## Architecture

### Two-process model
- **Backend**: `src/server.ts` — Express API server. All game state lives in a SQLite database (`data/football-sim.db` via `better-sqlite3`). Each league is a single JSON blob (`stateJson`) in the `leagues` table. The full `League` object is deserialized, mutated in memory, then re-serialized on every write.
- **Frontend**: `web/src/` — React + Vite SPA. Communicates with the backend via REST (`web/src/api.ts`). The entire `League` object is returned on almost every API call; the client holds it in state.
- **Auth**: JWT tokens via `src/auth.ts`. Passwords hashed with bcryptjs. Username lookup uses `COLLATE NOCASE`.

### Data model
- `src/models/League.ts` is the root type — it contains teams, games, rosters, standings, history, news, draft, etc.
- `src/models/Player.ts` defines position-specific rating interfaces (`QBRatings`, `RBRatings`, etc.). Players have both `trueRatings` (actual) and `visibleRatings` (scouted, used in UI). `trueRatings.position` is the discriminant.
- `src/models/Team.ts` includes the depth chart, gameplan, contracts, and coaching staff per team.
- `src/models/Game.ts` holds a completed or scheduled game including `PlayEvent[]` for play-by-play.

### Simulation engine (`src/engine/`)
The core pipeline for a week:
1. `simulateWeek.ts` — iterates scheduled games for the week
2. `simulateGame.ts` — drives play-by-play simulation for a single game; imports `passEngine.ts` and `runEngine.ts`
3. `passEngine.ts` / `runEngine.ts` — resolve individual pass and run plays
4. `config.ts` (`TUNING`) — all numeric constants for the simulation (probabilities, modifiers, thresholds). **This is the single source of truth for tuning.** Change numbers here, not in the engine functions.
5. `gameStats.ts` — builds box scores from `PlayEvent[]` after a game
6. `playByPlay.ts` — formats events into human-readable strings

The pass system uses **window states** (`open` → `soft_open` → `tight` → `contested` → `covered`) derived from WR/DB separation. Each state applies a success modifier, INT modifier, and YAC bonus. QB `decisionMaking` drives throwaway probability on covered windows. All thresholds and modifiers live in `TUNING.pass.window`.

Season lifecycle (in `seasonEngine.ts`):
- `regular_season` → `postseason` (after week 18) → `offseason` → `draft` → back to `regular_season`
- `startNextSeason()` generates a new 18-week schedule (17 games + 1 bye per team)

### Key engine files by concern
| Concern | File |
|---|---|
| Schedule generation | `scheduleGenerator.ts` |
| Postseason bracket | `postseason.ts` |
| Player progression/regression | `progression.ts` |
| Contract logic | `contracts.ts`, `freeAgency.ts` |
| Trade evaluation | `trades.ts` |
| Draft | `draft.ts`, `scoutingEngine.ts` |
| News generation | `news.ts` |
| Hall of Fame / Ring of Honor | `hallOfFame.ts`, `ringOfHonor.ts` |
| GM career tracking | `gmCareer.ts` |
| All sim constants | `config.ts` |

### Frontend structure (`web/src/`)
- `App.tsx` (~6000 lines) — single-file React app. All views are functions inside this file. Navigation is a `tab` state variable; the active tab determines which view renders.
- `App.css` — all styles in one file. Uses a dark theme (`#0f1117` background, `#e2e8f0` text, `#1d4ed8` blue accent).
- `api.ts` — typed wrappers for every backend endpoint.
- `types.ts` — client-side TypeScript types mirroring the backend models.
- `DashboardSchedule.tsx` — team schedule strip component (week tiles with W/L/bye).
- `seasonStats.ts` / `boxScore.ts` — client-side stat aggregation from game events.

The top nav is `header.top-nav` (sticky, full-width). Each primary nav item maps to a tab: **GM** → `team`, **Roster** → `roster`, etc. Contextual sub-navs appear for Roster and GM sections.

## Product Direction

### Current priority
Strong, realistic simulation engine and clean UI. Build vertical slices (complete working features) rather than partial systems. Keep logic simple and tunable. Prefer gameplay feel over perfect realism in early iterations.

### Shelved systems — do NOT reintroduce unless explicitly requested
- **Legacy gameplans** (`GameplanSettings` / `PlaycallingWeights`) — deprecated, replaced by the tendencies/archetype system. Backend code exists for backward compat but is not the active design.
- **Notification system** — removed

### Active systems (previously shelved, now implemented)
- **Playbook system** — fully implemented. Route-based plays, 13 down/distance buckets, weighted selection, custom play creator, formation depth charts. See `PLAYBOOKS_AND_FORMATIONS.md`.
- **Tendencies / Gameplan** — 7-slider system with 8 coach archetype presets, recommendations, weekly prep. See `docs/FRANCHISE_SOURCE_OF_TRUTH.md` Section 7.

### Live game vision
The in-game experience should feel like a broadcast:
- Center-field visualization with ball tracking
- Around-the-league score panels during a week's games
- Play-by-play with announcer-style commentary
- Clear scoreboard and game state at all times

Prefer clean and readable over graphically complex.

### UI principles
- Single top navigation bar — no nested nav groups
- Dashboard = sports broadcast hub: matchups, live scores, news feed
- Emphasis on matchups, live game experience, and the league world
- Avoid cluttered or overly technical UI

## Game Design Rules (from `docs/game-design.md`)
- Every player rating must affect simulation — no decorative stats.
- Ratings are position-specific only; no generic attributes.
- Safety `Range` is a derived hidden stat: `Speed × 0.6 + Awareness × 0.4`. Never expose it in UI.
- Run contact resolves as Power **OR** Elusiveness (not blended) — the better fit wins.
- Speed only triggers in open-field breakaway situations, not on every carry.
- `docs/game-design.md` is the source of truth for what each rating does. Before adding a new rating or mechanic, check it doesn't duplicate an existing one.
