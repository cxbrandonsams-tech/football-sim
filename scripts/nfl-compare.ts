/**
 * nfl-compare.ts
 * Runs N games, tracks every requested stat, and prints a comparison table
 * against NFL 2019-2025 averages.
 *
 * Usage: npx ts-node scripts/nfl-compare.ts [N]   (default: 1000)
 */

import { createInitialLeague } from '../src/initialLeague';
import { simulateGame }        from '../src/engine/simulateGame';
import { createGame }          from '../src/models/Game';
import { type PlayEvent }      from '../src/models/PlayEvent';

// ── Setup ─────────────────────────────────────────────────────────────────────

const N = parseInt(process.argv[2] ?? '1000', 10);
if (isNaN(N) || N < 1) { console.error('Usage: nfl-compare.ts [N]'); process.exit(1); }

const league = createInitialLeague('nfl-compare');
const teams  = league.teams;
const T      = teams.length;

// ── Per-game accumulators ──────────────────────────────────────────────────────

interface G {
  ptsHome: number; ptsAway: number;
  drives: number;
  rzTrips: number; rzTDs: number;
  // Passing
  passAtt: number; passComp: number; passYards: number; passTDs: number;
  // Rushing
  rushAtt: number; rushYards: number; rushTDs: number;
  // Receiving splits
  wrTeRec: number; wrTeYards: number;
  rbRec:   number; rbYards:   number;
  // 3rd down
  d3Att: number; d3Conv: number;
  // Defense / turnovers
  sacks: number; tfls: number;
  fumbles: number; ints: number;
  // Explosives
  runs20: number; pass20: number; scrimmage20: number;
  longTDs: number;  // TDs on plays ≥ 30 yards
  totalTDs: number;
  // Special teams
  punts: number;
  fgAtt: number; fgMade: number;
  // QB-level (max in game for leaderboard sense)
  maxQBPassYards: number;
  maxRBRushYards: number;
}

const samples: G[] = [];

// Per-player season-accumulation for leaderboard projection
// Keyed by playerId → career totals across all simulated games
const playerPass   = new Map<string, number>(); // passing yards
const playerRush   = new Map<string, number>(); // rushing yards
const playerRec    = new Map<string, number>(); // receiving yards
const playerSacks  = new Map<string, number>(); // sacks
const playerInts   = new Map<string, number>(); // interceptions

function addTo(map: Map<string, number>, id: string, val: number) {
  map.set(id, (map.get(id) ?? 0) + val);
}

// ── Simulation loop ───────────────────────────────────────────────────────────

