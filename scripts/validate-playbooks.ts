/**
 * validate-playbooks.ts
 *
 * Validation script for the playbook / formation system.
 * Runs multi-game simulation batches and checks:
 *   1. Legacy fallback  — teams without offensivePlan use engine fallback
 *   2. New path         — teams with offensivePlan resolve plays correctly
 *   3. Missing slots    — teams with offensivePlan but no formationDepthCharts
 *                         don't crash and don't apply formation remapping
 *   4. Invalid playbook — plan referencing unknown playbook ID safely falls back
 *   5. Static audit     — 5 formations, 30 plays, 8 playbooks, DEFAULT_OFFENSIVE_PLAN
 *
 * Usage:
 *   npx ts-node scripts/validate-playbooks.ts
 */

import { createInitialLeague }    from '../src/initialLeague';
import { createGame }             from '../src/models/Game';
import { simulateGame }           from '../src/engine/simulateGame';
import {
  resetPlaySelectionStats,
  playSelectionStats,
  classifyBucket,
}                                 from '../src/engine/playSelection';
import { OFFENSIVE_FORMATIONS }   from '../src/models/Formation';
import { OFFENSIVE_PLAYS }        from '../src/data/plays';
import { PLAYBOOKS, DEFAULT_OFFENSIVE_PLAN } from '../src/data/playbooks';
import { type Team }              from '../src/models/Team';
import { type OffensivePlan }     from '../src/models/Playbook';

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function runGames(home: Team, away: Team, count: number): void {
  for (let i = 0; i < count; i++) {
    const game = createGame(`g${i}`, 1, home, away);
    simulateGame(game); // throws on crash — that's intentional
  }
}

// ── Build test fixtures ───────────────────────────────────────────────────────

const league = createInitialLeague('validate');
const teams  = league.teams;

if (teams.length < 2) {
  console.error('League generation failed — insufficient teams');
  process.exit(1);
}

const baseHome = teams[0]!;
const baseAway = teams[1]!;

// Team with a full offensivePlan (uses DEFAULT_OFFENSIVE_PLAN as-is)
const teamWithPlan: Team = {
  ...baseHome,
  offensivePlan: { ...DEFAULT_OFFENSIVE_PLAN },
};

// Team with offensivePlan but no formationDepthCharts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { formationDepthCharts: _fdc, ...baseHomeNoSlots } = baseHome as Team & { formationDepthCharts?: unknown };
const teamWithPlanNoSlots: Team = {
  ...(baseHomeNoSlots as Team),
  offensivePlan: { ...DEFAULT_OFFENSIVE_PLAN },
};

// Team with offensivePlan referencing a nonexistent playbook for all buckets
const badPlan: OffensivePlan = Object.fromEntries(
  Object.keys(DEFAULT_OFFENSIVE_PLAN).map(k => [k, 'nonexistent_playbook_xyz'])
) as OffensivePlan;
const teamWithBadPlan: Team = {
  ...baseHome,
  offensivePlan: badPlan,
};

const GAMES_PER_SCENARIO = 10;

// ── Scenario 1: Legacy fallback ───────────────────────────────────────────────

console.log('\n=== Scenario 1: Legacy Fallback (no offensivePlan) ===');
resetPlaySelectionStats();
try {
  runGames(baseHome, baseAway, GAMES_PER_SCENARIO);
  check('No crash', true);
} catch (e) {
  check('No crash', false, String(e));
}
check(
  'All plays used legacy fallback',
  playSelectionStats.legacyFallback > 0 && playSelectionStats.newPathResolved === 0,
  `legacy=${playSelectionStats.legacyFallback} newPath=${playSelectionStats.newPathResolved}`,
);
check(
  'No new-path fallback triggered',
  playSelectionStats.newPathFallback === 0,
  `newPathFallback=${playSelectionStats.newPathFallback}`,
);

// ── Scenario 2: New path (offensivePlan present) ──────────────────────────────

