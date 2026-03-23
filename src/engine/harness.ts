/**
 * Simulation harness for statistical calibration.
 *
 * Simulates N independent seasons using the same 32-team roster, aggregates
 * league-wide stats across all games, and returns a structured report that
 * can be compared against NFL-realistic target ranges.
 *
 * Usage (via simrun.ts):
 *   npx ts-node src/tools/simrun.ts [seasons=100]
 */

import { type Team }           from '../models/Team';
import { type Division }       from '../models/League';
import { createSeason }        from '../models/Season';
import { simulateSeason }      from './simulateSeason';
import { type GameBoxScore }   from './gameStats';

// ── Target ranges ─────────────────────────────────────────────────────────────

export interface TargetRange { low: number; high: number; label: string }

export const TARGETS: Readonly<Record<string, TargetRange>> = {
  pointsPerGame:    { low: 20,  high: 28,  label: '20–28'    },
  completionPct:    { low: 60,  high: 68,  label: '60–68%'   },
  yardsPerAttempt:  { low: 6.5, high: 8.5, label: '6.5–8.5'  },
  yardsPerCarry:    { low: 4.0, high: 4.8, label: '4.0–4.8'  },
  sacksPerGame:     { low: 2,   high: 3,   label: '2–3'      },
  intPerGame:       { low: 0.5, high: 1.5, label: '0.5–1.5'  },
};

// ── Stat summary ──────────────────────────────────────────────────────────────

export interface StatSummary {
  avg:    number;
  min:    number;
  max:    number;
  p25:    number;
  p75:    number;
  stddev: number;
  n:      number;
}

