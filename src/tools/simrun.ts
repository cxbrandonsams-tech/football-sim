/**
 * Simulation runner CLI.
 *
 * Usage:
 *   npx ts-node src/tools/simrun.ts [seasons] [--verbose]
 *
 * Examples:
 *   npx ts-node src/tools/simrun.ts 100
 *   npx ts-node src/tools/simrun.ts 500 --verbose
 *   npm run simulate -- 100
 *
 * Defaults to 100 seasons if no argument is provided.
 */

import { createInitialLeague }                from '../initialLeague';
import { runHarness, formatReport, checkTargets } from '../engine/harness';

// ── Parse args ────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const seasons = parseInt(args.find(a => /^\d+$/.test(a)) ?? '100', 10);
const verbose = args.includes('--verbose') || args.includes('-v');

if (isNaN(seasons) || seasons < 1) {
  console.error('Usage: npx ts-node src/tools/simrun.ts [seasons] [--verbose]');
  process.exit(1);
}

// ── Bootstrap teams from the initial league ───────────────────────────────────

const league    = createInitialLeague('harness');
const { teams, divisions } = league;

// ── Run ───────────────────────────────────────────────────────────────────────

const startMs = Date.now();

console.log(`\nSimulating ${seasons} season${seasons === 1 ? '' : 's'} (${teams.length} teams, ${divisions.length} divisions)...\n`);

const report = runHarness(teams, divisions, {
  seasons,
  onProgress(done, total) {
    if (verbose || done % Math.max(1, Math.floor(total / 10)) === 0 || done === total) {
      const pct = Math.round((done / total) * 100);
      process.stdout.write(`  ${done}/${total} seasons  (${pct}%)\r`);
    }
  },
});

process.stdout.write('\n');

const elapsedMs = Date.now() - startMs;
const elapsedStr = elapsedMs < 1000
  ? `${elapsedMs}ms`
  : `${(elapsedMs / 1000).toFixed(1)}s`;

console.log(`\nCompleted in ${elapsedStr}\n`);

// ── Print report ──────────────────────────────────────────────────────────────

console.log(formatReport(report));

// ── Target summary ────────────────────────────────────────────────────────────

const checks = checkTargets(report);
const passed = checks.filter(c => c.pass).length;
const total  = checks.length;

console.log(`\n Targets: ${passed}/${total} in range`);
if (passed < total) {
  console.log('');
  for (const c of checks) {
    if (!c.pass) {
      console.log(`   ✗  ${c.key.padEnd(20)} got ${c.value.toFixed(2)}  (target ${c.target.label})`);
    }
  }
}
console.log('');