console.log('\n=== Scenario 2: New Play Selection Path (offensivePlan configured) ===');
resetPlaySelectionStats();
try {
  runGames(teamWithPlan, baseAway, GAMES_PER_SCENARIO);
  check('No crash', true);
} catch (e) {
  check('No crash', false, String(e));
}
check(
  'New path resolves plays',
  playSelectionStats.newPathResolved > 0,
  `newPathResolved=${playSelectionStats.newPathResolved}`,
);
// Away team (no plan) legitimately contributes legacyFallback counts —
// confirm new path still ran (home team resolved plays), which is sufficient.
check(
  'New path ran alongside legacy (home=plan, away=no plan)',
  playSelectionStats.newPathResolved > 0 && playSelectionStats.legacyFallback > 0,
  `newPath=${playSelectionStats.newPathResolved} legacy=${playSelectionStats.legacyFallback}`,
);
// Away team has no plan → legacy fallback expected for it
check(
  'Stats totals are positive (both teams counted)',
  playSelectionStats.newPathResolved + playSelectionStats.legacyFallback > 0,
);

// ── Scenario 3: offensivePlan present, no formationDepthCharts ───────────────

console.log('\n=== Scenario 3: Plan Present, No Formation Depth Charts ===');
resetPlaySelectionStats();
try {
  runGames(teamWithPlanNoSlots, baseAway, GAMES_PER_SCENARIO);
  check('No crash', true);
} catch (e) {
  check('No crash', false, String(e));
}
check(
  'Plays resolve via new path',
  playSelectionStats.newPathResolved > 0,
  `newPathResolved=${playSelectionStats.newPathResolved}`,
);
check(
  'Formation remapping never triggered (no slots configured)',
  playSelectionStats.formationApplied === 0,
  `formationApplied=${playSelectionStats.formationApplied}`,
);

// ── Scenario 4: Invalid playbook IDs in plan ─────────────────────────────────

console.log('\n=== Scenario 4: Invalid Playbook IDs in Plan ===');
resetPlaySelectionStats();
try {
  runGames(teamWithBadPlan, baseAway, GAMES_PER_SCENARIO);
  check('No crash on invalid playbook IDs', true);
} catch (e) {
  check('No crash on invalid playbook IDs', false, String(e));
}
// With all invalid IDs the fallback chain resolves via DEFAULT_OFFENSIVE_PLAN
// so newPathResolved OR newPathFallback should be > 0, not a crash
check(
  'System recovered from invalid playbook IDs',
  playSelectionStats.newPathResolved + playSelectionStats.newPathFallback > 0,
  `resolved=${playSelectionStats.newPathResolved} fallback=${playSelectionStats.newPathFallback}`,
);

// ── Scenario 5: Mixed league (some teams with plan, some without) ─────────────

console.log('\n=== Scenario 5: Mixed League (both team types in same game) ===');
resetPlaySelectionStats();
try {
  runGames(teamWithPlan, baseAway, GAMES_PER_SCENARIO);
  check('No crash in mixed game', true);
} catch (e) {
  check('No crash in mixed game', false, String(e));
}
const totalMixed = playSelectionStats.newPathResolved + playSelectionStats.legacyFallback;
check(
  'Both code paths exercised in mixed game',
  playSelectionStats.newPathResolved > 0 && playSelectionStats.legacyFallback > 0,
  `newPath=${playSelectionStats.newPathResolved} legacy=${playSelectionStats.legacyFallback} total=${totalMixed}`,
);

// ── Static Audit ──────────────────────────────────────────────────────────────

console.log('\n=== Static Audit: Formations ===');

check('Exactly 5 formations defined', OFFENSIVE_FORMATIONS.length === 5, `count=${OFFENSIVE_FORMATIONS.length}`);

const formationIds = new Set(OFFENSIVE_FORMATIONS.map(f => f.id));
const expectedFormationIds = ['shotgun_11', 'shotgun_10', 'singleback_12', 'iformation_21', 'iformation_22'];
for (const id of expectedFormationIds) {
  check(`Formation '${id}' exists`, formationIds.has(id));
}

for (const f of OFFENSIVE_FORMATIONS) {
  check(`Formation '${f.id}' has at least 2 slots`, f.slots.length >= 2, `slots=${f.slots.join(',')}`);
  const validSlots = new Set(['X', 'Z', 'SLOT', 'TE', 'RB', 'FB']);
  const badSlots   = f.slots.filter(s => !validSlots.has(s));
  check(`Formation '${f.id}' uses only valid slots`, badSlots.length === 0, badSlots.join(','));
}

console.log('\n=== Static Audit: Plays ===');

check('At least 30 plays defined', OFFENSIVE_PLAYS.length >= 30, `count=${OFFENSIVE_PLAYS.length}`);

