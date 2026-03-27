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

_Add new entries above this line, newest first._
