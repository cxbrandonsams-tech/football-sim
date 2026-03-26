/**
 * Season-level validation script.
 * Creates a league, simulates all 18 weeks, and reports realistic stat benchmarks.
 */
import { createInitialLeague } from '../src/initialLeague';
import { simulateWeek }        from '../src/engine/simulateWeek';
import { type Game }            from '../src/models/Game';
import { type PlayerGameStats } from '../src/engine/gameStats';

const league = createInitialLeague('bench-league-001');

// Simulate all 18 weeks
let state = league;
const maxWeek = Math.max(...state.currentSeason.games.map(g => g.week));

for (let w = 1; w <= maxWeek; w++) {
  state = simulateWeek(state);
}

const games = state.currentSeason.games.filter(g => g.status === 'final');
const teams  = state.teams;

// ── Schedule structure ─────────────────────────────────────────────────────────

const teamGameCounts = new Map<string, number>();
const teamByeWeeks   = new Map<string, number[]>();

for (const g of games) {
  teamGameCounts.set(g.homeTeam.id, (teamGameCounts.get(g.homeTeam.id) ?? 0) + 1);
  teamGameCounts.set(g.awayTeam.id, (teamGameCounts.get(g.awayTeam.id) ?? 0) + 1);
}

for (const team of teams) {
  const byes: number[] = [];
  for (let w = 1; w <= maxWeek; w++) {
    const played = games.some(g => g.week === w && (g.homeTeam.id === team.id || g.awayTeam.id === team.id));
    if (!played) byes.push(w);
  }
  teamByeWeeks.set(team.id, byes);
}

const gameCounts = [...teamGameCounts.values()];
const byeCounts  = [...teamByeWeeks.values()].map(b => b.length);

// ── Aggregate player stats from boxScore ───────────────────────────────────────

interface PlayerSeason {
  playerId: string;
  name: string;
  teamAbbr: string;
  passingYards: number;
  passingTDs: number;
  attempts: number;
  completions: number;
  interceptions: number;
  rushingYards: number;
  rushingTDs: number;
  carries: number;
  receivingYards: number;
  receivingTDs: number;
  targets: number;
  receptions: number;
}

const playerTotals = new Map<string, PlayerSeason>();

for (const game of games) {
  if (!game.boxScore) continue;

  const teamAbbr: Record<string, string> = {
    [game.homeTeam.id]: game.homeTeam.abbreviation,
    [game.awayTeam.id]: game.awayTeam.abbreviation,
  };

  for (const [pid, s] of Object.entries(game.boxScore.players)) {
    const abbr = teamAbbr[s.teamId] ?? '?';
    const ex   = playerTotals.get(pid);
    if (!ex) {
      playerTotals.set(pid, {
        playerId:      pid,
        name:          s.name,
        teamAbbr:      abbr,
        passingYards:  s.passingYards,
        passingTDs:    s.passingTDs,
        attempts:      s.attempts,
        completions:   s.completions,
        interceptions: s.interceptions,
        rushingYards:  s.rushingYards,
        rushingTDs:    s.rushingTDs,
        carries:       s.carries,
        receivingYards: s.receivingYards,
        receivingTDs:  s.receivingTDs,
        targets:       s.targets,
        receptions:    s.receptions,
      });
    } else {
      ex.passingYards  += s.passingYards;
      ex.passingTDs    += s.passingTDs;
      ex.attempts      += s.attempts;
      ex.completions   += s.completions;
      ex.interceptions += s.interceptions;
      ex.rushingYards  += s.rushingYards;
      ex.rushingTDs    += s.rushingTDs;
      ex.carries       += s.carries;
      ex.receivingYards += s.receivingYards;
      ex.receivingTDs  += s.receivingTDs;
      ex.targets       += s.targets;
      ex.receptions    += s.receptions;
    }
  }
}

const allPlayers = [...playerTotals.values()];

// ── League-level game stats ────────────────────────────────────────────────────

let totalPoints = 0, totalPassYds = 0, totalRushYds = 0;
let totalRunPlays = 0, totalPassPlays = 0, totalSacks = 0;
let totalTFLs = 0;  // run plays with negative yards
const gameCount = games.length;

// ── Explosive play counters ───────────────────────────────────────────────────
// NFL-style: run 10+, pass 20+ (per total attempts of that type)
let explRuns10        = 0;   // runs gaining 10+ yards
let explShortPass20   = 0;   // short passes gaining 20+ yards (YAC breakaways)
let explMedDeepPass20 = 0;   // medium/deep passes gaining 20+ yards
let explAllPass20     = 0;   // all passes gaining 20+ yards

// Strict long-play: all scrimmage plays 20+/30+, broken out by type
let scrimmageRuns20      = 0, scrimmageRuns30      = 0;
let scrimmageShortPass20 = 0, scrimmageShortPass30 = 0;
let scrimmageMedDeep20   = 0, scrimmageMedDeep30   = 0;
let scrimmageAll20       = 0, scrimmageAll30       = 0;
let scrimmageTotal       = 0;  // denominator: total run + pass plays

