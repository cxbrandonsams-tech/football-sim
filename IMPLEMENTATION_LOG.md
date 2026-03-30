# IMPLEMENTATION_LOG.md
_Running log of meaningful changes, decisions, and implementations. Entries are dated and concise._

---

## 2026-03-27 — Documentation System Created

**What:** Created three living design documents as the source of truth for this repo:
- `PROJECT_CONTEXT.md` — project overview, locked constraints, current phase, do-not-touch list
- `PLAYBOOKS_AND_FORMATIONS.md` — full specification for the playbook/formation system
- `IMPLEMENTATION_LOG.md` — this file

**Why:** Establishing a persistent, structured record so future work sessions start with full context rather than rediscovering design decisions. The engine is locked; strategy now lives in the playbook layer above it.

**Decisions locked in these docs:**
- Engine math is locked — no changes without explicit approval
- Multiplayer strategy emerges from formation/play/roster deployment, not engine complexity
- Offensive plays reference formation slot labels (X, Z, SLOT, TE, RB, FB)
- Defensive plays reference package slot labels
- 13 down/distance buckets drive play selection
- Pre-authored plays only — no custom play creator
- Realism over arcade behavior

**Follow-up:** Begin implementation of the playbook/formation data model in `src/models/` following the spec in `PLAYBOOKS_AND_FORMATIONS.md`.

---

## 2026-03-27 — Playbook & Formation System — Phase 1–5 Complete

**What:** Implemented the full playbook and formation system as specced in `PLAYBOOKS_AND_FORMATIONS.md`.

**New files:**
- `src/models/Formation.ts` — `OffensiveSlot`, `OffensivePersonnel`, `OffensiveFormation`, `FormationSlotAssignment`, `FormationDepthCharts` types + 5-formation library
- `src/models/Playbook.ts` — `OffensivePlay`, `Playbook`, `DownDistanceBucket`, `OffensivePlan` types
- `src/data/plays.ts` — 30 pre-authored plays across 5 formations (shotgun_11, shotgun_10, singleback_12, iformation_21, iformation_22)
- `src/data/playbooks.ts` — 8 named weighted playbooks + `DEFAULT_OFFENSIVE_PLAN` mapping all 13 buckets
- `src/engine/playSelection.ts` — bucket classifier, weighted play picker, formation depth chart remapper, `resolvePlay()` / `applyFormationToTeam()` public API

**Modified files:**
- `src/models/Team.ts` — added optional `formationDepthCharts` and `offensivePlan` fields
- `src/engine/simulateGame.ts` — 1 import + 4 targeted line changes; formation-aware play selection is now active when a team has `offensivePlan` configured
- `src/server.ts` — 3 new endpoints: `POST /league/:id/set-formation-slot`, `POST /league/:id/set-offensive-plan`, `GET /formations`
- `web/src/types.ts` — added all playbook/formation types; `Team` gains `formationDepthCharts` and `offensivePlan`
- `web/src/api.ts` — added `setFormationSlot`, `setOffensivePlan`, `getFormations` wrappers

**How formation depth charts affect gameplay:**
Selected play has a `formationId`. `applyFormationToTeam()` looks up `team.formationDepthCharts[formationId]` and remaps WR/TE/RB positional depth chart slots before passing the team to `simulatePlay`. The engine uses its existing `dc['WR'][0]`, `dc['WR'][1]`, etc. — it sees the right players without any engine math changes.

Slot → positional index: X→WR[0], Z→WR[1], SLOT→WR[2], TE→TE[0], RB→RB[0], FB→RB[1]

**Fallback behavior:**
- Team without `offensivePlan` → engine's existing `selectPlayType()` runs unchanged
- Missing bucket in plan → `DEFAULT_OFFENSIVE_PLAN` covers it
- Missing playbook reference → falls back to default, then engine fallback

**Locked decisions:**
- No `activeFormationId` — the selected play determines the formation
- Offensive slots restricted to: X, Z, SLOT, TE, RB, FB
- No separate formation selection step
- Engine math is unchanged

**Follow-up:** Build formation depth chart and playbook assignment UI in `web/src/App.tsx`.

---

## 2026-03-27 — Validation & Observability Pass

**What:** Added debug instrumentation, a stats counter, and a full validation script for the playbook/formation system.

**New files:**
- `scripts/validate-playbooks.ts` — 151-check validation script covering 5 runtime scenarios and full static audit of all content

**Modified files:**
- `src/engine/playSelection.ts` — added `playSelectionStats` counter (exported, resettable via `resetPlaySelectionStats()`), `PLAY_SELECTION_DEBUG=1` env-var logging (~5% sampled plays), fixed minor type issues

**Validation results (all passed):**
- Scenario 1: Legacy fallback — teams without `offensivePlan` use engine's `selectPlayType()` unchanged ✓
- Scenario 2: New path — teams with `offensivePlan` resolve plays via `resolvePlay()` ✓
- Scenario 3: Plan present, no formation depth charts — plays resolve but no formation remapping occurs ✓
- Scenario 4: Invalid playbook IDs — fallback chain handles unknown IDs without crash ✓
- Scenario 5: Mixed game — both code paths exercised simultaneously ✓
- Static audit: 5 formations, 30 plays, 8 playbooks, DEFAULT_OFFENSIVE_PLAN all structurally valid ✓
- `classifyBucket` verified against all 13 bucket boundary cases ✓

