/**
 * Large-sample validation script.
 *
 * Simulates N individual games between randomly-paired teams and reports
 * mean / std-dev / min / max / status for each metric.
 *
 * Usage:
 *   npx ts-node scripts/large-sample-val.ts            # 1 000 games
 *   npx ts-node scripts/large-sample-val.ts 5000       # 5 000 games
 */

import { createInitialLeague } from '../src/initialLeague';
import { simulateGame }        from '../src/engine/simulateGame';
import { createGame }          from '../src/models/Game';
import { type PlayEvent }      from '../src/models/PlayEvent';

// ── CLI arg ───────────────────────────────────────────────────────────────────

const N = parseInt(process.argv[2] ?? '1000', 10);
if (isNaN(N) || N < 1) { console.error('Usage: large-sample-val.ts [N]'); process.exit(1); }

// ── Bootstrap league for its teams ────────────────────────────────────────────

const league = createInitialLeague('val-league');
const teams  = league.teams;
const T      = teams.length; // 32

// ── Per-game accumulators ──────────────────────────────────────────────────────

interface GameSample {
  // Core scoring / drives
  ptsHome:      number;
  ptsAway:      number;
  totalPlays:   number;
  drives:       number;          // estimated as possessions

  // Sacks
  sacksTotal:   number;

  // 3rd-down
  d3Attempts:   number;
  d3Conv:       number;

  // Explosive plays (per team per game)
  runs:         number;
  runs10plus:   number;
  runs20plus:   number;

  passAtt:      number;
  passComp:     number;
  shortPassComp: number;
  shortPass20plus: number;

  medDeepComp:  number;
  medDeep20plus: number;

  allPass20plus: number;

  // TDs / scoring plays
  tdTotal:      number;
  longTDs:      number;          // TDs on plays ≥ 20 yards

  // Player volume (per QB / per RB)
  passYards:    number;          // sum of QB passing yards this game
  passAttempts: number;
  rushYards:    number;
  rushCarries:  number;
  recYards:     number;
  receptions:   number;
}

const samples: GameSample[] = [];

// ── Run N games ────────────────────────────────────────────────────────────────