let longTDs = 0;  // TDs on plays gaining 25+ yards

for (const g of games) {
  totalPoints  += g.homeScore + g.awayScore;
  if (g.boxScore) {
    totalPassYds += g.boxScore.home.passingYards + g.boxScore.away.passingYards;
    totalRushYds += g.boxScore.home.rushingYards + g.boxScore.away.rushingYards;
  }
  if (g.events) {
    for (const ev of g.events) {
      const isRun       = ev.type === 'inside_run' || ev.type === 'outside_run';
      const isShortPass = ev.type === 'short_pass';
      const isMedDeep   = ev.type === 'medium_pass' || ev.type === 'deep_pass';
      const isPass      = isShortPass || isMedDeep;

      if (isRun) {
        totalRunPlays++;
        scrimmageTotal++;
        if (ev.yards < 0) totalTFLs++;
        // NFL-style: 10+ yard run
        if (ev.yards >= 10) explRuns10++;
        // Strict long-play breakout
        if (ev.yards >= 20) { scrimmageRuns20++; scrimmageAll20++; }
        if (ev.yards >= 30) { scrimmageRuns30++; scrimmageAll30++; }
      } else if (isPass) {
        totalPassPlays++;
        scrimmageTotal++;
        // NFL-style: 20+ yard pass
        if (ev.yards >= 20) {
          explAllPass20++;
          if (isShortPass) explShortPass20++;
          else             explMedDeepPass20++;
        }
        // Strict long-play breakout
        if (ev.yards >= 20) {
          if (isShortPass) scrimmageShortPass20++;
          else             scrimmageMedDeep20++;
          scrimmageAll20++;
        }
        if (ev.yards >= 30) {
          if (isShortPass) scrimmageShortPass30++;
          else             scrimmageMedDeep30++;
          scrimmageAll30++;
        }
      } else if (ev.type === 'sack') {
        totalSacks++;
      }

      if (ev.result === 'touchdown' && ev.yards >= 25) longTDs++;
    }
  }
}

const avgPtsPerTeamPerGame  = gameCount > 0 ? totalPoints  / (gameCount * 2) : 0;
const avgPassYdsPerTeamGame = gameCount > 0 ? totalPassYds / (gameCount * 2) : 0;
const avgRushYdsPerTeamGame = gameCount > 0 ? totalRushYds / (gameCount * 2) : 0;
const avgRunPlaysPerTeamGame  = gameCount > 0 ? totalRunPlays  / (gameCount * 2) : 0;
const avgPassPlaysPerTeamGame = gameCount > 0 ? totalPassPlays / (gameCount * 2) : 0;
const runPassRatio = totalPassPlays > 0 ? totalRunPlays / totalPassPlays : 0;

// ── 3rd down conversion tracking ─────────────────────────────────────────────

let d3Total = 0, d3Conv = 0;
let d3LongTotal = 0, d3LongConv = 0;  // 3rd and 8+

for (const game of games) {
  if (!game.events) continue;
  for (const ev of game.events) {
    if (ev.down !== 3) continue;
    const isPass = ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass';
    const isRun  = ev.type === 'inside_run' || ev.type === 'outside_run';
    if (!isPass && !isRun) continue;
    const converted = ev.firstDown === true || ev.result === 'touchdown';
    d3Total++;
    if (converted) d3Conv++;
    if (ev.distance >= 8) {
      d3LongTotal++;
      if (converted) d3LongConv++;
    }
  }
}

// ── 4th down decision tracking ────────────────────────────────────────────────

let fd4GoTotal    = 0;   // go-for-it attempts
let fd4GoConvert  = 0;   // successful conversions (first down or TD)
let fd4FGAttempts = 0;   // field goal attempts (all 4th downs)
let fd4FGMade     = 0;
let fd4Punts      = 0;

// Situational breakdown
let fd4GoTrailing = 0;   // go-for-it while trailing
let fd4GoLeading  = 0;   // go-for-it while leading
let fd4GoTied     = 0;
let fd4GoQ4       = 0;   // go-for-it in Q4
let fd4GoEarly    = 0;   // go-for-it in Q1–Q3