**No engine math changes. No regressions. Both `tsc --noEmit` checks (backend + frontend) pass clean.**

**Debug usage:**
```
PLAY_SELECTION_DEBUG=1 npx ts-node src/tools/simrun.ts 1
```
Logs ~5% of offensive snaps: bucket → playbook → play → formation → slot assignments → engineType.

---

## 2026-03-27 — Playbook UI — First Pass

**What:** Built the first user-facing offensive playbook configuration UI, accessible from GM → Playbooks.

**Modified files:**
- `src/server.ts` — `GET /formations` now also returns `plays: OFFENSIVE_PLAYS` (additive, non-breaking)
- `src/data/plays.ts` — imported via new server import
- `web/src/api.ts` — `getFormations` return type updated to include `plays: OffensivePlay[]`; added `setFormationSlot` and `setOffensivePlan` imports to App.tsx
- `web/src/App.tsx` — added `PlaybooksView` component; wired `setFormationSlotApi`, `setOffensivePlanApi`, `getFormations`; added "Playbooks" to GM sub-nav; added `'playbooks'` to `inGmSection`; added type imports for playbook/formation types
- `web/src/App.css` — added full CSS block for `.pb-*` classes

**UI added:**

1. **Formation Depth Charts section** — Formation tab strip (5 tabs, one per formation). Each tab shows the formation name and personnel badge (11, 12, etc.). Selecting a tab displays the formation's active slots in a grid. Each slot card shows the slot label (X — Split End, Z — Flanker, etc.), the currently assigned player's name and position, and a `<select>` populated with roster-eligible players (WR for X/Z/SLOT, TE for TE, RB/FB for RB/FB). Changes save immediately via `POST /league/:id/set-formation-slot`.

2. **Offensive Plan section** — Four down groups (First, Second, Third, Fourth), each containing all bucket rows for that down. Each row shows a user-friendly label (e.g. "3rd & Long (7+)") and a `<select>` of available playbooks. Current assignment is pre-selected. Changes save immediately via `POST /league/:id/set-offensive-plan`. Teams without a plan configured show `— Default —` selected.

3. **Playbook Library section** — Expandable list of all 8 playbooks. Each playbook shows play count, and expands to a table with columns: Play name (+ PA badge if play-action), Formation, Engine type, Weight, Routes/carrier slot. Data comes from the plays returned by `GET /formations`. Read-only.

**Save feedback:** Green toast notification "Saved" appears at bottom-right for 2 seconds after any successful write. Saving state disabled the relevant `<select>` while in-flight.

**No engine math changes. Both tsc checks pass clean.**

**Remaining limitations:**
- Formation depth chart assignments for teams that have not yet configured slots show "— Unassigned —" for all slots (correct fallback behavior)
- Playbook assignment shows "— Default —" for teams without `offensivePlan` (correct)
- No playbook editing UI yet (read-only library)
- No defensive package UI yet

---

## 2026-03-27 — Playbook UI Polish

**What:** Full polish pass on the GM → Playbooks screen. Replaced immediate-save behavior with batch-save UX, added config summary, improved library readability, added safeguards.

**Modified files:**
- `web/src/App.tsx` — `PlaybooksView` fully rewritten (~350 lines)
- `web/src/App.css` — Playbooks CSS block fully replaced with polished version (~350 lines)

**UX changes:**

1. **Batch-save formation slots** — Slot dropdowns no longer POST on every change. All changes within the active formation are tracked as local state (`localSlotEdits` keyed by formation ID). A Save Formation button saves all changed slots in sequence (one `POST /set-formation-slot` per changed slot). A Revert button discards local edits back to the persisted server state.

2. **Batch-save offensive plan** — Plan dropdowns no longer POST on every change. All bucket changes are tracked in `localPlanEdits`. A Save Plan button sends the full merged plan in one `POST /set-offensive-plan`. A Revert button discards all pending plan edits.

3. **Unsaved change indicators:**
   - Yellow "Unsaved changes" banner appears when edits are pending
   - Formation tab shows a yellow dot `●` when that formation has pending changes
   - Formation tab shows a `n/m slots` counter (saved vs total)
   - Changed slot cards get an amber border + "was: …" label showing the previous assignment
   - Changed plan rows get a subtle amber background tint

4. **Config summary bar** — New summary strip at the top of the view:
   - "N / 5 formations configured" (based on persisted data)
   - "N / 13 buckets assigned" (based on persisted data)
   - Warning chips for: partially-assigned formations, buckets still on default

5. **Error handling** — Formation and plan save errors appear inline (red banner below the section header), not as a global overlay. Errors do not clear local edits. Duplicate-save protection: Save button disabled while saving in progress.