for (let i = 0; i < N; i++) {
  const hi = Math.floor(Math.random() * T);
  let ai   = Math.floor(Math.random() * (T - 1));
  if (ai >= hi) ai++;

  const homeTeam = teams[hi]!;
  const awayTeam = teams[ai]!;

  // Build position + name lookup
  const posOf  = new Map<string, string>();
  const nameOf = new Map<string, string>();
  for (const team of [homeTeam, awayTeam]) {
    for (const p of team.roster) {
      posOf.set(p.id, p.position);
      nameOf.set(p.id, p.name);
    }
  }

  const game   = createGame(`g${i}`, 1, homeTeam, awayTeam);
  const result = simulateGame(game);
  const g      = result.game;
  const events: PlayEvent[] = g.events ?? [];

  // Per-QB and per-RB tracking for this game
  const qbPassYards = new Map<string, number>();
  const rbRushYards = new Map<string, number>();

  let passAtt=0, passComp=0, passYards=0, passTDs=0;
  let rushAtt=0, rushYards=0, rushTDs=0;
  let wrTeRec=0, wrTeYards=0, rbRec=0, rbYards=0;
  let d3Att=0, d3Conv=0;
  let sacks=0, tfls=0, fumbles=0, ints=0;
  let runs20=0, pass20=0;
  let longTDs=0, totalTDs=0;
  let punts=0, fgAtt=0, fgMade=0;
  let driveEnders=0;

  // RZ tracking
  let rzTrips=0, rzTDs=0;
  let currentOff = '';  // possession tracking for drive boundaries
  let driveInRZ  = false;

  for (const ev of events) {
    const isRun   = ev.type === 'inside_run' || ev.type === 'outside_run';
    const isPass  = ev.type === 'short_pass'  || ev.type === 'medium_pass' || ev.type === 'deep_pass';
    const isComp  = ev.result === 'success'   || ev.result === 'touchdown';
    const isTD    = ev.result === 'touchdown';
    const y       = ev.yards;

    // ── Possession / drive boundary ───────────────────────────────────────────
    if (ev.offenseTeamId !== currentOff) {
      currentOff  = ev.offenseTeamId;
      driveInRZ   = false;
    }

    // RZ entry: first scrimmage play starting at yardLine ≥ 80 on a drive
    if (!driveInRZ && (isRun || isPass || ev.type === 'scramble') && ev.yardLine >= 80) {
      driveInRZ = true;
      rzTrips++;
    }

    // ── Runs ──────────────────────────────────────────────────────────────────
    if (isRun) {
      rushAtt++;
      // All run plays contribute yards (turnover yards still count for yardage)
      rushYards += y;
      if (isTD) rushTDs++;
      if (y >= 20) runs20++;
      if (y < 0)  tfls++;
      // Per-RB tracking
      if (ev.ballCarrierId) {
        addTo(rbRushYards, ev.ballCarrierId, y);
        addTo(playerRush, ev.ballCarrierId, y);
      }
    }

    // ── Fumbles (own play type) ────────────────────────────────────────────────
    if (ev.type === 'fumble') {
      fumbles++;
      driveEnders++;
      driveInRZ = false;
    }

    // ── Passes ────────────────────────────────────────────────────────────────
    if (isPass) {
      passAtt++;
      if (isComp) {
        passComp++;
        passYards += y;
        if (isTD) passTDs++;
        if (y >= 20) pass20++;
        // QB passing yards
        if (ev.ballCarrierId) {
          addTo(qbPassYards, ev.ballCarrierId, y);
          addTo(playerPass,  ev.ballCarrierId, y);
        }
        // Receiving position split
        const tPos = ev.targetId ? posOf.get(ev.targetId) : undefined;
        if (tPos === 'WR' || tPos === 'TE') {
          wrTeRec++; wrTeYards += y;
        } else if (tPos === 'RB') {
          rbRec++;   rbYards   += y;
        }
        // Per-receiver tracking
        if (ev.targetId) addTo(playerRec, ev.targetId, y);
      }
    }

    // ── Sacks ─────────────────────────────────────────────────────────────────
    if (ev.type === 'sack') {
      sacks++;
      if (ev.defPlayerId) addTo(playerSacks, ev.defPlayerId, 1);
    }

    // ── Interceptions ─────────────────────────────────────────────────────────
    if (ev.type === 'interception') {
      ints++;
      driveEnders++;
      driveInRZ = false;
      if (ev.defPlayerId) addTo(playerInts, ev.defPlayerId, 1);
    }

    // ── 3rd down ──────────────────────────────────────────────────────────────
    if (ev.down === 3) {
      d3Att++;
      if (ev.firstDown || isTD) d3Conv++;
    }

    // ── TDs ───────────────────────────────────────────────────────────────────
    if (isTD) {
      totalTDs++;
      if (y >= 30) longTDs++;
      if (ev.yardLine >= 80) rzTDs++;
      driveEnders++;
      driveInRZ = false;
    }

    // ── Punts ─────────────────────────────────────────────────────────────────
    if (ev.type === 'punt') {
      punts++;
      driveEnders++;
      driveInRZ = false;
    }

    // ── Field goals ───────────────────────────────────────────────────────────
    if (ev.type === 'field_goal') {
      fgAtt++;
      if (ev.result === 'field_goal_good') fgMade++;
      driveEnders++;
      driveInRZ = false;
    }
  }

  const drives       = driveEnders + 2;
  const maxQBPassYds = qbPassYards.size > 0 ? Math.max(...qbPassYards.values()) : 0;
  const maxRBRushYds = rbRushYards.size > 0 ? Math.max(...rbRushYards.values()) : 0;

  samples.push({
    ptsHome: g.homeScore, ptsAway: g.awayScore,
    drives,
    rzTrips, rzTDs,
    passAtt, passComp, passYards, passTDs,
    rushAtt, rushYards, rushTDs,
    wrTeRec, wrTeYards, rbRec, rbYards,
    d3Att, d3Conv,
    sacks, tfls, fumbles, ints,
    runs20, pass20, scrimmage20: runs20 + pass20,
    longTDs, totalTDs,
    punts, fgAtt, fgMade,
    maxQBPassYards: maxQBPassYds,
    maxRBRushYards: maxRBRushYds,
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function std(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// ── Derived series ────────────────────────────────────────────────────────────

const ptsPerTeam    = samples.map(s => (s.ptsHome + s.ptsAway) / 2);
const ptsPerDrive   = samples.map(s => (s.ptsHome + s.ptsAway) / Math.max(s.drives, 1));
const drivesPerGame = samples.map(s => s.drives);
const rzTripsPerTeam = samples.map(s => s.rzTrips / 2);
const rzTDPct       = samples.map(s =>
  s.rzTrips > 0 ? s.rzTDs / s.rzTrips : 0   // TDs / RZ trips
);
const d3Conv        = samples.map(s => s.d3Att > 0 ? s.d3Conv / s.d3Att : 0);
const sacksPerTeam  = samples.map(s => s.sacks / 2);
const tflsPerTeam   = samples.map(s => s.tfls / 2);
const toPerGame     = samples.map(s => s.fumbles + s.ints);
const runs20Pct     = samples.map(s => s.rushAtt > 0 ? (s.runs20 / s.rushAtt) * 100 : 0);
const pass20Pct     = samples.map(s => s.passAtt > 0 ? (s.pass20 / s.passAtt) * 100 : 0);
const scrim20PerGame = samples.map(s => s.scrimmage20);
const longTDsPerGame = samples.map(s => s.longTDs);
const puntsPerGame  = samples.map(s => s.punts);
const passAttPerTeam = samples.map(s => s.passAtt / 2);
const compPct       = samples.map(s => s.passAtt > 0 ? (s.passComp / s.passAtt) * 100 : 0);
const rushAttPerTeam = samples.map(s => s.rushAtt / 2);
const rushYdsPerTeam = samples.map(s => s.rushYards / 2);
const fumPerTeam    = samples.map(s => s.fumbles / 2);
const intPerTeam    = samples.map(s => s.ints / 2);
const wrTeRecPerGame = samples.map(s => s.wrTeRec);
const rzTripBoth    = samples.map(s => s.rzTrips);
const fgMakePct     = samples.map(s => s.fgAtt > 0 ? (s.fgMade / s.fgAtt) * 100 : 0);

// ── Formatting ────────────────────────────────────────────────────────────────

const G  = '\x1b[32m'; // green
const Y  = '\x1b[33m'; // yellow
const R  = '\x1b[31m'; // red
const B  = '\x1b[1m';
const D  = '\x1b[2m';
const X  = '\x1b[0m';

function fmt(v: number, dec = 1): string { return v.toFixed(dec); }
function pct(v: number): string { return v.toFixed(1) + '%'; }

type Delta = 'low' | 'high' | 'ok';
function delta(sim: number, nflLo: number, nflHi: number): Delta {
  if (sim < nflLo) return 'low';
  if (sim > nflHi) return 'high';
  return 'ok';
}
function tag(d: Delta, sim: number, nflLo: number, nflHi: number): string {
  if (d === 'ok') return `${G}✓${X}`;
  if (d === 'low') return `${Y}↓${X}`;
  return `${Y}↑${X}`;
}

interface Row {
  label:    string;
  sim:      number;
  nflRange: string;
  nflMid:   number; // midpoint of NFL range for delta
  nflLo:    number;
  nflHi:    number;
  simFmt:   string; // formatted sim value
  note?:    string | undefined;
}

function makeRow(
  label: string,
  vals: number[],
  nflLo: number, nflHi: number,
  fmtFn: (v: number) => string = v => v.toFixed(1),
  note?: string,
): Row {
  const m = mean(vals);
  return {
    label, sim: m,
    nflRange: `${fmtFn(nflLo)} – ${fmtFn(nflHi)}`,
    nflMid: (nflLo + nflHi) / 2,
    nflLo, nflHi,
    simFmt: fmtFn(m),
    note,
  };
}

function printTable(title: string, rows: Row[]) {
  console.log(`\n${B}╔${'═'.repeat(82)}╗${X}`);
  console.log(`${B}║  ${title.padEnd(80)}║${X}`);
  console.log(`${B}╠${'═'.repeat(82)}╣${X}`);
  console.log(`${B}║  ${'Metric'.padEnd(34)} ${'Sim Avg'.padStart(10)}   ${'NFL 2019-25'.padStart(16)}   ${''.padStart(2)}  ║${X}`);
  console.log(`${B}╠${'═'.repeat(82)}╣${X}`);
  for (const r of rows) {
    const d = delta(r.sim, r.nflLo, r.nflHi);
    const t = tag(d, r.sim, r.nflLo, r.nflHi);
    const pct_diff = ((r.sim - r.nflMid) / r.nflMid * 100);
    const diffStr  = (pct_diff >= 0 ? '+' : '') + pct_diff.toFixed(0) + '%';
    const diffCol  = d === 'ok' ? D : Y;
    const label = r.label.padEnd(34);
    const simV  = r.simFmt.padStart(10);
    const nflV  = r.nflRange.padStart(16);
    const diff  = diffStr.padStart(6);
    console.log(`║  ${label} ${simV}   ${nflV}   ${t} ${diffCol}${diff}${X}  ║`);
    if (r.note) {
      console.log(`║  ${D}${'  └─ ' + r.note}${X}${' '.repeat(Math.max(0, 77 - r.note.length - 5))}║`);
    }
  }
  console.log(`╚${'═'.repeat(82)}╝`);
}

// ── Header ────────────────────────────────────────────────────────────────────

console.log(`\n${B}╔══════════════════════════════════════════════════════════════════════════════════╗${X}`);
console.log(`${B}║   GRIDIRON SIM  vs  NFL 2019-2025  ·  ${String(N).padStart(5)} games simulated${' '.repeat(22)}║${X}`);
console.log(`${B}║   ✓ = within NFL range   ↑ = above NFL   ↓ = below NFL${' '.repeat(26)}║${X}`);
console.log(`${B}╚══════════════════════════════════════════════════════════════════════════════════╝${X}`);

// ── Section 1: Scoring & Drives ───────────────────────────────────────────────

printTable('1. SCORING & GAME STRUCTURE', [
  makeRow('Points / team / game',  ptsPerTeam,    22.0, 24.5),
  makeRow('Pts / drive',           ptsPerDrive,    1.95, 2.15, v => v.toFixed(3)),
  makeRow('Drives / game (both)',  drivesPerGame,  22.0, 25.0),
  makeRow('RZ trips / team / game',rzTripsPerTeam, 3.0,  4.0),
  makeRow('RZ TD % (of RZ trips)', rzTDPct.map(v=>v*100), 52.0, 62.0, pct),
  makeRow('FG make %',             fgMakePct,     83.0, 88.0, pct),
  makeRow('TDs / game (both)',     samples.map(s=>s.totalTDs), 5.0, 7.0),
]);

// ── Section 2: Efficiency ─────────────────────────────────────────────────────

printTable('2. EFFICIENCY METRICS', [
  makeRow('3rd-down conversion %',  d3Conv.map(v=>v*100), 39.0, 42.0, pct),
  makeRow('QB completion %',        compPct,              64.0, 67.5, pct),
  makeRow('QB attempts / team',     passAttPerTeam,       32.0, 37.0),
]);

// ── Section 3: Rushing ────────────────────────────────────────────────────────

printTable('3. RUSHING', [
  makeRow('RB carries / team / game', rushAttPerTeam,  24.0, 29.0),
  makeRow('RB yards / team / game',   rushYdsPerTeam,  105.0, 130.0),
  makeRow('RB YPC',                   rushYdsPerTeam.map((y,i) =>
    samples[i]!.rushAtt > 0 ? y / (samples[i]!.rushAtt / 2) : 0), 4.2, 4.6, v=>v.toFixed(2)),
  makeRow('Runs 20+ % of carries',    runs20Pct,       1.5,  2.5, pct),
]);

// ── Section 4: Passing ────────────────────────────────────────────────────────

printTable('4. PASSING', [
  makeRow('Pass yards / team / game', samples.map(s=>s.passYards/2), 220.0, 255.0),
  makeRow('Pass 20+ % of attempts',   pass20Pct,                     5.0,   7.5, pct),
  makeRow('WR+TE receptions / game',  wrTeRecPerGame,                28.0, 40.0,
    v=>v.toFixed(1), 'both teams combined; excludes RB targets'),
  makeRow('RB receptions / game',     samples.map(s=>s.rbRec),        6.0, 12.0,
    v=>v.toFixed(1), 'both teams combined'),
]);

// ── Section 5: Explosive Plays ────────────────────────────────────────────────

printTable('5. EXPLOSIVE PLAYS', [
  makeRow('All-scrimmage 20+ / game', scrim20PerGame,  6.0,  9.0),
  makeRow('Runs 20+ / game',          samples.map(s=>s.runs20), 1.0, 2.0),
  makeRow('Passes 20+ / game',        samples.map(s=>s.pass20), 4.0, 7.0),
  makeRow('Long TDs (30+ yds) / game',longTDsPerGame,  0.5,  0.9),
]);

// ── Section 6: Defense & Turnovers ────────────────────────────────────────────

printTable('6. DEFENSE & TURNOVERS', [
  makeRow('Sacks / team / game',     sacksPerTeam,   2.3, 2.8),
  makeRow('TFLs / team / game',      tflsPerTeam,    5.0, 8.0,
    v=>v.toFixed(1), 'negative-yard runs only; sacks excluded'),
  makeRow('Turnovers / game (both)', toPerGame,      2.0, 3.2),
  makeRow('INTs / team / game',      intPerTeam,     0.7, 1.1),
  makeRow('Fumbles / team / game',   fumPerTeam,     0.5, 1.0),
]);

// ── Section 7: Special Teams ──────────────────────────────────────────────────

printTable('7. SPECIAL TEAMS  (partial — returns not in play events)', [
  makeRow('Punts / game (both)',        puntsPerGame, 7.0, 11.0),
]);
console.log(`  ${D}Note: Kick return and punt return yards are not generated as PlayEvents in the engine.${X}`);
console.log(`  ${D}The engine handles field position from returns internally between possessions.${X}`);

// ── Section 8: Leaderboard Projections ───────────────────────────────────────

console.log(`\n${B}╔══════════════════════════════════════════════════════════════════════════════════╗${X}`);
console.log(`${B}║   8. SEASON LEADERBOARD PROJECTIONS  (17-game extrapolation from per-game data) ║${X}`);
console.log(`${B}╚══════════════════════════════════════════════════════════════════════════════════╝${X}`);

// Compute mean per-game by player across all N games, then project season leader
// Season leader estimate: top ~5% of per-game mean × 17 games (starter assumption)
// More realistic: sort total yards accumulated across all simulated games
const GAMES_PER_SEASON = 17;
const TEAMS_IN_SIM = T; // 32 teams

// Sort player totals to find "league leaders" (top accumulator across N games)
function topN<K>(map: Map<K, number>, n: number): Array<[K, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Each player appears in N/32 * 2 games on average (they're on 1 team, each team plays ~N/16 games)
// Adjust to per-game rate, then × 17 for season
const gamesPerPlayer = (N * 2) / TEAMS_IN_SIM; // avg games each team appeared in

console.log(`\n  ${D}Based on ${N} simulated games; each team appeared in ~${gamesPerPlayer.toFixed(1)} games.${X}`);
console.log(`  ${D}Season projection = player's per-game average × 17 games.${X}\n`);

function projectSeason(map: Map<string, number>): { name: string; perGame: number; season: number } | null {
  if (map.size === 0) return null;
  const top = topN(map, 1)[0];
  if (!top) return null;
  const [id, total] = top;
  // Find how many games this player appeared in (approximate: gamesPerPlayer)
  const pg = total / gamesPerPlayer;
  return { name: id, perGame: pg, season: pg * GAMES_PER_SEASON };
}

// Top 5 projections for each category
function printLeaders(title: string, map: Map<string, number>, unit: string, nflTarget: string, decimals=0) {
  const tops = topN(map, 5);
  if (tops.length === 0) { console.log(`  ${title}: no data\n`); return; }
  console.log(`  ${B}${title}${X}  ${D}(NFL leader avg: ${nflTarget})${X}`);
  for (let i = 0; i < tops.length; i++) {
    const [id, total] = tops[i]!;
    const pg     = total / gamesPerPlayer;
    const season = pg * GAMES_PER_SEASON;
    const rank   = `${i + 1}.`.padStart(3);
    console.log(`  ${rank} Player ${id.substring(0, 8)}…  ${season.toFixed(decimals)} ${unit}/season  (${pg.toFixed(1)} ${unit}/game)`);
  }
  console.log();
}

printLeaders('QB Passing Yards',     playerPass,  'yards', '4,800–5,400');
printLeaders('RB Rushing Yards',     playerRush,  'yards', '1,500–2,100');
printLeaders('Receiver Yards',       playerRec,   'yards', '1,500–1,900');
printLeaders('Sacks',                playerSacks, 'sacks', '17–22', 1);
printLeaders('Interceptions',        playerInts,  'INTs',  '6–9',   1);

// ── Quick reference summary ───────────────────────────────────────────────────

const meanPts    = mean(ptsPerTeam);
const meanYPC    = mean(rushYdsPerTeam.map((y,i) => samples[i]!.rushAtt > 0 ? y / (samples[i]!.rushAtt / 2) : 0));
const meanComp   = mean(compPct);
const meanSacks  = mean(sacksPerTeam);
const meanTO     = mean(toPerGame);
const meanRuns20 = mean(runs20Pct);
const meanPass20 = mean(pass20Pct);

console.log(`${B}╔══════════════════════════════════════════════════════════════════════════════════╗${X}`);
console.log(`${B}║  QUICK REFERENCE SUMMARY${' '.repeat(56)}║${X}`);
console.log(`${B}╠══════════════════════════════════════════════════════════════════════════════════╣${X}`);
console.log(`║  ${B}Pts/team/game${X}          ${meanPts.toFixed(1).padStart(6)}   │  ${B}RB YPC${X}              ${meanYPC.toFixed(2).padStart(6)}        ║`);
console.log(`║  ${B}QB Comp %${X}              ${meanComp.toFixed(1).padStart(6)}%  │  ${B}Sacks/team/game${X}     ${meanSacks.toFixed(1).padStart(6)}        ║`);
console.log(`║  ${B}Turnovers/game${X}         ${meanTO.toFixed(1).padStart(6)}   │  ${B}Runs 20+ %${X}          ${meanRuns20.toFixed(1).padStart(6)}%       ║`);
console.log(`║  ${B}Pass 20+ % of att${X}      ${meanPass20.toFixed(1).padStart(6)}%  │  ${B}Punts/game${X}          ${mean(puntsPerGame).toFixed(1).padStart(6)}        ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════════════════╝\n`);