for (const game of games) {
  if (!game.events || game.events.length === 0) continue;
  let hScore = 0;
  let aScore = 0;

  for (const ev of game.events) {
    const isGoForIt = ev.down === 4
      && ev.type !== 'field_goal'
      && ev.type !== 'punt';
    const isFG   = ev.type === 'field_goal';
    const isPunt = ev.type === 'punt';

    if (isGoForIt) {
      fd4GoTotal++;
      if (ev.firstDown === true || ev.result === 'touchdown') fd4GoConvert++;

      const offIsHome = ev.offenseTeamId === game.homeTeam.id;
      const offScore  = offIsHome ? hScore : aScore;
      const defScore  = offIsHome ? aScore : hScore;
      const diff      = offScore - defScore;
      if      (diff < 0) fd4GoTrailing++;
      else if (diff > 0) fd4GoLeading++;
      else               fd4GoTied++;

      if (ev.quarter === 4) fd4GoQ4++;
      else                  fd4GoEarly++;
    }

    if (isFG) {
      fd4FGAttempts++;
      if (ev.result === 'field_goal_good') fd4FGMade++;
    }

    if (isPunt) fd4Punts++;

    // Advance live score after checking state
    if (ev.result === 'touchdown') {
      if (ev.offenseTeamId === game.homeTeam.id) hScore += 7;
      else                                        aScore += 7;
    } else if (ev.result === 'field_goal_good') {
      if (ev.offenseTeamId === game.homeTeam.id) hScore += 3;
      else                                        aScore += 3;
    }
  }
}

const fd4AttemptRate = (fd4GoTotal + fd4FGAttempts + fd4Punts) > 0
  ? fd4GoTotal / (fd4GoTotal + fd4FGAttempts + fd4Punts) : 0;
const fd4ConvertRate = fd4GoTotal > 0 ? fd4GoConvert / fd4GoTotal : 0;
const fd4FGRate      = fd4FGAttempts > 0 ? fd4FGMade / fd4FGAttempts : 0;
const fd4GoPerGame   = gameCount > 0 ? fd4GoTotal / gameCount : 0;
const fd4FGPerGame   = gameCount > 0 ? fd4FGAttempts / gameCount : 0;
const fd4PuntPerGame = gameCount > 0 ? fd4Punts / gameCount : 0;

// ── Drive & red zone analysis ──────────────────────────────────────────────────
// A drive = consecutive plays by the same offense team.
// A red zone trip = drive where any play had yardLine >= 80 (opponent's 20).

interface DriveResult {
  reachedRedZone: boolean;
  outcome: 'td' | 'fg_good' | 'fg_miss' | 'turnover' | 'punt' | 'end_of_game';
  points: number;
}

let totalDrives    = 0;
let totalTDs       = 0;  // all TDs (RZ + non-RZ)
let rzTrips        = 0;
let rzTDs          = 0;
let rzFGGood       = 0;
let rzFGMiss       = 0;
let rzTurnover     = 0;
let totalTurnovers = 0;
let totalDrivePoints = 0;

for (const game of games) {
  if (!game.events || game.events.length === 0) continue;

  // Group events into drives (consecutive same offenseTeamId)
  interface Drive {
    teamId: string;
    plays: typeof game.events;
  }
  const drives: Drive[] = [];
  let curDrive: Drive | null = null;

  for (const ev of game.events) {
    if (!curDrive || curDrive.teamId !== ev.offenseTeamId) {
      curDrive = { teamId: ev.offenseTeamId, plays: [ev] };
      drives.push(curDrive);
    } else {
      curDrive.plays.push(ev);
    }
  }

  for (const drive of drives) {
    totalDrives++;
    const reachedRZ = drive.plays.some(p => p.yardLine >= 80);
    const lastPlay  = drive.plays[drive.plays.length - 1]!;

    let outcome: DriveResult['outcome'] = 'end_of_game';
    let points = 0;

    if (lastPlay.result === 'touchdown') {
      outcome = 'td';
      points  = 7;
      totalTDs++;
    } else if (lastPlay.result === 'field_goal_good') {
      outcome = 'fg_good';
      points  = 3;
    } else if (lastPlay.result === 'field_goal_miss') {
      outcome = 'fg_miss';
    } else if (lastPlay.result === 'turnover') {
      outcome = 'turnover';
      totalTurnovers++;
    } else if (lastPlay.type === 'punt') {
      outcome = 'punt';
    }

    // Also count turnovers mid-drive (interception/fumble plays not at end)
    // The last play handles turnover; interception plays ARE turnovers
    // Count all turnover-result plays for per-game turnover rate
    const driveTurnovers = drive.plays.filter(p => p.result === 'turnover').length;
    if (lastPlay.result !== 'turnover') {
      totalTurnovers += driveTurnovers;
    }

    totalDrivePoints += points;

    if (reachedRZ) {
      rzTrips++;
      if (outcome === 'td')       rzTDs++;
      else if (outcome === 'fg_good') rzFGGood++;
      else if (outcome === 'fg_miss') rzFGMiss++;
      else if (outcome === 'turnover') rzTurnover++;
    }
  }
}

const avgDrivesPerGame     = gameCount > 0 ? totalDrives    / gameCount    : 0;
const avgRZTripsPerGame    = gameCount > 0 ? rzTrips        / gameCount    : 0;  // per game (both teams)
const rzTDPct              = rzTrips  > 0  ? rzTDs          / rzTrips      : 0;
const rzFGPct              = rzTrips  > 0  ? rzFGGood       / rzTrips      : 0;
const avgPtsPerDrive       = totalDrives > 0 ? totalDrivePoints / totalDrives : 0;
const avgTurnoversPerGame  = gameCount > 0 ? totalTurnovers / gameCount    : 0;