for (let i = 0; i < N; i++) {
  // Pick two random distinct teams
  const hi = Math.floor(Math.random() * T);
  let ai = Math.floor(Math.random() * (T - 1));
  if (ai >= hi) ai++;

  const homeTeam = teams[hi]!;
  const awayTeam = teams[ai]!;

  const game   = createGame(`g${i}`, 1, homeTeam, awayTeam);
  const result = simulateGame(game);
  const g      = result.game;
  const events: PlayEvent[] = g.events ?? [];

  // ── Aggregate events ────────────────────────────────────────────────────────

  let sacksTotal   = 0;
  let d3Att = 0, d3Conv = 0;
  let runs = 0, runs10 = 0, runs20 = 0;
  let passAtt = 0, passComp = 0;
  let shortComp = 0, short20 = 0;
  let mdComp = 0, md20 = 0;
  let all20 = 0;
  let tdTotal = 0, longTDs = 0;
  let passYards = 0, passAttempts = 0;
  let rushYards = 0, rushCarries = 0;
  let recYards = 0, receptions = 0;

  // Drive counting: count possessions via first-down tracking or change-of-possession proxy
  // Simple proxy: count offensive series starters = plays where down === 1 and it's not a
  // continuation. We'll use scoring play boundaries + 1st-and-10 markers.
  // Easier: use the box score drive data if available, else approximate.
  // Approximation: drives ≈ (punts + TDs + FGs + turnovers + end-of-half/game)
  // We count first-down plays as drive openers: down === 1 && distance === 10 (standard d&d)
  // Actually simplest: count whenever down resets to 1 with ~10 distance (new possession or 1st down).
  // For drive count we'll use: number of times down===1 && distance>=9 (excludes 4th-down conversions
  // which are rare). This is an approximation, not exact.
  // Better: count drive openers = events where (yardLine <= 35 && down === 1) is too noisy.
  // Use: drive = new series whenever down===1 after a possession change (turnover, score, punt).
  // The simplest reliable method without drive metadata: count TDs + FGs + punts + turnovers + 2 (halves).
  // We'll count {td,fg,punt,turnover} events and add 2 for the 2 half-opening drives each team gets.

  let driveEnders = 0; // TDs, FGs, turnovers, punts

  for (const ev of events) {
    // Sacks (do NOT count as drive-enders — sacks push ball back but don't change possession)
    if (ev.type === 'sack') { sacksTotal++; }

    // 3rd down
    if (ev.down === 3) {
      d3Att++;
      if (ev.firstDown || ev.result === 'touchdown') d3Conv++;
    }

    // Runs
    if (ev.type === 'inside_run' || ev.type === 'outside_run') {
      rushCarries++;
      if (ev.result !== 'turnover') {
        runs++;
        const y = ev.yards;
        rushYards += y;
        if (y >= 10) runs10++;
        if (y >= 20) runs20++;
      }
    }

    // Passes
    if (ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass') {
      passAttempts++;
      passAtt++;
      if (ev.result === 'success' || ev.result === 'touchdown') {
        passComp++;
        const y = ev.yards;
        passYards += y;
        recYards  += y;
        receptions++;
        if (ev.type === 'short_pass') {
          shortComp++;
          if (y >= 20) { short20++; all20++; }
        } else {
          mdComp++;
          if (y >= 20) { md20++; all20++; }
        }
      }
    }

    // TDs
    if (ev.result === 'touchdown') {
      tdTotal++;
      if (ev.yards >= 20) longTDs++;
      driveEnders++;
    }

    // Field goals
    if (ev.type === 'field_goal') {
      if (ev.result === 'field_goal_good' || ev.result === 'field_goal_miss') driveEnders++;
    }

    // Punts
    if (ev.type === 'punt') driveEnders++;

    // Turnovers (interceptions, fumbles)
    if (ev.type === 'interception' || ev.result === 'turnover') driveEnders++;
  }

  const drives = driveEnders + 2; // +2 for two opening drives not counted

  samples.push({
    ptsHome:        g.homeScore,
    ptsAway:        g.awayScore,
    totalPlays:     events.length,
    drives,
    sacksTotal,
    d3Attempts:     d3Att,
    d3Conv,
    runs,
    runs10plus:     runs10,
    runs20plus:     runs20,
    passAtt,
    passComp,
    shortPassComp:  shortComp,
    shortPass20plus: short20,
    medDeepComp:    mdComp,
    medDeep20plus:  md20,
    allPass20plus:  all20,
    tdTotal,
    longTDs,
    passYards,
    passAttempts,
    rushYards,
    rushCarries,
    recYards,
    receptions,
  });
}

// ── Statistical helpers ────────────────────────────────────────────────────────

function stats(vals: number[]) {
  const n   = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std  = Math.sqrt(variance);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  return { mean, std, min, max };
}

// ── Derived per-game series ────────────────────────────────────────────────────

// Scoring: average of home + away (points per team per game)
const ptsPerTeam      = samples.map(s => (s.ptsHome + s.ptsAway) / 2);
// Total game points
const totalPts        = samples.map(s => s.ptsHome + s.ptsAway);
// Points per drive (both teams combined: total pts / total drives)
const ptsPerDrive     = samples.map(s => (s.ptsHome + s.ptsAway) / Math.max(s.drives, 1));
const drivesPerGame   = samples.map(s => s.drives);
const playsPerGame    = samples.map(s => s.totalPlays);

const sacksPerTeam    = samples.map(s => s.sacksTotal / 2);

const d3ConvRate      = samples.map(s =>
  s.d3Attempts > 0 ? s.d3Conv / s.d3Attempts : 0
);

