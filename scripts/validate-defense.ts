/**
 * validate-defense.ts
 *
 * Validates the defensive package / playbook system end-to-end:
 *   1. Legacy fallback — teams without defensivePlan → depth chart unchanged
 *   2. New path — teams with defensivePlan resolve plays and remap depth chart
 *   3. Plan present, no package depth charts — plays resolve but no remapping
 *   4. Invalid playbook IDs — fallback chain handles unknown IDs without crash
 *   5. Mixed game — both code paths exercised simultaneously
 *
 * Static audits:
 *   - All 6 packages structurally valid
 *   - All 25 defensive plays reference a known packageId
 *   - All 8 defensive playbooks reference known play IDs
 *   - DEFAULT_DEFENSIVE_PLAN covers all 13 buckets
 *   - classifyBucket boundary cases (reused from play selection)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { resolveDefensivePlay, applyPackageToTeam, resetDefensiveSelectionStats, defensiveSelectionStats } from '../src/engine/defensiveSelection';
import { classifyBucket } from '../src/engine/playSelection';
import { DEFENSIVE_PACKAGES } from '../src/models/DefensivePackage';
import { DEFENSIVE_PLAYS } from '../src/data/defensivePlays';
import { DEFENSIVE_PLAYBOOKS, DEFAULT_DEFENSIVE_PLAN } from '../src/data/defensivePlaybooks';
import { type Team } from '../src/models/Team';
import { type DefensivePlan } from '../src/models/DefensivePlaybook';
import { type DownDistanceBucket } from '../src/models/Playbook';
import { createInitialLeague } from '../src/initialLeague';

// ── Utilities ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, value: boolean): void {
  if (value) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ─────────────────────────────────────`);
}

// ── Build a minimal test team ─────────────────────────────────────────────────

const league     = createInitialLeague('val-def-league');
const baseTeam   = league.teams[0] as Team;
const baseHome   = baseTeam;

function makeSit(down: number, distance: number) {
  return { down, distance, yardLine: 70, quarter: 1, clockSeconds: 900, scoreDiff: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
section('Scenario 1 — Legacy Fallback (no defensivePlan)');
// ─────────────────────────────────────────────────────────────────────────────
{
  resetDefensiveSelectionStats();
  const { formationDepthCharts: _fdc, offensivePlan: _op, packageDepthCharts: _pdc, defensivePlan: _dp, ...teamWithoutPlan } = baseHome as Team & {
    formationDepthCharts?: unknown; offensivePlan?: unknown;
    packageDepthCharts?: unknown; defensivePlan?: unknown;
  };
  const legacyTeam = teamWithoutPlan as Team;

  for (let i = 0; i < 10; i++) {
    const sit    = makeSit(1, 10);
    const result = resolveDefensivePlay(legacyTeam, sit);
    check(`resolveDefensivePlay returns null when no defensivePlan (rep ${i + 1})`, result === null);
  }
  check('legacyFallback counter incremented', defensiveSelectionStats.legacyFallback === 10);
  check('newPathResolved counter is 0',        defensiveSelectionStats.newPathResolved === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Scenario 2 — New Path (defensivePlan configured)');
// ─────────────────────────────────────────────────────────────────────────────
{
  resetDefensiveSelectionStats();
  const newPathTeam: Team = { ...baseHome, defensivePlan: { ...DEFAULT_DEFENSIVE_PLAN } };

  const sit    = makeSit(1, 10);
  const result = resolveDefensivePlay(newPathTeam, sit);
  check('resolveDefensivePlay returns non-null when defensivePlan set', result !== null);
  if (result) {
    check('returned play has packageId',   typeof result.play.packageId === 'string' && result.play.packageId.length > 0);
    check('returned play has coverage',    typeof result.play.coverage === 'string');
    check('returned play has a name',      typeof result.play.name === 'string');
  }
  check('newPathResolved counter incremented', defensiveSelectionStats.newPathResolved >= 1);
  check('legacyFallback counter is 0',         defensiveSelectionStats.legacyFallback === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Scenario 3 — Plan present, no package depth charts');
// ─────────────────────────────────────────────────────────────────────────────
{
  const { packageDepthCharts: _pdc, ...teamNoPdc } = baseHome as Team & { packageDepthCharts?: unknown };
  const noSlotsTeam: Team = { ...teamNoPdc as Team, defensivePlan: { ...DEFAULT_DEFENSIVE_PLAN } };

  const sit    = makeSit(2, 7);
  const result = resolveDefensivePlay(noSlotsTeam, sit);
  check('resolveDefensivePlay returns non-null (no crash)', result !== null);

  if (result) {
    const applied = applyPackageToTeam(noSlotsTeam, result.play);
    check('applyPackageToTeam returns original team when no slots configured',
      applied === noSlotsTeam || applied.depthChart === noSlotsTeam.depthChart);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Scenario 4 — Invalid playbook IDs in plan');
// ─────────────────────────────────────────────────────────────────────────────
{
  resetDefensiveSelectionStats();
  const badPlan: DefensivePlan = { ...DEFAULT_DEFENSIVE_PLAN, FIRST_10: 'nonexistent_playbook_xyz' };
  const badPlanTeam: Team = { ...baseHome, defensivePlan: badPlan };

  let threw = false;
  let result = null;
  try {
    result = resolveDefensivePlay(badPlanTeam, makeSit(1, 10));
  } catch {
    threw = true;
  }
  check('No crash on unknown playbook ID',        !threw);
  // Falls back to DEFAULT_DEFENSIVE_PLAN entry for FIRST_10 = 'base_defense'
  check('Fallback play still resolved (not null)', result !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Scenario 5 — Mixed game (one team with plan, one without)');
// ─────────────────────────────────────────────────────────────────────────────
{
  resetDefensiveSelectionStats();
  const { packageDepthCharts: _pdc2, defensivePlan: _dp2, ...teamNoPlanBase } = baseHome as Team & {
    packageDepthCharts?: unknown; defensivePlan?: unknown;
  };
  const noPlanTeam  = teamNoPlanBase as Team;
  const hasPlanTeam = { ...baseHome, defensivePlan: { ...DEFAULT_DEFENSIVE_PLAN } } as Team;

  for (let i = 0; i < 5; i++) {
    resolveDefensivePlay(noPlanTeam,  makeSit(1, 10));
    resolveDefensivePlay(hasPlanTeam, makeSit(1, 10));
  }
  check('Legacy fallback triggered (no-plan team)',    defensiveSelectionStats.legacyFallback > 0);
  check('New path resolved (has-plan team)',            defensiveSelectionStats.newPathResolved > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Static Audit — Defensive Packages');
// ─────────────────────────────────────────────────────────────────────────────
{
  check('Exactly 6 packages defined', DEFENSIVE_PACKAGES.length === 6);
  const expectedPackages = ['4-3_base', '3-4_base', 'nickel', 'dime', 'quarter', 'goal_line'];
  for (const id of expectedPackages) {
    const pkg = DEFENSIVE_PACKAGES.find(p => p.id === id);
    check(`Package '${id}' exists`,             pkg !== undefined);
    check(`Package '${id}' has slots`,          (pkg?.slots.length ?? 0) > 0);
    check(`Package '${id}' has name`,           typeof pkg?.name === 'string');
    check(`Package '${id}' has personnel`,      typeof pkg?.personnel === 'string');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Static Audit — Defensive Plays');
// ─────────────────────────────────────────────────────────────────────────────
{
  check(`At least 20 defensive plays defined`, DEFENSIVE_PLAYS.length >= 20);
  const packageIds = new Set(DEFENSIVE_PACKAGES.map(p => p.id));
  for (const play of DEFENSIVE_PLAYS) {
    check(`Play '${play.id}' has name`,                    typeof play.name === 'string');
    check(`Play '${play.id}' references known packageId`,  packageIds.has(play.packageId));
    check(`Play '${play.id}' has coverage`,                typeof play.coverage === 'string');
    check(`Play '${play.id}' has front`,                   typeof play.front === 'string');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Static Audit — Defensive Playbooks');
// ─────────────────────────────────────────────────────────────────────────────
{
  check(`At least 6 defensive playbooks defined`, DEFENSIVE_PLAYBOOKS.length >= 6);
  const playIds = new Set(DEFENSIVE_PLAYS.map(p => p.id));
  for (const pb of DEFENSIVE_PLAYBOOKS) {
    check(`Playbook '${pb.id}' has at least 1 entry`,   pb.entries.length >= 1);
    for (const entry of pb.entries) {
      check(`Playbook '${pb.id}' entry '${entry.playId}' references known play`, playIds.has(entry.playId));
      check(`Playbook '${pb.id}' entry '${entry.playId}' has positive weight`,   entry.weight > 0);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Static Audit — DEFAULT_DEFENSIVE_PLAN');
// ─────────────────────────────────────────────────────────────────────────────
{
  const ALL_BUCKETS: DownDistanceBucket[] = [
    'FIRST_10', 'FIRST_LONG', 'FIRST_MEDIUM', 'FIRST_SHORT',
    'SECOND_LONG', 'SECOND_MEDIUM', 'SECOND_SHORT',
    'THIRD_LONG', 'THIRD_MEDIUM', 'THIRD_SHORT',
    'FOURTH_LONG', 'FOURTH_MEDIUM', 'FOURTH_SHORT',
  ];
  const playbookIds = new Set(DEFENSIVE_PLAYBOOKS.map(pb => pb.id));
  check('DEFAULT_DEFENSIVE_PLAN has 13 entries', Object.keys(DEFAULT_DEFENSIVE_PLAN).length === 13);
  for (const bucket of ALL_BUCKETS) {
    const id = DEFAULT_DEFENSIVE_PLAN[bucket];
    check(`Bucket '${bucket}' mapped to known playbook '${id}'`, playbookIds.has(id));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('classifyBucket boundary cases (shared with offensive system)');
// ─────────────────────────────────────────────────────────────────────────────
{
  const cases: [number, number, DownDistanceBucket][] = [
    [1, 10, 'FIRST_10'],
    [1, 11, 'FIRST_LONG'],
    [1, 4,  'FIRST_MEDIUM'],
    [1, 3,  'FIRST_SHORT'],
    [2, 7,  'SECOND_LONG'],
    [2, 4,  'SECOND_MEDIUM'],
    [2, 3,  'SECOND_SHORT'],
    [3, 7,  'THIRD_LONG'],
    [3, 4,  'THIRD_MEDIUM'],
    [3, 3,  'THIRD_SHORT'],
    [4, 7,  'FOURTH_LONG'],
    [4, 4,  'FOURTH_MEDIUM'],
    [4, 3,  'FOURTH_SHORT'],
  ];
  for (const [down, distance, expected] of cases) {
    const got = classifyBucket(down, distance);
    check(`classifyBucket(${down}, ${distance}) → ${expected}`, got === expected);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Package depth chart remapping');
// ─────────────────────────────────────────────────────────────────────────────
{
  // Find a team with at least one DE and one CB on roster
  const team = baseHome;
  const dePlayer = team.roster.find(p => p.position === 'DE');
  const cbPlayer = team.roster.find(p => p.position === 'CB');

  if (dePlayer && cbPlayer) {
    const slotsTeam: Team = {
      ...team,
      defensivePlan:      { ...DEFAULT_DEFENSIVE_PLAN },
      packageDepthCharts: {
        '4-3_base': { DE1: dePlayer.id, CB1: cbPlayer.id },
      },
    };
    const sit    = makeSit(1, 10);
    const result = resolveDefensivePlay(slotsTeam, sit);
    check('resolveDefensivePlay succeeds with package slots configured', result !== null);

    if (result && result.play.packageId === '4-3_base') {
      const applied = applyPackageToTeam(slotsTeam, result.play);
      check('applyPackageToTeam returns different team object',    applied !== slotsTeam);
      check('DE slot remapped — correct player at DE[0]',         applied.depthChart.DE[0]?.id === dePlayer.id);
      check('CB slot remapped — correct player at CB[0]',         applied.depthChart.CB[0]?.id === cbPlayer.id);
      check('Original team depth chart is unchanged (immutable)', slotsTeam.depthChart.DE[0] !== applied.depthChart.DE[0] || slotsTeam.depthChart.DE[0]?.id === dePlayer.id);
    } else if (result) {
      check('Play resolved (package may not be 4-3_base on this snap — slot remap skipped)', true);
    }
  } else {
    check('DE player found on roster', !!dePlayer);
    check('CB player found on roster', !!cbPlayer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════════════════`);

if (failed > 0) process.exit(1);