function summarize(arr: number[]): StatSummary {
  const n = arr.length;
  if (n === 0) return { avg: 0, min: 0, max: 0, p25: 0, p75: 0, stddev: 0, n: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((s, x) => s + x, 0) / n;
  const variance = arr.reduce((s, x) => s + (x - avg) ** 2, 0) / n;
  return {
    avg,
    min:    sorted[0]           ?? 0,
    max:    sorted[n - 1]       ?? 0,
    p25:    sorted[Math.floor(n * 0.25)] ?? 0,
    p75:    sorted[Math.floor(n * 0.75)] ?? 0,
    stddev: Math.sqrt(variance),
    n,
  };
}

// ── Report types ──────────────────────────────────────────────────────────────

export interface SimReport {
  seasons:   number;
  games:     number;   // unique game count
  teamGames: number;   // games × 2 (each game counted once per team)

  // ── Team offense (per team per game) ──────────────────────────────────────
  pointsPerGame:     StatSummary;
  totalYardsPerGame: StatSummary;
  rushYardsPerGame:  number;
  passYardsPerGame:  number;
  /** Fraction of tracked plays (carries + pass attempts) that are runs. */
  runPlayFraction:   number;

  // ── QB (per QB game with ≥ 5 attempts) ───────────────────────────────────
  completionPct:       number;
  yardsPerAttempt:     number;
  passYardsPerGameQB:  number;
  /** Passing TDs per attempt × 100 (percent). */
  tdRate:              number;
  /** INTs thrown per attempt × 100 (percent). */
  intRate:             number;
  /** Sacks taken per attempt × 100 (percent). */
  sackRate:            number;

  // ── Rushing (per RB game with ≥ 3 carries) ────────────────────────────────
  yardsPerCarry:      number;
  rushYardsPerGameRB: number;
  rushTDsPerGame:     number;

  // ── Receiving (per session with ≥ 1 reception) ────────────────────────────
  yardsPerReception:  number;
  receptionsPerGame:  number;
  recTDsPerGame:      number;

  // ── Defense (per team per game) ───────────────────────────────────────────
  sacksPerGame:     StatSummary;
  /** INTs thrown per team per game (from QB passing stats). */
  intPerGame:       number;
  turnoversPerGame: number;
}

// ── Internal accumulator ──────────────────────────────────────────────────────

interface Accum {
  games:       number;
  teamGames:   number;
  pointsArr:   number[];
  sacksArr:    number[];
  totalYardsArr: number[];
  rushYardsSum:  number;
  passYardsSum:  number;
  turnoversSum:  number;

  // QB
  qbSessions:  number;
  completions: number;
  attempts:    number;
  passingTDs:  number;
  qbInts:      number;
  qbSacks:     number;
  qbPassYards: number;

  // RB
  rbSessions:  number;
  carries:     number;
  rbRushYards: number;
  rbRushTDs:   number;

  // Receiving
  recSessions: number;
  receptions:  number;
  recYards:    number;
  recTDs:      number;

  // Play mix
  runPlays:    number;
  passPlays:   number; // attempts only (excludes sacks for simplicity)
}

function makeAccum(): Accum {
  return {
    games: 0, teamGames: 0,
    pointsArr: [], sacksArr: [], totalYardsArr: [],
    rushYardsSum: 0, passYardsSum: 0, turnoversSum: 0,
    qbSessions: 0, completions: 0, attempts: 0, passingTDs: 0,
    qbInts: 0, qbSacks: 0, qbPassYards: 0,
    rbSessions: 0, carries: 0, rbRushYards: 0, rbRushTDs: 0,
    recSessions: 0, receptions: 0, recYards: 0, recTDs: 0,
    runPlays: 0, passPlays: 0,
  };
}

function collectBox(acc: Accum, box: GameBoxScore): void {
  acc.games++;

  // ── Team-level stats ───────────────────────────────────────────────────────
  for (const ts of [box.home, box.away]) {
    acc.teamGames++;
    acc.pointsArr.push(ts.score);
    acc.sacksArr.push(ts.sacksAllowed);
    acc.totalYardsArr.push(ts.totalYards);
    acc.rushYardsSum  += ts.rushingYards;
    acc.passYardsSum  += ts.passingYards;
    acc.turnoversSum  += ts.turnovers;
  }

  // ── Player-level stats ─────────────────────────────────────────────────────
  for (const ps of Object.values(box.players)) {
    if (ps.attempts >= 5) {
      // QB session
      acc.qbSessions++;
      acc.completions  += ps.completions;
      acc.attempts     += ps.attempts;
      acc.passingTDs   += ps.passingTDs;
      acc.qbInts       += ps.interceptions;
      acc.qbSacks      += ps.sacksAllowed;
      acc.qbPassYards  += ps.passingYards;
      acc.passPlays    += ps.attempts;
    }
    if (ps.carries >= 3) {
      // RB session
      acc.rbSessions++;
      acc.carries     += ps.carries;
      acc.rbRushYards += ps.rushingYards;
      acc.rbRushTDs   += ps.rushingTDs;
      acc.runPlays    += ps.carries;
    }
    if (ps.receptions >= 1) {
      acc.recSessions++;
      acc.receptions += ps.receptions;
      acc.recYards   += ps.receivingYards;
      acc.recTDs     += ps.receivingTDs;
    }
  }
}

function buildReport(acc: Accum, seasons: number): SimReport {
  const tg    = acc.teamGames || 1;
  const att   = acc.attempts  || 1;
  const car   = acc.carries   || 1;
  const rec   = acc.receptions || 1;
  const plays = (acc.runPlays + acc.passPlays) || 1;

  return {
    seasons,
    games:     acc.games,
    teamGames: tg,

    pointsPerGame:     summarize(acc.pointsArr),
    totalYardsPerGame: summarize(acc.totalYardsArr),
    rushYardsPerGame:  acc.rushYardsSum / tg,
    passYardsPerGame:  acc.passYardsSum / tg,
    runPlayFraction:   acc.runPlays / plays,

    completionPct:      (acc.completions / att) * 100,
    yardsPerAttempt:    acc.qbPassYards / att,
    passYardsPerGameQB: acc.qbPassYards / (acc.qbSessions || 1),
    tdRate:             (acc.passingTDs / att) * 100,
    intRate:            (acc.qbInts / att) * 100,
    sackRate:           (acc.qbSacks / att) * 100,

    yardsPerCarry:      acc.rbRushYards / car,
    rushYardsPerGameRB: acc.rbRushYards / (acc.rbSessions || 1),
    rushTDsPerGame:     acc.rbRushTDs   / (acc.rbSessions || 1),

    yardsPerReception:  acc.recYards    / rec,
    receptionsPerGame:  acc.receptions  / (acc.recSessions || 1),
    recTDsPerGame:      acc.recTDs      / (acc.recSessions || 1),

    sacksPerGame:    summarize(acc.sacksArr),
    intPerGame:      acc.qbInts   / tg,
    turnoversPerGame: acc.turnoversSum / tg,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface HarnessConfig {
  seasons:  number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Simulate `seasons` independent seasons using the provided teams and
 * division structure, and return aggregated statistics.
 *
 * The same team rosters are used for every simulated season (no progression).
 * A fresh schedule is generated per season so matchup variation is preserved.
 */
export function runHarness(
  teams:     Team[],
  divisions: Division[],
  config:    HarnessConfig,
): SimReport {
  const { seasons, onProgress } = config;
  const acc = makeAccum();

  for (let i = 0; i < seasons; i++) {
    const season   = createSeason(2025 + i, teams, divisions);
    const finished = simulateSeason(season);

    for (const game of finished.games) {
      if (game.status === 'final' && game.boxScore) {
        collectBox(acc, game.boxScore);
      }
    }

    onProgress?.(i + 1, seasons);
  }

  return buildReport(acc, seasons);
}

// ── Report formatting ─────────────────────────────────────────────────────────

function inRange(v: number, t: TargetRange): boolean {
  return v >= t.low && v <= t.high;
}

function check(key: string, value: number): string {
  const t = TARGETS[key];
  if (!t) return '';
  return inRange(value, t) ? ' ✓' : ` ✗  target: ${t.label}`;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function fmtSummary(s: StatSummary, decimals = 1): string {
  return `avg=${fmt(s.avg, decimals)}  σ=${fmt(s.stddev, decimals)}  [${fmt(s.min, 0)}–${fmt(s.max, 0)}]  p25=${fmt(s.p25, 0)} p75=${fmt(s.p75, 0)}`;
}

/** Format a SimReport as a human-readable text block for terminal output. */
export function formatReport(r: SimReport): string {
  const totalGames = (r.games).toLocaleString();
  const lines: string[] = [
    `═══════════════════════════════════════════════════════════════════`,
    ` SIMULATION REPORT   ${r.seasons} seasons · ${totalGames} games · ${r.teamGames.toLocaleString()} team-games`,
    `═══════════════════════════════════════════════════════════════════`,
    ``,
    ` TEAM OFFENSE  (per team per game)`,
    ` ─────────────────────────────────────────────────────────────────`,
    ` Points per game      ${fmtSummary(r.pointsPerGame)}${check('pointsPerGame', r.pointsPerGame.avg)}`,
    ` Total yards/game     ${fmtSummary(r.totalYardsPerGame, 0)}`,
    ` Passing yards/game   ${fmt(r.passYardsPerGame)}`,
    ` Rushing yards/game   ${fmt(r.rushYardsPerGame)}`,
    ` Run play fraction    ${fmt(r.runPlayFraction * 100)}%`,
    ``,
    ` QB  (per game appearance with ≥ 5 attempts)`,
    ` ─────────────────────────────────────────────────────────────────`,
    ` Completion %         ${fmt(r.completionPct)}%${check('completionPct', r.completionPct)}`,
    ` Yards per attempt    ${fmt(r.yardsPerAttempt, 2)}${check('yardsPerAttempt', r.yardsPerAttempt)}`,
    ` Pass yards/game      ${fmt(r.passYardsPerGameQB)}`,
    ` TD rate              ${fmt(r.tdRate, 2)}%  (per attempt)`,
    ` INT rate             ${fmt(r.intRate, 2)}%  (per attempt)`,
    ` Sack rate            ${fmt(r.sackRate, 2)}%  (per attempt)`,
    ``,
    ` RUSHING  (per session with ≥ 3 carries)`,
    ` ─────────────────────────────────────────────────────────────────`,
    ` Yards per carry      ${fmt(r.yardsPerCarry, 2)}${check('yardsPerCarry', r.yardsPerCarry)}`,
    ` Rushing yards/game   ${fmt(r.rushYardsPerGameRB)}`,
    ` Rushing TDs/game     ${fmt(r.rushTDsPerGame, 2)}`,
    ``,
    ` RECEIVING  (per session with ≥ 1 reception)`,
    ` ─────────────────────────────────────────────────────────────────`,
    ` Yards per reception  ${fmt(r.yardsPerReception, 2)}`,
    ` Receptions/game      ${fmt(r.receptionsPerGame)}`,
    ` Receiving TDs/game   ${fmt(r.recTDsPerGame, 2)}`,
    ``,
    ` DEFENSE  (per team per game)`,
    ` ─────────────────────────────────────────────────────────────────`,
    ` Sacks per game       ${fmtSummary(r.sacksPerGame)}${check('sacksPerGame', r.sacksPerGame.avg)}`,
    ` INTs per game        ${fmt(r.intPerGame, 2)}${check('intPerGame', r.intPerGame)}`,
    ` Turnovers per game   ${fmt(r.turnoversPerGame, 2)}`,
    `═══════════════════════════════════════════════════════════════════`,
  ];
  return lines.join('\n');
}

/** Return a machine-readable summary of which targets pass/fail. */
export function checkTargets(r: SimReport): Array<{ key: string; value: number; pass: boolean; target: TargetRange }> {
  const checks: Array<[string, number]> = [
    ['pointsPerGame',   r.pointsPerGame.avg],
    ['completionPct',   r.completionPct],
    ['yardsPerAttempt', r.yardsPerAttempt],
    ['yardsPerCarry',   r.yardsPerCarry],
    ['sacksPerGame',    r.sacksPerGame.avg],
    ['intPerGame',      r.intPerGame],
  ];
  return checks.map(([key, value]) => {
    const t = TARGETS[key]!;
    return { key, value, pass: inRange(value, t), target: t };
  });
}