// Explosive rates as percentages
// NOTE: denominators match season-sim.ts:
//   runs → rushCarries (all carries including turnovers)
//   passes → passAtt   (all pass attempts including incompletions)
const run10Pct        = samples.map(s =>
  s.rushCarries > 0 ? (s.runs10plus / s.rushCarries) * 100 : 0
);
const run20Pct        = samples.map(s =>
  s.rushCarries > 0 ? (s.runs20plus / s.rushCarries) * 100 : 0
);
// Per-completion metrics (diagnostic only, no strict target)
const short20CompPct  = samples.map(s =>
  s.shortPassComp > 0 ? (s.shortPass20plus / s.shortPassComp) * 100 : 0
);
const mdDeep20CompPct = samples.map(s =>
  s.medDeepComp > 0 ? (s.medDeep20plus / s.medDeepComp) * 100 : 0
);
// Per-attempt metrics (match season-sim targets)
const short20Pct      = samples.map(s =>
  s.passAtt > 0 ? (s.shortPass20plus / s.passAtt) * 100 : 0
);
const mdDeep20Pct     = samples.map(s =>
  s.passAtt > 0 ? (s.medDeep20plus / s.passAtt) * 100 : 0
);
const allPass20Pct    = samples.map(s =>
  s.passAtt > 0 ? (s.allPass20plus / s.passAtt) * 100 : 0
);

const longTDsPerGame  = samples.map(s => s.longTDs);
const tdPerGame       = samples.map(s => s.tdTotal);

// Player-volume: per-game totals (not per player — we accumulate both teams)
const passYardsPerGame  = samples.map(s => s.passYards);
const passAttPerGame    = samples.map(s => s.passAttempts);
const rushYardsPerGame  = samples.map(s => s.rushYards);
const rushCarriesPerGame = samples.map(s => s.rushCarries);
const recYardsPerGame   = samples.map(s => s.recYards);
const recPerGame        = samples.map(s => s.receptions);

// ── Formatting ────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

function badge(status: 'green' | 'yellow' | 'red'): string {
  if (status === 'green')  return `${GREEN}[  OK  ]${RESET}`;
  if (status === 'yellow') return `${YELLOW}[ WARN ]${RESET}`;
  return `${RED}[ FAIL ]${RESET}`;
}

function statusFor(
  mean: number,
  lo: number, hi: number,
  warnLo: number, warnHi: number,
): 'green' | 'yellow' | 'red' {
  if (mean >= lo && mean <= hi)         return 'green';
  if (mean >= warnLo && mean <= warnHi) return 'yellow';
  return 'red';
}

function row(
  label: string,
  vals: number[],
  lo: number, hi: number,
  warnLo: number, warnHi: number,
  fmt: (v: number) => string = v => v.toFixed(2),
) {
  const s = stats(vals);
  const st = statusFor(s.mean, lo, hi, warnLo, warnHi);
  const b  = badge(st);
  const target = `[${fmt(lo)} – ${fmt(hi)}]`;
  console.log(
    `${b} ${label.padEnd(34)} mean=${fmt(s.mean).padStart(7)}  `
    + `std=${fmt(s.std).padStart(6)}  `
    + `min=${fmt(s.min).padStart(7)}  max=${fmt(s.max).padStart(7)}  `
    + `${DIM}target ${target}${RESET}`
  );
}

function pct(v: number) { return v.toFixed(1) + '%'; }
function fp1(v: number) { return v.toFixed(1); }
function fp0(v: number) { return v.toFixed(0); }