6. **Library polish:**
   - Multiple playbooks can be expanded simultaneously (Set-based accordion state)
   - Pass/run play count chips on each playbook header (`N pass`, `N run`)
   - "thin" warning badge for playbooks with ≤ 2 plays
   - Runs and passes visually distinct: run rows use warm text color, pass rows use cool
   - Type chip rendered as colored pill (purple = pass, orange = run)
   - Routes displayed as "SLOT short, X deep" (readable) instead of "SLOT:SHORT X:DEEP"
   - Run carrier shown as "RB carries" rather than raw slot name
   - PA (play-action) badge on applicable plays
   - Formation personnel badge shown inline in Formation column

7. **Grace on missing data:** Teams without `offensivePlan` show all selects at "— Default —" (no crash). Teams without `formationDepthCharts` show all slots as "Unassigned" (no crash).

**No engine math changes. Both tsc checks pass clean.**

---

## 2026-03-27 — Defensive Configuration UI — First Pass

**What:** Built the first user-facing defensive configuration UI, extending GM → Playbooks with a Defense side.

**Modified files:**
- `web/src/App.tsx` — extended `PlaybooksView` component (~200 new lines); added defensive constants, `eligibleDefensivePlayers` helper, all defensive state + handlers + JSX
- `web/src/App.css` — added defensive CSS block (~90 lines): side toggle, package description, defensive chip styles, defensive book chip variants, table row variants

**UI added:**

1. **Offense / Defense toggle** — A pill toggle at the top of the Playbooks view switches between the offensive and defensive panels. The offensive panel is completely unchanged.

2. **Defensive summary bar** — Shows `N / 6 packages configured` and `N / 13 buckets assigned` plus warning chips for partially-assigned packages and buckets still on default.

3. **Package Depth Charts section** — Package tab strip (6 tabs, one per package). Each tab shows the package name, personnel badge (4-3, 4-2-5, etc.), a yellow dirty dot when there are unsaved changes, and an `n/m slots` counter. Selecting a tab shows the package's active slots as a grid. Each slot card shows the slot label, current player name/position/OVR, and a `<select>` filtered to eligible positions (DE, DT, OLB, MLB, CB, FS, SS as appropriate). A description line appears under the tabs when a package is selected. Saves via `POST /league/:id/set-package-slot`.

4. **Defensive Plan section** — Four down groups, each with bucket rows. Each row shows a user-friendly label and a `<select>` of available defensive playbooks. Saves all changes in one call via `POST /league/:id/set-defensive-plan`.

5. **Defensive Playbook Library** — Read-only expandable list of all 8 defensive playbooks. Each header shows zone / man / blitz play counts. Expanded view shows a table with: play name, package (with personnel badge), front chip, coverage chip, weight, and blitz pressure chip (red, only when applicable).

**Batch-save UX:** All edits are local until Save Package / Save Plan is clicked. Revert discards pending edits. Unsaved change notice banner appears when edits are pending. Save button disabled while saving.

**CSS reuse:** The defensive panels share `.pb-slot-grid`, `.pb-slot-card`, `.pb-slot-card--changed`, `.pb-plan-grid`, `.pb-plan-row`, `.pb-summary-bar`, `.pb-formation-tab`, `.pb-personnel-badge`, `.pb-inline-error`, `.pb-unsaved-notice`, and all other existing `.pb-*` classes. New additions are confined to side toggle, package description, and defensive chip types.

**No engine math changes. Both tsc checks pass clean.**

**Remaining limitations:**
- No defensive playbook editing (read-only library, as specified)
- No custom package creation
- Package slot eligibility filtering uses position types directly (e.g., OLB1 accepts OLB only; LB1 accepts OLB+MLB) — may need refinement for teams with non-standard rosters

---

## 2026-03-27 — Defensive Package & Playbook System — Complete

**What:** Implemented the full defensive-side equivalent of the offensive playbook system.

**New files:**
- `src/models/DefensivePackage.ts` — `DefensiveSlot` type (20 slot labels), `DefensivePackage` interface, `PackageSlotAssignment` type, `PackageDepthCharts` type, `DEFENSIVE_PACKAGES` library (6 packages), slot labels and eligible positions maps
- `src/models/DefensivePlaybook.ts` — `DefensiveFront`, `DefensiveCoverage`, `BlitzTag`, `DefensivePlay`, `DefensivePlaybook`, `DefensivePlan` types
- `src/data/defensivePlays.ts` — 25 pre-authored plays across 6 packages (4-3, 3-4, Nickel, Dime, Quarter, Goal Line)
- `src/data/defensivePlaybooks.ts` — 8 named defensive playbooks + `DEFAULT_DEFENSIVE_PLAN` covering all 13 buckets
- `src/engine/defensiveSelection.ts` — package depth chart application (`applyPackageToTeam`), weighted play selection (`resolveDefensivePlay`), `DefensiveSelectionStats` counter (exported, resettable), `DEF_SELECTION_DEBUG=1` env-var logging (~5% sampled plays)
- `scripts/validate-defense.ts` — 269-check validation script covering 5 runtime scenarios and full static audit of all content