// ── Top performers ─────────────────────────────────────────────────────────────

const qbs = allPlayers.filter(p => p.attempts >= 50).sort((a, b) => b.passingYards - a.passingYards);
const rbs = allPlayers.filter(p => p.carries  >= 50).sort((a, b) => b.rushingYards - a.rushingYards);
const wrs = allPlayers.filter(p => p.targets  >= 20).sort((a, b) => b.receivingYards - a.receivingYards);

// ── Print ──────────────────────────────────────────────────────────────────────

function pct(n: number, d: number) { return d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '—'; }
function avg(n: number, d: number) { return d > 0 ? (n / d).toFixed(1) : '—'; }

console.log('\n══════════════════════════════════════════');
console.log(' FULL-SEASON VALIDATION');
console.log(' Engine Baseline: 2026-03 (offense-leaning NFL model)');
console.log('──────────────────────────────────────────');
console.log(' Explosive systems active:');
console.log('   run burst (threshold 70), YAC breakaway (0.029),');
console.log('   upgrade layer (pass 3.0% / run 1.5%, 20–36 yds)');
console.log(' Scoring raised from ~21 → ~23–25 PPG by design.');
console.log(' Deep pass / long TD gap addressed via future playbook system.');
console.log('══════════════════════════════════════════');

console.log('\n── SCHEDULE STRUCTURE ──');
console.log(`  Total weeks simulated:   ${maxWeek}`);
console.log(`  Total games played:      ${gameCount}`);
console.log(`  Games per team (min):    ${Math.min(...gameCounts)}`);
console.log(`  Games per team (max):    ${Math.max(...gameCounts)}`);
console.log(`  Bye weeks per team (min):${Math.min(...byeCounts)}`);
console.log(`  Bye weeks per team (max):${Math.max(...byeCounts)}`);

console.log('\n── LEAGUE AVERAGES (per team per game) ──');
console.log(`  Points:       ${avgPtsPerTeamPerGame.toFixed(1)}   [engine baseline: 21–25, offense-leaning NFL model]`);
console.log(`  Passing yds:  ${avgPassYdsPerTeamGame.toFixed(1)}  [NFL: 220–240]`);
console.log(`  Rushing yds:  ${avgRushYdsPerTeamGame.toFixed(1)}  [NFL: 110–130]`);
console.log(`  Total yds:    ${(avgPassYdsPerTeamGame + avgRushYdsPerTeamGame).toFixed(1)}  [NFL: 330–370]`);
console.log(`  Run plays/gm: ${avgRunPlaysPerTeamGame.toFixed(1)}  [NFL: ~26–30]`);
console.log(`  Pass plays/gm:${avgPassPlaysPerTeamGame.toFixed(1)}  [NFL: ~34–38]`);
console.log(`  Run/pass ratio:${runPassRatio.toFixed(2)}  [NFL: ~0.72–0.82]`);

console.log('\n── RED ZONE STATS (per game, both teams combined) ──');
console.log(`  RZ trips/game:   ${avgRZTripsPerGame.toFixed(1)}  [NFL: ~6–8]`);
console.log(`  RZ TD%:          ${(rzTDPct * 100).toFixed(1)}%  [NFL: 55–68%]`);
console.log(`  RZ FG%:          ${(rzFGPct * 100).toFixed(1)}%  [NFL: ~20–25%]`);
console.log(`  RZ turnover/fail:${((rzTurnover / Math.max(rzTrips, 1)) * 100).toFixed(1)}%`);

const totalScrimmage    = totalRunPlays + totalPassPlays;
const avgPlaysPerGame   = gameCount > 0 ? totalScrimmage / gameCount : 0;
const avgPlaysPerDrive  = totalDrives > 0 ? totalScrimmage / totalDrives : 0;

const avgSacksPerGame = gameCount > 0 ? totalSacks / gameCount : 0;

const d3ConvRate     = d3Total     > 0 ? d3Conv     / d3Total     : 0;
const d3LongConvRate = d3LongTotal > 0 ? d3LongConv / d3LongTotal : 0;