function section(title: string) {
  console.log(`\n${BOLD}── ${title} ${'─'.repeat(Math.max(0, 60 - title.length - 4))}${RESET}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}║       LARGE-SAMPLE VALIDATION  (N = ${String(N).padStart(5)} games)             ║${RESET}`);
console.log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`);
console.log(`${DIM}Engine baseline: 2026-03. Targets reflect modern NFL averages.${RESET}`);

// ── 1. Core team-game metrics ──────────────────────────────────────────────────
section('1. CORE TEAM-GAME METRICS');

row('Pts / team / game',    ptsPerTeam,    21.0, 25.0, 19.0, 27.0, fp1);
row('Total pts / game',     totalPts,      42.0, 50.0, 38.0, 54.0, fp1);
row('Pts / drive',          ptsPerDrive,    1.9,  2.2,  1.7,  2.4, v => v.toFixed(3));
row('Drives / game',        drivesPerGame, 22.0, 26.0, 20.0, 28.0, fp1);
row('Plays / game',         playsPerGame,  130,  155,  120,  165,  fp0);
row('Sacks / team / game',  sacksPerTeam,   2.1,  2.5,  1.8,  2.9, fp1);
row('3rd-down conv %',      d3ConvRate,    0.39, 0.43, 0.36, 0.46, v => (v * 100).toFixed(1) + '%');

// ── 2. Explosive-play metrics ──────────────────────────────────────────────────
section('2. EXPLOSIVE-PLAY METRICS  (pass rates = % of attempts, run rates = % of carries)');

//  Runs 10+ yds: ~11–13% of all carries (NFL ≈ 12%)
row('Runs 10+ % of carries', run10Pct,     10.0, 14.0,  8.0, 16.0, pct);
//  Runs 20+ yds: ~1.5–2.5% of all carries (engine baseline 2026-03)
row('Runs 20+ % of carries', run20Pct,      1.5,  2.5,  1.0,  3.0, pct);
//  Short-pass 20+: % of ALL pass attempts (YAC breakaways + upgrade layer) → ~0.8–1.5%
row('Short-pass 20+ % of att', short20Pct,  0.6,  2.0,  0.3,  2.8, pct);
//  Med/deep 20+: % of ALL pass attempts → NFL ~2.5–4.0%
row('Med/deep 20+ % of att',  mdDeep20Pct,  2.0,  4.5,  1.0,  5.5, pct);
//  All-pass 20+: % of ALL pass attempts → season-sim baseline 5–7%
row('All-pass 20+ % of att',  allPass20Pct,  5.0,  7.0,  3.5,  8.5, pct);
//  Long TDs per game (plays ≥ 20 yds that score): engine baseline 0.8–1.1
row('Long TDs / game',        longTDsPerGame, 0.8, 1.1,  0.5,  1.4, fp1);
//  Total TDs per game: NFL ≈ 5–7 combined
row('Total TDs / game',       tdPerGame,      5.0,  7.0,  4.0,  8.0, fp0);

// ── Diagnostic-only (per completion, no strict target) ─────────────────────────
console.log(`\n  ${DIM}Diagnostic (% of completions, informational only):${RESET}`);
const sc = stats(short20CompPct);
const md = stats(mdDeep20CompPct);
console.log(`  Short-pass comp 20+%:    mean=${sc.mean.toFixed(1)}%  std=${sc.std.toFixed(1)}%  (expected ~4–8%)`);
console.log(`  Med/deep  comp 20+%:     mean=${md.mean.toFixed(1)}%  std=${md.std.toFixed(1)}%  (expected ~15–30%)`);

// ── 3. Player-volume metrics ───────────────────────────────────────────────────
section('3. PLAYER-VOLUME METRICS  (both teams combined per game)');

//  Pass yards both teams: NFL ≈ 450–540
row('Pass yards / game',    passYardsPerGame,  420, 560, 360, 620, fp0);
//  Pass attempts: NFL ≈ 60–75 combined
row('Pass attempts / game', passAttPerGame,     55,  75,  48,  84, fp0);
//  Rush yards: NFL ≈ 220–280 combined
row('Rush yards / game',    rushYardsPerGame,  190, 290, 160, 320, fp0);
//  Rush carries: NFL ≈ 50–60 combined
row('Rush carries / game',  rushCarriesPerGame, 45,  65,  38,  72, fp0);
//  Rec yards (= pass yards): sanity check
row('Rec yards / game',     recYardsPerGame,   420, 560, 360, 620, fp0);
//  Receptions: NFL ≈ 35–50 combined completions
row('Receptions / game',    recPerGame,         35,  50,  28,  58, fp0);

// ── 4. Season-leaderboard sanity (extrapolated from per-game means) ────────────
section('4. SEASON-LEADERBOARD SANITY  (17-game season extrapolation)');

const GAMES = 17;
const { mean: ppg }    = stats(passYardsPerGame);
const { mean: patt }   = stats(passAttPerGame);
const { mean: rypg }   = stats(rushYardsPerGame);
const { mean: rypgC }  = stats(rushCarriesPerGame);
const { mean: recypg } = stats(recYardsPerGame);
const { mean: recpg }  = stats(recPerGame);
// Divide by 2 (teams) and multiply by games to get per-player-season estimate
// (assumes QB/RB/WR1 handles ~60% of their team's volume)
const qbPassYdsSeason  = (ppg / 2)    * GAMES;
const qbAttSeason      = (patt / 2)   * GAMES;
const rb1RushYdsSeason = (rypg / 2)   * GAMES * 0.65;  // #1 RB gets ~65% of team carries
const rb1CarriesSeason = (rypgC / 2)  * GAMES * 0.65;
const wr1RecYdsSeason  = (recypg / 2) * GAMES * 0.35;  // WR1 ~35% of team rec yards
const wr1RecSeason     = (recpg / 2)  * GAMES * 0.35;

console.log(`\n  ${DIM}These are rough per-player extrapolations from population means.${RESET}`);
console.log(`  QB  — pass yards/season (est. #1 starter):  ${BOLD}${qbPassYdsSeason.toFixed(0)}${RESET}  target: 3800–4500`);
console.log(`  QB  — attempts/season   (est. #1 starter):  ${BOLD}${qbAttSeason.toFixed(0)}${RESET}  target: 480–570`);
console.log(`  RB1 — rush yards/season (65% team share):   ${BOLD}${rb1RushYdsSeason.toFixed(0)}${RESET}  target: 900–1300`);
console.log(`  RB1 — carries/season    (65% team share):   ${BOLD}${rb1CarriesSeason.toFixed(0)}${RESET}  target: 200–270`);
console.log(`  WR1 — rec yards/season  (35% team share):   ${BOLD}${wr1RecYdsSeason.toFixed(0)}${RESET}  target: 850–1200`);
console.log(`  WR1 — receptions/season (35% team share):   ${BOLD}${wr1RecSeason.toFixed(0)}${RESET}  target: 60–90`);

// ── Warning summary ────────────────────────────────────────────────────────────

const warnings: string[] = [];

// Re-check failures
const checks: Array<{ label: string; vals: number[]; lo: number; hi: number }> = [
  { label: 'Pts/team/game',       vals: ptsPerTeam,     lo: 21.0, hi: 25.0 },
  { label: 'Pts/drive',           vals: ptsPerDrive,    lo: 1.9,  hi: 2.2  },
  { label: 'Drives/game',         vals: drivesPerGame,  lo: 22.0, hi: 26.0 },
  { label: 'Sacks/team/game',     vals: sacksPerTeam,   lo: 2.1,  hi: 2.5  },
  { label: '3rd-down conv%',      vals: d3ConvRate,     lo: 0.39, hi: 0.43 },
  { label: 'Runs 10+% of carries', vals: run10Pct,       lo: 10.0, hi: 14.0 },
  { label: 'Runs 20+% of carries', vals: run20Pct,      lo: 1.5,  hi: 2.5  },
  { label: 'All-pass 20+% of att', vals: allPass20Pct,  lo: 5.0,  hi: 7.0  },
  { label: 'Long TDs/game',       vals: longTDsPerGame, lo: 0.8,  hi: 1.1  },
  { label: 'Pass yards/game',     vals: passYardsPerGame, lo: 420, hi: 560 },
  { label: 'Rush yards/game',     vals: rushYardsPerGame, lo: 190, hi: 290 },
];

for (const c of checks) {
  const m = stats(c.vals).mean;
  if (m < c.lo || m > c.hi) {
    warnings.push(`${c.label}: mean=${m.toFixed(2)} outside [${c.lo}–${c.hi}]`);
  }
}

console.log(`\n${BOLD}── SUMMARY ${'─'.repeat(52)}${RESET}`);
console.log(`  Games simulated: ${N}`);
if (warnings.length === 0) {
  console.log(`  ${GREEN}All core metrics within target bands. Engine nominal.${RESET}`);
} else {
  console.log(`  ${RED}${warnings.length} metric(s) outside target band:${RESET}`);
  for (const w of warnings) console.log(`    ${YELLOW}• ${w}${RESET}`);
}
console.log();