**Modified files:**
- `src/models/Team.ts` — added `packageDepthCharts?: PackageDepthCharts` and `defensivePlan?: DefensivePlan`
- `src/engine/simulateGame.ts` — 1 import + 4 targeted line changes; defensive package selection is now active when a team has `defensivePlan` configured. `defForPlay` is passed to `simulatePlay()` and used for `defPrimary` fatigue/injury tracking
- `src/server.ts` — 2 new endpoints (`POST /league/:id/set-package-slot`, `POST /league/:id/set-defensive-plan`); `GET /formations` extended to include `packages`, `defensivePlaybooks`, `defensivePlays`
- `web/src/types.ts` — added all defensive types (`DefensiveSlot`, `DefensivePackage`, `DefensiveFrontLabel`, `DefensiveCoverage`, `BlitzTag`, `DefensivePlay`, `DefPlaybookEntry`, `DefPlaybook`, `DefensivePlan`); `Team` gains `packageDepthCharts` and `defensivePlan` fields. Note: named `DefPlaybook`/`DefPlaybookEntry` to avoid collision with legacy `DefensivePlaybook` gameplan enum.
- `web/src/api.ts` — added `setPackageSlot`, `setDefensivePlan` wrappers; updated `getFormations` return type

**How package depth charts affect gameplay:**
Selected defensive play has a `packageId`. `applyPackageToTeam()` looks up `team.packageDepthCharts[packageId]` and remaps DE/DT/LB/CB/S positional depth chart slots before passing the team to `simulatePlay`. The engine uses its existing `dl(def,'DE')`, `lb(def)`, `cb(def)`, `safety(def)` helpers — it sees the right players without any engine math changes.

Slot → positional index: DE1→DE[0], DE2→DE[1], DT1/NT→DT[0], DT2→DT[1], LB1/OLB1→LB[0], LB2/OLB2→LB[1], ILB1/LB3→LB[2], ILB2/LB4→LB[3], CB1→CB[0], CB2→CB[1], NCB→CB[2], DC1→CB[3], DC2→CB[4], FS→S[0], SS→S[1]

**Fallback behavior:**
- Team without `defensivePlan` → depth chart unchanged (engine uses base depth chart)
- Invalid/missing playbook ID in plan → `DEFAULT_DEFENSIVE_PLAN` fallback covers it
- Missing package slot assignments → `applyPackageToTeam` returns team unchanged

**Locked decisions:**
- Defense is still purely reactive — no defensive play type changes engine math
- Package remapping controls which specific players appear at each depth chart position
- Coverage/blitz labels are display metadata only
- Engine math is unchanged

**Validation results (all 269 passed):**
- Scenario 1: Legacy fallback — teams without `defensivePlan` → depth chart unchanged ✓
- Scenario 2: New path — teams with `defensivePlan` resolve plays via `resolveDefensivePlay()` ✓
- Scenario 3: Plan present, no package depth charts — plays resolve but no remapping occurs ✓
- Scenario 4: Invalid playbook IDs — fallback chain handles unknown IDs without crash ✓
- Scenario 5: Mixed game — both code paths exercised simultaneously ✓
- Static audit: 6 packages, 25 plays, 8 playbooks, DEFAULT_DEFENSIVE_PLAN all structurally valid ✓
- Package depth chart remapping verified: DE and CB slots correctly remapped ✓
- `classifyBucket` verified against all 13 bucket boundary cases ✓

**No engine math changes. Both `tsc --noEmit` checks (backend + frontend) pass clean.**

**Debug usage:**
```
DEF_SELECTION_DEBUG=1 npx ts-node src/tools/simrun.ts 1
```
Logs ~5% of defensive snaps: bucket → playbook → play → package → slot assignments → coverage.

---

## 2026-03-27 — Draft Trade System (Phase 1 MVP)

**What:** Added pick-for-pick trading during the draft. Reuses the existing trade infrastructure (`propose-trade` endpoint, `draftPickOwnership`, `shouldAIAcceptTrade`, `applyTrade`). No new backend code — purely a UI addition that calls existing API.

**UI:** "Trade Picks" button in draft header opens a trade panel. Select a team → checkboxes for your picks to give and their picks to get → "Propose Trade" submits via existing `proposeTradeApi`. AI responds immediately (accept/reject). On accept, league state refreshes and draft slots update.

**Files changed:**
- `web/src/App.tsx` — added `leagueId`/`onLeagueUpdated` props to DraftView, added trade state + `submitDraftTrade()` + `findOriginalTeam()`, trade panel UI with team selector, pick checkboxes, result display
- `web/src/App.css` — `.draft-trade-*` styles

**Trade flow:** User selects picks → `proposeTradeApi(leagueId, myTeamId, theirTeamId, fromAssets, toAssets)` → AI evaluates using existing `shouldAIAcceptTrade` (pick value chart) → accept/reject → draft slots automatically reflect new ownership on refresh.

---

## 2026-03-27 — Combine / Pro Day System & Draft Feedback

**Combine system:** Generated per prospect alongside draft class. Results are public (no scouting needed). Metrics: 40-yard dash, bench press, vertical jump, broad jump, 3-cone, shuttle. Stock movement (rising/falling/neutral) derived from athletic performance vs expected for draft position. Combine adjusts scouting projected round by ±0.5 rounds.

**Draft feedback:** Board target alerts (yellow bar when a board target is taken by another team), BPA tags (top 3 by OVR), Falling tags (past projected round), Value/Reach commentary on recent picks and user picks, value indicator in detail panel.