console.log('\n── DRIVE STATS ──');
console.log(`  Drives/game (both teams): ${avgDrivesPerGame.toFixed(1)}  [baseline: 22–24]`);
console.log(`  Plays/game (both teams):  ${avgPlaysPerGame.toFixed(1)}  [NFL: ~125–150]`);
console.log(`  Plays/drive:              ${avgPlaysPerDrive.toFixed(1)}  [NFL: ~5–6]`);
console.log(`  Sacks/game (both teams):  ${avgSacksPerGame.toFixed(1)}  [NFL: ~4–6]`);
console.log(`  3rd down conv rate:       ${(d3ConvRate * 100).toFixed(1)}%  [baseline: 39–43%]`);
console.log(`  3rd-and-long (8+) conv:   ${(d3LongConvRate * 100).toFixed(1)}%  [NFL: ~20–28%]`);
console.log(`  Avg pts/drive:            ${avgPtsPerDrive.toFixed(2)}  [NFL: ~1.9–2.2]`);
console.log(`  Turnovers/game:           ${avgTurnoversPerGame.toFixed(1)}  [NFL: ~2.5–3.5]`);
const avgTFLsPerTeamGame = gameCount > 0 ? totalTFLs / (gameCount * 2) : 0;
console.log(`  TFLs/team/game:           ${avgTFLsPerTeamGame.toFixed(1)}  [baseline: 5–6]`);

const nonRZTDs       = totalTDs - rzTDs;
const longTDsPerGame = gameCount > 0 ? longTDs / gameCount : 0;
const nonRZTDPct     = totalTDs > 0 ? (nonRZTDs / totalTDs) * 100 : 0;

// NFL-style explosive rates
const explRun10Pct       = totalRunPlays  > 0 ? (explRuns10        / totalRunPlays)  * 100 : 0;
const explPass20Pct      = totalPassPlays > 0 ? (explAllPass20     / totalPassPlays) * 100 : 0;
const explShortPass20Pct = totalPassPlays > 0 ? (explShortPass20   / totalPassPlays) * 100 : 0;
const explMedDeep20Pct   = totalPassPlays > 0 ? (explMedDeepPass20 / totalPassPlays) * 100 : 0;

// Strict long-play rates (all scrimmage denominator)
const all20Pct      = scrimmageTotal > 0 ? (scrimmageAll20 / scrimmageTotal) * 100 : 0;
const all30Pct      = scrimmageTotal > 0 ? (scrimmageAll30 / scrimmageTotal) * 100 : 0;
const run20Pct      = totalRunPlays  > 0 ? (scrimmageRuns20      / totalRunPlays)  * 100 : 0;
const run30Pct      = totalRunPlays  > 0 ? (scrimmageRuns30      / totalRunPlays)  * 100 : 0;
const short20Pct    = totalPassPlays > 0 ? (scrimmageShortPass20 / totalPassPlays) * 100 : 0;
const short30Pct    = totalPassPlays > 0 ? (scrimmageShortPass30 / totalPassPlays) * 100 : 0;
const medDeep20Pct  = totalPassPlays > 0 ? (scrimmageMedDeep20   / totalPassPlays) * 100 : 0;
const medDeep30Pct  = totalPassPlays > 0 ? (scrimmageMedDeep30   / totalPassPlays) * 100 : 0;

console.log('\n── EXPLOSIVE PLAYS (NFL-style) ──');
console.log(`  Run 10+ yard rate:      ${explRun10Pct.toFixed(1)}% of rushes       [NFL: ~8–12%]`);
console.log(`  Pass 20+ yard rate:     ${explPass20Pct.toFixed(1)}% of pass plays   [baseline: 5–7%]`);
console.log(`    └ short pass 20+:     ${explShortPass20Pct.toFixed(1)}% of pass plays   (YAC breakaways + upgrade layer)`);
console.log(`    └ med/deep pass 20+:  ${explMedDeep20Pct.toFixed(1)}% of pass plays`);

console.log('\n── EXPLOSIVE PLAYS (strict long-play) ──');
console.log(`  All scrimmage 20+:      ${all20Pct.toFixed(1)}% of plays  [baseline: 3.5–5%]`);
console.log(`  All scrimmage 30+:      ${all30Pct.toFixed(1)}% of plays  [NFL: ~2–3%]`);
console.log(`    Runs  20+:            ${run20Pct.toFixed(1)}% of rushes`);
console.log(`    Runs  30+:            ${run30Pct.toFixed(1)}% of rushes`);
console.log(`    Short pass 20+:       ${short20Pct.toFixed(1)}% of passes`);
console.log(`    Short pass 30+:       ${short30Pct.toFixed(1)}% of passes`);
console.log(`    Med/deep 20+:         ${medDeep20Pct.toFixed(1)}% of passes`);
console.log(`    Med/deep 30+:         ${medDeep30Pct.toFixed(1)}% of passes`);

console.log(`  Long TDs (25+ yds):     ${longTDsPerGame.toFixed(2)}/game (both teams)  [baseline: 0.8–1.1; deep gap deferred to playbook system]`);
console.log(`  Non-RZ TDs:             ${nonRZTDPct.toFixed(1)}% of TDs  [NFL: ~30–40%]`);

console.log('\n── TOP 10 QBs (passing yards) ──');
for (const q of qbs.slice(0, 10)) {
  const compPct = pct(q.completions, q.attempts);
  const ypa     = avg(q.passingYards, q.attempts);
  console.log(`  ${q.name.padEnd(22)} ${q.teamAbbr}  ${String(q.passingYards).padStart(5)} yds  ${String(q.passingTDs).padStart(2)} TD  ${String(q.interceptions).padStart(2)} INT  ${q.attempts} att  ${compPct}  ${ypa} YPA`);
}