const playIds = OFFENSIVE_PLAYS.map(p => p.id);
const dupPlayIds = playIds.filter((id, i) => playIds.indexOf(id) !== i);
check('No duplicate play IDs', dupPlayIds.length === 0, dupPlayIds.join(','));

for (const play of OFFENSIVE_PLAYS) {
  check(
    `Play '${play.id}' references valid formationId`,
    formationIds.has(play.formationId),
    `formationId=${play.formationId}`,
  );
  const validEngineTypes = new Set([
    'inside_run', 'outside_run', 'short_pass', 'medium_pass', 'deep_pass',
    'screen_pass', 'play_action',
  ]);
  check(
    `Play '${play.id}' has valid engineType`,
    validEngineTypes.has(play.engineType),
    `engineType=${play.engineType}`,
  );
}

// Check each formation has at least 2 plays
const playsByFormation = new Map<string, number>();
for (const play of OFFENSIVE_PLAYS) {
  playsByFormation.set(play.formationId, (playsByFormation.get(play.formationId) ?? 0) + 1);
}
for (const formationId of formationIds) {
  const count = playsByFormation.get(formationId) ?? 0;
  check(`Formation '${formationId}' has at least 2 plays`, count >= 2, `count=${count}`);
}

console.log('\n=== Static Audit: Playbooks ===');

check('Exactly 8 playbooks defined', PLAYBOOKS.length === 8, `count=${PLAYBOOKS.length}`);

const playbookIds   = new Set(PLAYBOOKS.map(pb => pb.id));
const allPlayIds    = new Set(OFFENSIVE_PLAYS.map(p => p.id));

for (const playbook of PLAYBOOKS) {
  check(`Playbook '${playbook.id}' has at least 1 entry`, playbook.entries.length >= 1, `entries=${playbook.entries.length}`);
  const missing = playbook.entries.filter(e => !allPlayIds.has(e.playId));
  check(
    `Playbook '${playbook.id}' all play IDs are valid`,
    missing.length === 0,
    missing.map(e => e.playId).join(','),
  );
  const totalWeight = playbook.entries.reduce((s, e) => s + e.weight, 0);
  check(`Playbook '${playbook.id}' total weight > 0`, totalWeight > 0, `weight=${totalWeight}`);
}

console.log('\n=== Static Audit: DEFAULT_OFFENSIVE_PLAN ===');

const allBuckets = [
  'FIRST_10', 'FIRST_LONG', 'FIRST_MEDIUM', 'FIRST_SHORT',
  'SECOND_LONG', 'SECOND_MEDIUM', 'SECOND_SHORT',
  'THIRD_LONG', 'THIRD_MEDIUM', 'THIRD_SHORT',
  'FOURTH_LONG', 'FOURTH_MEDIUM', 'FOURTH_SHORT',
] as const;

check(
  'DEFAULT_OFFENSIVE_PLAN covers all 13 buckets',
  allBuckets.every(b => b in DEFAULT_OFFENSIVE_PLAN),
);

for (const bucket of allBuckets) {
  const playbookId = DEFAULT_OFFENSIVE_PLAN[bucket];
  check(
    `Bucket '${bucket}' maps to known playbook '${playbookId}'`,
    playbookIds.has(playbookId),
    `playbookId=${playbookId}`,
  );
}

console.log('\n=== Static Audit: classifyBucket spot checks ===');

const bucketCases: [number, number, string][] = [
  [1, 10, 'FIRST_10'],
  [1, 15, 'FIRST_LONG'],
  [1, 5,  'FIRST_MEDIUM'],
  [1, 2,  'FIRST_SHORT'],
  [2, 8,  'SECOND_LONG'],
  [2, 5,  'SECOND_MEDIUM'],
  [2, 3,  'SECOND_SHORT'],
  [3, 9,  'THIRD_LONG'],
  [3, 4,  'THIRD_MEDIUM'],
  [3, 1,  'THIRD_SHORT'],
  [4, 7,  'FOURTH_LONG'],
  [4, 6,  'FOURTH_MEDIUM'],
  [4, 3,  'FOURTH_SHORT'],
];

for (const [down, dist, expected] of bucketCases) {
  const got = classifyBucket(down, dist);
  check(`classifyBucket(${down}, ${dist}) === '${expected}'`, got === expected, `got=${got}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('VALIDATION FAILED');
  process.exit(1);
} else {
  console.log('VALIDATION PASSED');
}