**Files:** `src/models/Prospect.ts` (CombineResults type), `src/engine/combineGen.ts` (new), `src/engine/scoutingEngine.ts` (combine adj), `src/server.ts` (generation hook), `web/src/types.ts` (frontend types), `web/src/App.tsx` (Combine section in College tab + detail panel + draft alerts/tags), `web/src/App.css` (combine + feedback styles).

---

## 2026-03-27 — Draft Room UI & College-Scouting Integration

**What:** Enhanced the existing DraftView into a full Draft Room experience with a prospect detail panel, "Your Picks" summary, and clickable prospect rows. Integrated the College tab with the existing scouting system (Scout buttons, View links, auto-focus navigation).

**Draft Room enhancements:**
- Clickable prospect rows → detail panel on right side showing name, position, OVR, college, size, scouting report (grade, confidence, projected round, strengths, weaknesses, notes), board rank, and "Draft [Name]" button when it's user's turn
- "Your Picks" section showing all user selections this draft
- Right panel layout: Detail → Your Picks → Recent Picks (stacked vertically)
- Selected prospect highlighted with purple background

**College-Scouting integration:**
- Scout button directly in College tab's Top Prospects table (same API as Scouting tab)
- Scouting state displayed per prospect (Unscouted / Lv1 with proj round / Full)
- "View" button navigates to Scouting tab and auto-expands the prospect's detail
- `scoutFocusId` state bridges College → Scouting tab navigation
- Stat leaders also have "View" links

**Files changed:**
- `web/src/App.tsx` — DraftView: added `selectedId` state, prospect detail panel, "Your Picks" section, clickable rows. CollegeView: added scouting props, Scout/View buttons. ScoutingView: added `focusProspectId`/`onFocusConsumed` props with auto-expand effect. Added `scoutFocusId` state.
- `web/src/App.css` — `.draft-right`, `.draft-detail-*`, `.draft-selected`, `.draft-tag-*`, `.draft-detail-pick-btn`, `.draft-my-picks` styles, updated grid layout

**No backend changes. All compiles clean. Benchmark stable.**

---

## 2026-03-27 — College Scouting System (Phase 1 MVP)

**What:** Added a college football presentation layer with 5 conferences (50 teams), generated standings, stat leaders, and prospect preview. Generated alongside the draft class each offseason.

**Data model:**
- `CollegeData` on League: `{ year, conferences: [{name, teams: [{name, conference, wins, losses}]}], statLeaders: [{name, prospectId, college, stat, category}] }`
- Generated in `initDraftCycle()` via `generateCollegeData(year, prospects)`
- `COLLEGE_CONFERENCES` defines SEC (10), Big Ten (10), ACC (10), Big 12 (10), Pac-12 (10) = 50 teams
- Prospect `college` field now draws from conference teams (updated `scoutingEngine.ts`)

**Standings generation:** Top teams in each conference get more wins (12-idx base + random variance). No games simulated.

**Stat leaders:** Top 2-3 prospects by `trueOverall` at each position group (QBs, RBs, WRs/TEs, DEs/OLBs, CBs/safeties) get generated stat lines with believable ranges.

**UI:** New "College" tab in the main nav (visible when `collegeData` exists). Three sections:
1. Conference Standings — tabbed by conference, sorted by wins
2. Stat Leaders — tabbed by category (passing/rushing/receiving/sacks/INTs)
3. Top Prospects — first 20 prospects with name, position, college, height/weight

**Files changed:**
- `src/models/College.ts` — new: `CollegeTeam`, `CollegeStatLeader`, `CollegeData`, `COLLEGE_CONFERENCES`, `ALL_COLLEGE_NAMES`
- `src/engine/collegeGen.ts` — new: `generateCollegeData()`
- `src/engine/scoutingEngine.ts` — updated `COLLEGES` to use `ALL_COLLEGE_NAMES`
- `src/models/League.ts` — added `collegeData?: CollegeData` to League
- `src/server.ts` ��� generates college data in `initDraftCycle()`
- `web/src/types.ts` — mirrored types + `collegeData` on League
- `web/src/App.tsx` — `CollegeView` component, "College" tab in nav
- `web/src/App.css` — `.col-*` styles

**No engine math changes. All compiles clean. Benchmark stable.**

---

## 2026-03-27 — Coach Reputation System

**What:** Added a long-term reputation layer that tracks coaching performance across seasons. Reputation score (0–100) updates once per season based on win rate and playoff/championship results.

**Model:** Added `reputation?: number` and `prevReputation?: number` to `GmCareer`. Score starts at 40 ("Unproven") for new careers and moves ±5–15 per season. Tier thresholds: Hot Seat (0–19), Unproven (20–39), Respected (40–59), Proven Winner (60–79), Elite (80–100).

**Update logic** (in `updateGmSeasonRecord`): Win% drives bulk of change (75%+ → +12, below 25% → -12). Playoffs +3, championship +8. Capped at ±15/season.

**UI:** Integrated into existing GM Career dashboard panel as a sub-section. Shows tier label (color-coded), trend arrow (↑/→/↓ vs previous season), score, and one-line explanation.