console.log('\n── TOP 10 RBs (rushing yards) ──');
for (const r of rbs.slice(0, 10)) {
  const ypc = avg(r.rushingYards, r.carries);
  console.log(`  ${r.name.padEnd(22)} ${r.teamAbbr}  ${String(r.rushingYards).padStart(5)} yds  ${String(r.rushingTDs).padStart(2)} TD  ${r.carries} car  ${ypc} YPC`);
}

console.log('\n── TOP 10 WRs (receiving yards) ──');
for (const w of wrs.slice(0, 10)) {
  const ypr = avg(w.receivingYards, w.receptions);
  console.log(`  ${w.name.padEnd(22)} ${w.teamAbbr}  ${String(w.receivingYards).padStart(5)} yds  ${String(w.receivingTDs).padStart(2)} TD  ${w.receptions} rec / ${w.targets} tgt  ${ypr} YPR`);
}

// QB season averages
const qbAvgYds   = qbs.length > 0 ? qbs.reduce((s, q) => s + q.passingYards, 0) / qbs.length : 0;
const qbAvgTDs   = qbs.length > 0 ? qbs.reduce((s, q) => s + q.passingTDs,   0) / qbs.length : 0;
const qbAvgINTs  = qbs.length > 0 ? qbs.reduce((s, q) => s + q.interceptions, 0) / qbs.length : 0;
const qbAvgAtt   = qbs.length > 0 ? qbs.reduce((s, q) => s + q.attempts,      0) / qbs.length : 0;

console.log('\n── QB SEASON AVERAGES (all qualifiers) ──');
console.log(`  Qualifiers:     ${qbs.length}`);
console.log(`  Avg pass yards: ${qbAvgYds.toFixed(0)}   [NFL: 3800–4200]`);
console.log(`  Avg pass TDs:   ${qbAvgTDs.toFixed(1)}    [NFL: 25–32]`);
console.log(`  Avg INTs:       ${qbAvgINTs.toFixed(1)}    [NFL: 10–14]`);
console.log(`  Avg attempts:   ${qbAvgAtt.toFixed(0)}   [NFL: 530–590]`);
console.log(`  Avg att/game:   ${(qbAvgAtt / 17).toFixed(1)}  [NFL: 31–35]`);

const rbAvgYds = rbs.length > 0 ? rbs.reduce((s, r) => s + r.rushingYards, 0) / rbs.length : 0;
const rbAvgTDs = rbs.length > 0 ? rbs.reduce((s, r) => s + r.rushingTDs,   0) / rbs.length : 0;
const rbAvgCar = rbs.length > 0 ? rbs.reduce((s, r) => s + r.carries,      0) / rbs.length : 0;

console.log('\n── RB SEASON AVERAGES (all qualifiers) ──');
console.log(`  Qualifiers:      ${rbs.length}`);
console.log(`  Avg rush yards:  ${rbAvgYds.toFixed(0)}   [NFL: 900–1100 top RBs]`);
console.log(`  Avg rush TDs:    ${rbAvgTDs.toFixed(1)}    [NFL: 8–12]`);
console.log(`  Avg carries:     ${rbAvgCar.toFixed(0)}   [NFL: 200–280 top RBs]`);
console.log(`  Avg car/game:    ${(rbAvgCar / 17).toFixed(1)}  [NFL: 13–17 top RBs]`);

const wrAvgYds = wrs.length > 0 ? wrs.reduce((s, w) => s + w.receivingYards, 0) / wrs.length : 0;
const wrAvgTDs = wrs.length > 0 ? wrs.reduce((s, w) => s + w.receivingTDs,   0) / wrs.length : 0;

console.log('\n── WR SEASON AVERAGES (all qualifiers) ──');
console.log(`  Qualifiers:        ${wrs.length}`);
console.log(`  Avg recv yards:    ${wrAvgYds.toFixed(0)}   [NFL: 700–900 qualifiers]`);
console.log(`  Avg recv TDs:      ${wrAvgTDs.toFixed(1)}    [NFL: 5–8]`);

// ── 4th down print ────────────────────────────────────────────────────────────

console.log('\n── 4TH DOWN DECISIONS ──');
console.log(`  Go-for-it per game:    ${fd4GoPerGame.toFixed(2)}  [NFL: ~1.5–2.5]`);
console.log(`  FG attempts per game:  ${fd4FGPerGame.toFixed(2)}  [NFL: ~3.0–4.5]`);
console.log(`  Punts per game:        ${fd4PuntPerGame.toFixed(2)}  [NFL: ~9–12 both teams]`);
console.log(`  Go-for-it attempt rate: ${(fd4AttemptRate * 100).toFixed(1)}%  (of all 4th downs)`);
console.log(`  4th-down conv rate:    ${(fd4ConvertRate * 100).toFixed(1)}%  [NFL: ~60–70%]`);
console.log(`  FG make rate:          ${(fd4FGRate * 100).toFixed(1)}%  [NFL: ~83–88%]`);

