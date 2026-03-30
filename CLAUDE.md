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
6. `playByPlay.ts` — formats events into human-readable strings (CLI only)
7. `commentary.ts` — phase-based commentary generation. Produces `commentaryFull` (rich broadcast paragraph) and `commentaryLog` (compact log line) for each `PlayEvent`. Uses structured `CommentaryMeta` captured during play resolution (pressureLevel, windowState, throwQuality, defPlayerName, drivePlayNum, prevPlayType/Result, etc.).

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
| Era-relative legacy scoring | `legacy.ts` |
| GM career tracking | `gmCareer.ts` |
| Play commentary | `commentary.ts` |
| All sim constants | `config.ts` |

### Frontend structure (`web/src/`)
- `App.tsx` (~8000 lines) — most views as functions inside this file. Navigation is a `tab` state variable; the active tab determines which view renders.
- `App.css` — all styles in one file. Design token system: 5-tier background elevation, 3-tier borders, semantic colors, spacing scale. Dark theme (`#05080e` base, `#f97316` ember orange accent).
- `api.ts` — typed wrappers for every backend endpoint. Auto-clears auth on 401.
- `types.ts` — client-side TypeScript types mirroring the backend models.
- `TeamLogo.tsx` — reusable team logo component (renders `/assets/teams/team_{abbr}.png` with fallback).
- `FieldView.tsx` — football field visualization (160px tall, team-colored end zones via `TEAM_COLORS` map for all 32 teams). Enlarged fonts throughout (scoreboard 1.8rem, down/distance 0.95rem, commentary 0.95rem). Around-the-league toasts positioned below the field (not overlapping). `TeamLogo` + team abbreviation in end zones.
- `DashboardSchedule.tsx` — 18-week schedule strip component (week tiles with W/L/bye + team logos).
- `views/PlaybooksView.tsx` — extracted playbook editor (~2,500 lines).
- `seasonStats.ts` / `boxScore.ts` — client-side stat aggregation from game events.
- `weeklyReport.ts` / `gameRecap.ts` / `gameplanRec.ts` — report/recommendation generators.
- `shared.ts` — shared utilities (friendlyError, fmtTime).

Reusable UI primitives (CSS classes): `ui-card`, `ui-table`, `ui-badge`, `ui-stat`, `ui-empty`, `entity-link`.

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
- **Penalty system** — 6 penalty types (DPI, def holding, roughing, offsides, off holding, false start). `discipline` rating modulates frequency. **Accept/decline logic**: opposing team decides whether to accept or decline each penalty based on comparing penalty outcome vs play result (~25% decline rate).
- **PAT / 2PT** — after every TD. XP 94% base, 2PT 48% base. AI decision logic for going for 2.
- **Talent compression** — rating gaps compressed by 0.80x. Prevents shutouts.
- **Trailing boost** — +0.10 success at 21+ deficit, +0.08 at 14+ late Q4 (prevent defense).
- **Special teams scoring** — kick/punt return TDs, blocked FG/punt with return TD chance, pick-six, fumble return TDs, safeties.
- **Clock model** — real 15-min quarters with variable runoffs. ~125 plays/game.
- **Two-minute drill** — 3 timeouts/half, spike plays, hurry-up completion bonus, AI timeout management.
- **Hall of Fame** — era-relative scoring using seasonal league rankings. 150-point threshold. See `docs/HALL_OF_FAME_AND_RING_OF_HONOR.md`.
- **Ring of Honor** — team-specific legacy with loyalty bonus. 55-point threshold, 100 for jersey retirement.
- **Team logos** — 32 PNG logos at `web/public/assets/teams/team_{abbr}.png`. `TeamLogo` component with fallback.
- **Overtime** — NFL modified sudden death rules. Regular season: one 10-min OT period (can still tie). Postseason: unlimited OT (no ties). First-possession TD wins; FG gives other team a chance. `simulateGame()` accepts `{ isPlayoff: true }` option.
- **Play-by-play enhancements** — 10-feature broadcast experience: drive summary strip, momentum tug-of-war bar, key play flash (gold/red/orange), red zone overlay, penalty accept/decline inline display, OT drama (pulsing badge + amber glow), around-the-league toast alerts, bottom score ticker, H2H rivalry stats, post-game highlights reel (top 5 by score swing, clickable). Utility modules: `momentum.ts`, `driveTracker.ts`, `highlights.ts`, `leagueAlerts.ts`.
- **Two-layer commentary system** — `commentary.ts` generates phase-based commentary from `CommentaryMeta` captured during play resolution. `commentaryFull` is a rich broadcast paragraph for the current play (pressure → throw → catch → YAC → outcome). `commentaryLog` is a compact one-liner for the play history log. The GameViewer shows current play with full commentary + a scrollable ESPN-style log of previous plays with icons for TD/INT/sack/penalty/first down. Phrase pools are per-phase (not per-play-type templates), producing varied and coherent multi-sentence commentary. Features: **multi-style system** (neutral/hype/analytical — stored in League, selectable in settings), defender names in sacks/INTs/breakups/TFLs/tackles, drive-level narrative (drive yards/first downs tracked, stalled/rolling detection, long drive acknowledgment), streak awareness (consecutive runs/passes/completions/negative plays), game context (score differential drives urgency/clock phrasing), special situation awareness (3rd/4th down, red zone, goal-to-go, two-minute drill), penalty integration woven into commentary, ~400+ phrase fragments across 3 styles. Narrative fires probabilistically with priority tiers: game-critical > drive narrative > streaks > light context. Style is threaded: League.commentaryStyle → simulateGame options → generateFullCommentary.

### Live game experience (implemented)
The in-game experience feels like a broadcast:
- Center-field visualization with ball tracking, yard lines, first-down marker
- Team logos in end zones and scoreboard
- Around-the-league score panels during a week's games
- Play-by-play with rich phase-based commentary (pocket pressure, coverage windows, throw quality, YAC, broken tackles, penalty flags)
- GameViewer: current play uses `BroadcastCommentary` component with progressive sentence-by-sentence reveal, play-type-based pacing (fast for runs, dramatic pauses for TDs/INTs), keyword highlighting (TOUCHDOWN gold, INTERCEPTION red, SACK orange), and auto-play waits for commentary completion before advancing. Big play callout banners for TDs/turnovers/30+ yard plays. Drive summary markers between drives in the play history log (play count, yards, result). Quarter headers. Extended post-play pauses for dramatic moments (600ms after TD, 450ms after turnover). Previous plays shown in compact ESPN-style log with clickable history and drive/quarter markers interspersed.
- **Broadcast score bug** with team logos, tabular scores, possession dot indicator, quarter badge. Late-game urgency pulse when Q4 within 8 points.
- **Possession transitions**: labeled banners between possessions (KICKOFF / TURNOVER / CHANGE OF POSSESSION) with extended pauses (up to 900ms after scoring TDs)
- **Atmosphere text**: probabilistic ambient lines after big moments ("The crowd erupts!" / "The tension is palpable.") — fires ~30-55% on TDs/turnovers/big plays

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