**Files changed:**
- `src/models/History.ts` — added `ReputationTier`, `ReputationTrend` types, `reputation`/`prevReputation` fields on `GmCareer`
- `src/engine/gmCareer.ts` — added `computeReputation()`, integrated into `updateGmSeasonRecord()`
- `web/src/types.ts` — mirrored types and fields
- `web/src/App.tsx` — reputation display in GM Career panel
- `web/src/App.css` — `.rep-*` styles

**Migration:** Existing leagues without `reputation` default to 40 ("Unproven"). No migration script needed.

---

## 2026-03-27 — Weekly Prep Polish & Pre-Game Workflow

**What:** Polished the Weekly Prep panel into a cohesive pre-game workflow. Removed duplication between Weekly Prep and Team Insights. Added checklist structure, clearer matchup display, and full-width CTA.

**Changes:**
- Weekly Prep now shows: matchup (home/away + opponent abbr + full name), scouting/recommendation as checklist steps with ✓/○ indicators, recommendation detail card with "Suggested for this matchup" tag, full-width "Open Gameplan" CTA button
- Removed opponent scouting from Team Insights (renamed to "Performance Notes") — opponent info is exclusively in Weekly Prep
- Gameplan section in PlaybooksView now defaults to expanded (was collapsed)
- Sidebar flow is now: League Meta → Weekly Prep (opponent-focused) → Performance Notes (team-focused) → Quick Access

**Files changed:**
- `web/src/App.tsx` — polished Weekly Prep panel, removed opponent scouting from Team Insights, renamed panel, defaulted Gameplan to expanded
- `web/src/App.css` — added `.wp-steps`, `.wp-step`, `.wp-cta`, updated matchup and rec styles

---

## 2026-03-27 — Gameplan Recommendations & Weekly Prep

**What:** Extracted inline gameplan recommendation logic into a reusable module (`gameplanRec.ts`). Surfaced recommendations in two places: the Gameplan panel (existing) and a new Weekly Prep sidebar panel on the dashboard.

**Recommendation logic** (`web/src/gameplanRec.ts`):
- Analyzes team `playStats` (run/pass avg yards, deep rate), league `metaProfile`, and upcoming opponent tendencies
- Returns a preset ID, name, 2-3 reasons, and opponent info
- Same deterministic rules used in both locations — no duplication

**Weekly Prep panel** (dashboard sidebar, before Team Insights):
- Shows upcoming opponent name, home/away, and week number
- Displays scouting summary from `generateScoutingReport()` if available
- Shows suggested gameplan preset with reasons
- "Gameplan →" link navigates to the Playbooks tab
- Hidden when no upcoming game exists; shows neutral message when insufficient data

**Files changed:**
- `web/src/gameplanRec.ts` — new file: extracted `generateGameplanRecommendation()`
- `web/src/App.tsx` — added `league` prop to PlaybooksView, replaced inline recommendation with helper call, added Weekly Prep panel to dashboard sidebar
- `web/src/App.css` — `.wp-*` styles for Weekly Prep panel

---

## 2026-03-27 — Weekly League Report / Headlines

**What:** Auto-generated weekly report summarizing league activity — headlines, notable games, top performers, standout teams, and meta insights.