console.log('\n  Situational go-for-it breakdown:');
const fd4GoSitTotal = fd4GoTrailing + fd4GoLeading + fd4GoTied || 1;
console.log(`    Trailing: ${fd4GoTrailing}  (${(fd4GoTrailing / fd4GoSitTotal * 100).toFixed(1)}%)`);
console.log(`    Tied:     ${fd4GoTied}  (${(fd4GoTied / fd4GoSitTotal * 100).toFixed(1)}%)`);
console.log(`    Leading:  ${fd4GoLeading}  (${(fd4GoLeading / fd4GoSitTotal * 100).toFixed(1)}%)`);

const fd4GoQTotal = fd4GoQ4 + fd4GoEarly || 1;
console.log(`    Q4:       ${fd4GoQ4}  (${(fd4GoQ4 / fd4GoQTotal * 100).toFixed(1)}%)`);
console.log(`    Q1-Q3:    ${fd4GoEarly}  (${(fd4GoEarly / fd4GoQTotal * 100).toFixed(1)}%)`);

// ── Aggressiveness tier breakdown ─────────────────────────────────────────────

function aggrTier(v: number): 'aggressive' | 'balanced' | 'conservative' {
  if (v >= 65) return 'aggressive';
  if (v >= 40) return 'balanced';
  return 'conservative';
}

const teamAggrMap = new Map<string, number>();
for (const t of state.teams) {
  teamAggrMap.set(t.id, t.playcalling.aggressiveness ?? 50);
}

interface TierBucket { runPlays: number; passPlays: number; qbAtt: number; rbCar: number; teamGames: number }
const tiers: Record<'aggressive' | 'balanced' | 'conservative', TierBucket> = {
  aggressive:   { runPlays: 0, passPlays: 0, qbAtt: 0, rbCar: 0, teamGames: 0 },
  balanced:     { runPlays: 0, passPlays: 0, qbAtt: 0, rbCar: 0, teamGames: 0 },
  conservative: { runPlays: 0, passPlays: 0, qbAtt: 0, rbCar: 0, teamGames: 0 },
};

for (const game of games) {
  const teamIds = [game.homeTeam.id, game.awayTeam.id];

  // Run/pass play counts from events
  const runByTeam  = new Map<string, number>();
  const passByTeam = new Map<string, number>();
  if (game.events) {
    for (const ev of game.events) {
      if (ev.type === 'inside_run' || ev.type === 'outside_run') {
        runByTeam.set(ev.offenseTeamId, (runByTeam.get(ev.offenseTeamId) ?? 0) + 1);
      } else if (ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass') {
        passByTeam.set(ev.offenseTeamId, (passByTeam.get(ev.offenseTeamId) ?? 0) + 1);
      }
    }
  }

  // QB attempts and RB carries from box score player stats
  const qbAttByTeam = new Map<string, number>();
  const rbCarByTeam = new Map<string, number>();
  if (game.boxScore) {
    for (const s of Object.values(game.boxScore.players)) {
      if (s.attempts > 0) qbAttByTeam.set(s.teamId, (qbAttByTeam.get(s.teamId) ?? 0) + s.attempts);
      if (s.carries  > 0) rbCarByTeam.set(s.teamId, (rbCarByTeam.get(s.teamId) ?? 0) + s.carries);
    }
  }

  for (const tid of teamIds) {
    const aggr = teamAggrMap.get(tid) ?? 50;
    const bucket = tiers[aggrTier(aggr)];
    bucket.teamGames++;
    bucket.runPlays  += runByTeam.get(tid)  ?? 0;
    bucket.passPlays += passByTeam.get(tid) ?? 0;
    bucket.qbAtt     += qbAttByTeam.get(tid) ?? 0;
    bucket.rbCar     += rbCarByTeam.get(tid) ?? 0;
  }
}

// Team counts per tier
const aggrTeamCount = [...teamAggrMap.values()].filter(v => v >= 65).length;
const balaTeamCount = [...teamAggrMap.values()].filter(v => v >= 40 && v < 65).length;
const consTeamCount = [...teamAggrMap.values()].filter(v => v < 40).length;

console.log('\n── AGGRESSIVENESS TIER BREAKDOWN ──');
console.log(`  (Aggressive ≥65: ${aggrTeamCount} teams | Balanced 40–64: ${balaTeamCount} teams | Conservative <40: ${consTeamCount} teams)`);
console.log('');
for (const [tierName, d] of Object.entries(tiers) as ['aggressive' | 'balanced' | 'conservative', TierBucket][]) {
  const g = d.teamGames || 1;
  const ratio = d.passPlays > 0 ? (d.runPlays / d.passPlays).toFixed(2) : '—';
  console.log(`  ${tierName.padEnd(13)} run/pass: ${ratio}  QB att/gm: ${(d.qbAtt/g).toFixed(1)}  RB car/gm: ${(d.rbCar/g).toFixed(1)}`);
}

// ── Validation warnings ────────────────────────────────────────────────────────
const warnings: string[] = [];

// ── Validation thresholds — Engine Baseline 2026-03 ──────────────────────────
// Explosive systems (run burst threshold 70, YAC breakaway 0.029, upgrade layer
// pass 3.0%/run 1.5%) raised scoring from ~21 → ~23–25 PPG. All thresholds below
// reflect this calibrated baseline. Do not lower scoring thresholds without also
// rolling back the explosive systems.
const avgSacksPerTeamGame = avgSacksPerGame / 2;
const avgRun20Pct         = totalRunPlays  > 0 ? (scrimmageRuns20 / totalRunPlays)  * 100 : 0;
const avgPass20Pct        = totalPassPlays > 0 ? (scrimmageAll20 - scrimmageRuns20) / totalPassPlays * 100 : 0;
const longTDsPerGameVal   = gameCount > 0 ? longTDs / gameCount : 0;

if (rzTDPct > 0.70)                     warnings.push(`HIGH RZ TD% (${(rzTDPct * 100).toFixed(1)}%) — investigate`);
if (rzTDPct < 0.55)                     warnings.push(`LOW RZ TD% (${(rzTDPct * 100).toFixed(1)}%) — investigate`);
if (avgPtsPerTeamPerGame < 21.0)        warnings.push(`LOW scoring (${avgPtsPerTeamPerGame.toFixed(1)} pts/game) — investigate`);
if (avgPtsPerTeamPerGame > 25.0)        warnings.push(`HIGH scoring (${avgPtsPerTeamPerGame.toFixed(1)} pts/game) — investigate`);
if (avgPtsPerDrive < 1.9)              warnings.push(`LOW pts/drive (${avgPtsPerDrive.toFixed(2)}) — investigate`);
if (avgPtsPerDrive > 2.2)              warnings.push(`HIGH pts/drive (${avgPtsPerDrive.toFixed(2)}) — investigate`);
if (avgDrivesPerGame < 22.0)           warnings.push(`LOW drives/game (${avgDrivesPerGame.toFixed(1)}) — investigate`);
if (avgDrivesPerGame > 24.0)           warnings.push(`HIGH drives/game (${avgDrivesPerGame.toFixed(1)}) — investigate`);
if (d3ConvRate < 0.39)                 warnings.push(`LOW 3rd down % (${(d3ConvRate * 100).toFixed(1)}%) — investigate`);
if (d3ConvRate > 0.43)                 warnings.push(`HIGH 3rd down % (${(d3ConvRate * 100).toFixed(1)}%) — investigate`);
if (avgSacksPerTeamGame < 2.1)         warnings.push(`LOW sacks/team/game (${avgSacksPerTeamGame.toFixed(2)}) — investigate`);
if (avgSacksPerTeamGame > 2.5)         warnings.push(`HIGH sacks/team/game (${avgSacksPerTeamGame.toFixed(2)}) — investigate`);
if (avgRun20Pct < 1.5)                 warnings.push(`LOW run 20+ rate (${avgRun20Pct.toFixed(1)}%) — investigate`);
if (avgRun20Pct > 2.5)                 warnings.push(`HIGH run 20+ rate (${avgRun20Pct.toFixed(1)}%) — investigate`);
if (avgPass20Pct < 5.0)               warnings.push(`LOW pass 20+ rate (${avgPass20Pct.toFixed(1)}%) — investigate`);
if (avgPass20Pct > 7.0)               warnings.push(`HIGH pass 20+ rate (${avgPass20Pct.toFixed(1)}%) — investigate`);
if (longTDsPerGameVal < 0.8)           warnings.push(`LOW long TDs/game (${longTDsPerGameVal.toFixed(2)}) — investigate`);
if (longTDsPerGameVal > 1.1)           warnings.push(`HIGH long TDs/game (${longTDsPerGameVal.toFixed(2)}) — investigate`);
if (avgTurnoversPerGame < 2.0)         warnings.push(`LOW turnovers (${avgTurnoversPerGame.toFixed(1)}/game) — investigate`);
if (avgTurnoversPerGame > 3.5)         warnings.push(`HIGH turnovers (${avgTurnoversPerGame.toFixed(1)}/game) — investigate`);

if (warnings.length > 0) {
  console.log('\n── VALIDATION WARNINGS ──');
  for (const w of warnings) console.log(`  ⚠  ${w}`);
} else {
  console.log('\n── VALIDATION WARNINGS ──');
  console.log('  All metrics within expected ranges.');
}

console.log('\n══════════════════════════════════════════\n');