**Generator** (`web/src/weeklyReport.ts`):
- Computes report from `league.currentSeason.games` (current week's box scores), `standings`, and `metaProfile`
- **Headlines** (3-6): standings leaders, shootouts, nail-biters, blowouts, defensive struggles, big performances, meta trends
- **Notable games**: highest scoring (≥40 combined), closest (≤3pt margin), biggest blowout (≥21pt margin), defensive battle (≤20 combined)
- **Top performers**: top passer (≥10 att), top rusher (≥5 car, ≥50 yds), top receiver (≥3 rec, ≥60 yds) — extracted from weekly box scores
- **Standout teams**: best record (≥2 wins), biggest win this week (≥14pt margin)
- **Meta summary**: reuses existing `metaProfile` insight sentences

**UI**: Panel at top of dashboard feed column, above the League Feed. Styled with left-border accent headlines, game score cards with tags, performer stat lines, and italic meta insight.

**Files changed:**
- `web/src/weeklyReport.ts` — new file: report generator
- `web/src/App.tsx` — import, compute `weeklyReport` in DashboardView, render panel
- `web/src/App.css` — `.wr-*` styles

**Graceful handling**: Returns `null` (panel hidden) when week < 1 or no final games exist. Handles missing box scores, sparse stats, and undefined meta.

---

## 2026-03-27 — Custom Offensive Play Creator (Phase 1 MVP)

**What:** Users can now create custom offensive plays with structured route assignments and use them in custom playbooks.

**Data model:** Custom plays use the existing `OffensivePlay` interface — no new type. Stored as `team.customOffensivePlays?: OffensivePlay[]` (max 20 per team). IDs prefixed with `custom_` to avoid collisions with built-in plays.

**Validation rules (enforced both client-side and server-side):**
- Play name required, max 60 chars, no duplicates (case-insensitive)
- Formation must exist in the library
- engineType must be one of: inside_run, outside_run, short_pass, medium_pass, deep_pass
- Pass plays: at least one route, at most 3 DEEP routes, at least one SHORT or MEDIUM route
- Run plays: must specify ballCarrierSlot (RB or FB), slot must exist in formation
- Slots must be valid for the chosen formation, no duplicate slot assignments

**Integration:**
- `selectOffensivePlay()` now searches both `OFFENSIVE_PLAYS` and `team.customOffensivePlays`
- `save-offense-playbook` endpoint accepts custom play IDs alongside built-in play IDs
- Custom plays appear in the playbook editor's play picker
- Same weight pipeline: tendency × repetition × context multipliers apply to custom plays
- Explanation system works with custom plays (same `buildExplanation()` path)

**Backend endpoints:**
- `POST /league/:id/save-custom-play` — create/update custom play with validation
- `POST /league/:id/delete-custom-play` — delete custom play (blocked if used in a playbook)

**UI:** New "Custom Plays" section in PlaybooksView (offense tab):
- Card grid showing existing custom plays with formation, type, route tags
- Play creator form: name, formation, play type, play action checkbox, route assignments per slot (pass) or ball carrier (run)
- Real-time client-side validation, Edit and Delete buttons per card

**Files changed:**
- `src/models/Team.ts` — added `customOffensivePlays?: OffensivePlay[]` to Team, imported OffensivePlay
- `src/server.ts` — added `save-custom-play` and `delete-custom-play` endpoints, updated `save-offense-playbook` to accept custom play IDs
- `src/engine/playSelection.ts` — `selectOffensivePlay()` accepts and searches `customPlays[]`, `resolvePlay()` passes `team.customOffensivePlays`
- `web/src/types.ts` — added `customOffensivePlays` to frontend Team type
- `web/src/api.ts` — added `saveCustomPlay` and `deleteCustomPlay` API calls
- `web/src/App.tsx` — custom play creator state/handlers, Custom Plays section in PlaybooksView, custom plays merged into playbook editor's play list
- `web/src/App.css` — all custom play creator styles

**No engine math changes. All compiles clean. Benchmark stable.**

---

## 2026-03-27 — Play Selection Intelligence & Game Presentation Overhaul

**What:** Six features implemented across play selection and game presentation:

1. **Team Tendencies in Playbook Selection** — Moved tendency modifiers (`runPassBias`, `aggressiveness`, `shotPlayRate`) from the legacy `selectPlayType()` fallback into `selectOffensivePlay()` as weight multipliers. Legacy path is now a clean playcalling-weights-only fallback.

2. **Repetition Penalties (Anti-Spam)** — Added `PlayHistory` tracking (last 6 plays per team). Same play last play → ×0.6, repeated 2+ times → ×0.4, same concept → ×0.7, same formation → ×0.85. Floor at 0.1.

3. **Coach Archetypes** — 8 preset coaching styles (Balanced, West Coast, Vertical, Run Heavy, Play Action, Aggressive Defense, Coverage Defense, Run Stop Defense) that auto-configure all 7 tendency sliders. Purely frontend — uses existing `set-tendencies` endpoint.

4. **Game Context Modifiers** — Score, time, and field position tilt play weights: losing late boosts passes (+20%), winning late boosts runs (+20%), red zone suppresses deep (-30%), backed up suppresses passes (-15%).

5. **Play Explanation System** — Each resolved play carries human-readable `explanation[]` strings (tendency, repetition, context reasons). Shown via "🧠 Logic" toggle in GameViewer and GameCenterView.

6. **Natural Language Commentary** — Replaced raw play text with varied templates (3-5 per play type/result). Deterministic seeding prevents re-render flickering. Handles negative yards, big plays, special teams.

7. **Drive Summaries & Postgame Recap** — New `gameRecap.ts` module reconstructs drives from events, identifies key moments (TDs, turnovers, big plays, long drives), and generates templated recap headline + paragraph. New "Recap" tab (default) in GameDetail. Recap section in GameCenterView after game completion.

**Weight pipeline:** `baseWeight × tendencyMult × repPenalty × contextMult = finalWeight`

**Files changed:**
- `src/engine/playSelection.ts` — tendency multipliers, repetition penalties, context modifiers, explanation builder
- `src/engine/simulateGame.ts` — play history creation, explanation attachment to PlayEvent
- `src/models/PlayEvent.ts` — added `explanation?: string[]`
- `web/src/types.ts` — coach archetypes, frontend PlayEvent/PlayType sync
- `web/src/App.tsx` — archetype picker, commentary templates, logic toggle, recap tab
- `web/src/App.css` — all new styles
- `web/src/gameRecap.ts` — new file: drive summaries, key moments, postgame recap

**No engine math changes. All compiles clean. Benchmark stable.**

---

## 2026-03-29 — Penalty Accept/Decline, NFL Overtime, Safety Fix

**What:** Three engine enhancements in one session:

### 1. Penalty Accept/Decline System
- Penalties are no longer automatically applied. The opposing team now evaluates whether to accept or decline.
- **Defensive penalties**: Offense decides — declines if the play result gained more yards or achieved a first down.
- **Offensive penalties**: Defense decides — declines if the play was already bad for the offense (TFL, sack, incomplete).
- `PenaltyInfo` extended: `accepted: boolean`, `declinedPlayYards?: number`.
- Play-by-play shows "ACCEPTED" or "DECLINED" with flag emoji on every penalty.
- Validated: ~25% of penalties are declined (realistic — big plays through defensive holding, etc.).

### 2. NFL Overtime Rules
- **Regular season**: One 10-minute OT period, modified sudden death. First-possession TD ends game immediately. First-possession FG gives other team a chance. After both teams have possessed, sudden death applies. Can still end in tie.
- **Postseason**: Unlimited OT periods until a winner (no ties ever).
- `simulateGame()` now accepts `options?: { isPlayoff?: boolean }`.
- `postseason.ts` passes `{ isPlayoff: true }` — playoff ties no longer possible.
- OT uses full play selection pipeline (playbooks, formations, penalties, fatigue, injuries).
- Added `TUNING.overtime`: `secondsPerPeriod: 600`, `maxPlaysPerPeriod: 40`.
- Quarter 5 = OT, Quarter 6 = OT2, etc. Play-by-play formats as "OT", "OT2".
- Validated: ~4.5% of games go to OT (NFL ~5%), playoff ties = 0.

### 3. Safety Threshold Fix
- `safety.yardLineThreshold: 5 → 1` — safeties only trigger when TFL/sack pushes ball behind the 1-yard line.
- Previous 5-yard threshold was too broad — routine TFLs at the 4 shouldn't be safeties.

**Files changed:**
- `src/engine/config.ts` — safety threshold, OT config section
- `src/engine/simulateGame.ts` — penalty accept/decline logic, OT loop, `isPlayoff` option
- `src/engine/postseason.ts` — passes `{ isPlayoff: true }` to simulateGame
- `src/models/PlayEvent.ts` — `PenaltyInfo.accepted`, `PenaltyInfo.declinedPlayYards`
- `src/engine/playByPlay.ts` — penalty accept/decline display, OT quarter labels

**All docs updated. TypeScript compiles clean. Bench + 200-game validation pass.**

---

## 2026-03-29 — Play-by-Play Broadcast Experience (10 Features)

**What:** Major enhancement to the GameCenterView, transforming the play-by-play experience from a basic viewer into a broadcast-like presentation with live data overlays.

### Features Implemented

1. **Drive Summary Strip** — shows current drive plays/yards/time in the scoreboard. `driveTracker.ts` walks backward from current play to find drive start.

2. **Momentum Tug-of-War Bar** — 6px bar with glowing dot between team labels. Rolling 8-play window scores events (TD=+3, turnover=-3, first down=+1, sack=-1). Clamped to [-5,+5], mapped to 0-100% position. `momentum.ts`.

3. **Key Play Flash** — field border flashes gold (TD), red (turnover), or orange (big play) via CSS keyframes. 1.8s duration, smooth ease. New `flashType` state in FieldView.

4. **Red Zone Overlay** — translucent red (12% opacity) overlay on last 20% of field when `yardLine >= 80`. "RED ZONE" micro-label. CSS fade transition.

5. **Penalty Inline Display** — penalty info now embedded inside commentary box below the play text. Orange divider, flag emoji, penalty name, ACCEPTED/DECLINED badge, and yards comparison reason. Replaced the old appended-text approach.

6. **OT Drama** — pulsing amber "OVERTIME" badge replaces quarter label when `quarter > 4`. Field gets amber inset glow. Momentum bar track tints amber.

7. **Around-the-League Toasts** — `leagueAlerts.ts` scans other week games for lead-changing TDs, late turnovers, and close finishes. Maps events to 0-100% game progress. Toasts pop up as overlay at bottom of field area, auto-dismiss after 3.5s. Styled by kind (touchdown/turnover/close/final).

8. **Bottom Score Ticker** — full-width bar spanning all 3 columns. Shows all other final scores in the week. Mono font, separated by dots.

9. **H2H Rivalry Stats** — when opponent team has an `ownerId` (human player), shows series record and last result in left panel. Scans current season completed games.

10. **Post-Game Highlights Reel** — `highlights.ts` ranks plays by absolute score differential swing. Top 5 shown with rank, description, quarter, and swing value. Each is a clickable button that jumps the replay to that play index.

### Layout Change
GameCenterView upgraded from 3-column to "4-zone" layout: existing 3-column grid + bottom elements (ticker, quarter scores, highlights) spanning full width via `grid-column: 1 / -1`.

### New Files Created
- `web/src/momentum.ts` — momentum calculation
- `web/src/driveTracker.ts` — drive summary computation
- `web/src/highlights.ts` — score-swing highlights generation
- `web/src/leagueAlerts.ts` — around-the-league alert generation + timing

### Files Modified
- `web/src/FieldView.tsx` — new props (momentumPct, momentumLeader, driveText), red zone overlay, flash types, OT treatment, penalty inline JSX, score pulse
- `web/src/App.tsx` — imports, GameCenterView: momentum/drive/alerts/highlights computation, H2H rivalry, toast overlay, bottom ticker, points-by-quarter table, highlights reel
- `web/src/App.css` — ~350 lines of new styles for all 10 features

**Frontend-only. No backend changes. TypeScript compiles clean. Build succeeds.**

---

_Add new entries above this line, newest first._
