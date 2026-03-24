/**
 * NFL-style 17-game schedule generator.
 *
 * Each team plays:
 *  1.  6 games  — home + away vs each of 3 division opponents
 *  2.  4 games  — vs every team in one other same-conference division (rotates 3-yr cycle)
 *  3.  4 games  — vs every team in one cross-conference division (rotates 4-yr cycle)
 *  4.  2 games  — vs same-finish-position teams in the 2 remaining same-conference divisions
 *  5.  1 game   — vs same-finish-position team in one remaining cross-conference division
 *
 * Total: 17 games per team, 272 games total across 32 teams.
 */

import { type Team }               from '../models/Team';
import { type Game, createGame }   from '../models/Game';
import { type Division, type ConferenceName } from '../models/League';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Division names in canonical index order (0=N,1=S,2=E,3=W). */
const DIV_NAMES = ['North', 'South', 'East', 'West'] as const;

/**
 * For year%3 == p, division at index i plays the division at index
 * CONF_PAIRING[p][i] within the same conference.
 */
const CONF_PAIRING: [number, number, number, number][] = [
  [1, 0, 3, 2], // year%3==0 : N↔S  E↔W
  [2, 3, 0, 1], // year%3==1 : N↔E  S↔W
  [3, 2, 1, 0], // year%3==2 : N↔W  S↔E
];

const BYE_WEEK_START  = 6;
const BYE_WEEK_SPREAD = 9;  // bye weeks land in 6-14, 3-4 teams per week
const TOTAL_WEEKS     = 18; // 18-week window: 17 games + 1 bye per team, capacity = 18×16−16 = 272 (exact fit)

// ── Types ─────────────────────────────────────────────────────────────────────

interface Matchup {
  homeId: string;
  awayId: string;
}

export interface ScheduleParams {
  year:          number;
  teams:         Team[];
  divisions:     Division[];
  /**
   * teamId → 0-based finish rank within division from the previous season.
   * 0 = 1st place.  Defaults to team's index within division when absent.
   */
  prevDivFinish?: Record<string, number>;
}

// ── Division helpers ──────────────────────────────────────────────────────────

interface DivInfo {
  conference: ConferenceName;
  divIndex:   number;          // 0=North … 3=West
  teamIds:    string[];
}

function buildDivMap(divisions: Division[]): Map<string, DivInfo> {
  const map = new Map<string, DivInfo>();
  for (const d of divisions) {
    const divIndex = DIV_NAMES.indexOf(d.division as typeof DIV_NAMES[number]);
    const info: DivInfo = { conference: d.conference, divIndex, teamIds: d.teamIds };
    for (const id of d.teamIds) map.set(id, info);
  }
  return map;
}

/** All divisions belonging to a conference, keyed by divIndex. */
function confDivisions(
  divisions: Division[],
  conference: ConferenceName,
): Map<number, Division> {
  const map = new Map<number, Division>();
  for (const d of divisions) {
    if (d.conference !== conference) continue;
    const idx = DIV_NAMES.indexOf(d.division as typeof DIV_NAMES[number]);
    map.set(idx, d);
  }
  return map;
}

const OTHER_CONF: Record<ConferenceName, ConferenceName> = {
  IC: 'SC',
  SC: 'IC',
};

// ── Home/away helpers ─────────────────────────────────────────────────────────

/**
 * Stable home/away for two cross-division teams.
 * (rankA + rankB + year) % 2 ensures each team gets 2H/2A in a 4-team division matchup.
 */
function xDivHome(
  idA: string, rankA: number,
  idB: string, rankB: number,
  year: number,
): Matchup {
  return (rankA + rankB + year) % 2 === 0
    ? { homeId: idA, awayId: idB }
    : { homeId: idB, awayId: idA };
}

/**
 * Single-game home/away (same-rank games).
 * Alternates by year and lexicographic team id so it's deterministic.
 */
function singleHome(idA: string, idB: string, year: number): Matchup {
  const aIsHome = (year % 2 === 0) === (idA < idB);
  return aIsHome ? { homeId: idA, awayId: idB } : { homeId: idB, awayId: idA };
}

// ── Matchup builders ──────────────────────────────────────────────────────────

/** 1. Division games — home + away vs every division opponent (6 per team). */
function divisionMatchups(divisions: Division[]): Matchup[] {
  const ms: Matchup[] = [];
  for (const d of divisions) {
    const ids = d.teamIds;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        ms.push({ homeId: ids[i]!, awayId: ids[j]! });
        ms.push({ homeId: ids[j]!, awayId: ids[i]! });
      }
    }
  }
  return ms;
}

/** 2. In-conference division rotation — 4 games each team. */
function inConfRotationMatchups(
  divisions: Division[],
  year: number,
): Matchup[] {
  const ms: Matchup[] = [];
  const pairing = CONF_PAIRING[year % 3]!;

  for (const conf of ['IC', 'SC'] as ConferenceName[]) {
    const cdivs = confDivisions(divisions, conf);
    const processed = new Set<string>();

    for (const [divIdx, divA] of cdivs) {
      const oppIdx = pairing[divIdx]!;
      const pairKey = [Math.min(divIdx, oppIdx), Math.max(divIdx, oppIdx)].join('-');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const divB = cdivs.get(oppIdx)!;
      for (let i = 0; i < divA.teamIds.length; i++) {
        for (let j = 0; j < divB.teamIds.length; j++) {
          ms.push(xDivHome(divA.teamIds[i]!, i, divB.teamIds[j]!, j, year));
        }
      }
    }
  }
  return ms;
}

/** 3. Cross-conference division rotation — 4 games each team. */
function crossConfRotationMatchups(
  divisions: Division[],
  year: number,
): Matchup[] {
  const ms: Matchup[] = [];
  const icDivs = confDivisions(divisions, 'IC');
  const scDivs = confDivisions(divisions, 'SC');
  const processed = new Set<string>();

  for (const [icIdx, divIC] of icDivs) {
    const scIdx  = (icIdx + year) % 4;
    const pairKey = `${icIdx}-${scIdx}`;
    if (processed.has(pairKey)) continue;
    processed.add(pairKey);

    const divSC = scDivs.get(scIdx);
    if (!divSC) continue;

    for (let i = 0; i < divIC.teamIds.length; i++) {
      for (let j = 0; j < divSC.teamIds.length; j++) {
        ms.push(xDivHome(divIC.teamIds[i]!, i, divSC.teamIds[j]!, j, year));
      }
    }
  }
  return ms;
}

/**
 * 4 + 5. Same-rank games.
 *   4 → 2 in-conference games vs same-finish in the 2 remaining conf divisions
 *   5 → 1 cross-conference game vs same-finish in a rotating opposing division
 *
 * Step 4 iterates per-conference.
 * Step 5 iterates IC→SC only: (divIdx+year+2)%4 is a bijection on {0,1,2,3},
 * so every IC team gets exactly one SC opponent and vice-versa.
 */
function sameRankMatchups(
  divisions: Division[],
  year: number,
  prevDivFinish: Record<string, number>,
): Matchup[] {
  const ms: Matchup[] = [];
  const pairing   = CONF_PAIRING[year % 3]!;
  const processed = new Set<string>();

  // ── Step 4: in-conference same-rank (2 games per team) ──────────────────────
  for (const conf of ['IC', 'SC'] as ConferenceName[]) {
    const cdivs = confDivisions(divisions, conf);

    for (const [divIdx, myDiv] of cdivs) {
      const rotOpponentIdx = pairing[divIdx]!;
      const remaining = [0, 1, 2, 3].filter(x => x !== divIdx && x !== rotOpponentIdx);

      for (const teamId of myDiv.teamIds) {
        const myRank = prevDivFinish[teamId] ?? myDiv.teamIds.indexOf(teamId);

        for (const remIdx of remaining) {
          const remDiv = cdivs.get(remIdx)!;
          const opp    = remDiv.teamIds.find(id =>
            (prevDivFinish[id] ?? remDiv.teamIds.indexOf(id)) === myRank,
          );
          if (!opp) continue;
          const key = [teamId, opp].sort().join('|');
          if (processed.has(key)) continue;
          processed.add(key);
          ms.push(singleHome(teamId, opp, year));
        }
      }
    }
  }

  // ── Step 5: cross-conference same-rank (1 game per team, IC→SC only) ────────
  const icDivs = confDivisions(divisions, 'IC');
  const scDivs = confDivisions(divisions, 'SC');

  for (const [divIdx, icDiv] of icDivs) {
    const scOppIdx = (divIdx + year + 2) % 4;
    const scDiv    = scDivs.get(scOppIdx);
    if (!scDiv) continue;

    for (const teamId of icDiv.teamIds) {
      const myRank = prevDivFinish[teamId] ?? icDiv.teamIds.indexOf(teamId);
      const opp    = scDiv.teamIds.find(id =>
        (prevDivFinish[id] ?? scDiv.teamIds.indexOf(id)) === myRank,
      );
      if (!opp) continue;
      const key = [teamId, opp].sort().join('|');
      if (processed.has(key)) continue;
      processed.add(key);
      ms.push(singleHome(teamId, opp, year));
    }
  }

  return ms;
}

// ── Week assignment ───────────────────────────────────────────────────────────

/** Deterministic Fisher-Yates shuffle using a simple LCG seed. */
function shuffled<T>(arr: T[], seed: number): T[] {
  const a   = [...arr];
  let   rng = seed | 1;
  for (let i = a.length - 1; i > 0; i--) {
    rng = Math.imul(rng, 1664525) + 1013904223 | 0;
    const j = (rng >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function assignByes(teams: Team[]): Map<string, number> {
  const byes = new Map<string, number>();
  teams.forEach((t, i) => byes.set(t.id, BYE_WEEK_START + (i % BYE_WEEK_SPREAD)));
  return byes;
}

function assignWeeks(
  matchups: Matchup[],
  byes:     Map<string, number>,
  year:     number,
): Array<Matchup & { week: number }> {
  const weekBusy: Set<string>[] = Array.from({ length: TOTAL_WEEKS + 2 }, () => new Set());

  // Pre-fill bye weeks
  for (const [teamId, byeWeek] of byes) {
    weekBusy[byeWeek]!.add(teamId);
  }

  const ordered = matchups;

  const result: Array<Matchup & { week: number }> = [];

  for (const m of ordered) {
    let week = TOTAL_WEEKS + 1;
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      const busy = weekBusy[w]!;
      if (!busy.has(m.homeId) && !busy.has(m.awayId)) {
        week = w;
        break;
      }
    }
    weekBusy[week]!.add(m.homeId);
    weekBusy[week]!.add(m.awayId);
    result.push({ ...m, week });
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSchedule(params: ScheduleParams): Game[] {
  const { year, teams, divisions, prevDivFinish = {} } = params;
  const teamMap = new Map(teams.map(t => [t.id, t]));

  const matchups: Matchup[] = [
    ...divisionMatchups(divisions),
    ...inConfRotationMatchups(divisions, year),
    ...crossConfRotationMatchups(divisions, year),
    ...sameRankMatchups(divisions, year, prevDivFinish),
  ];

  const byes   = assignByes(teams);
  const placed = assignWeeks(matchups, byes, year);

  let gameNum = 0;
  return placed.map(m => createGame(
    `${year}-g${++gameNum}`,
    m.week,
    teamMap.get(m.homeId)!,
    teamMap.get(m.awayId)!,
  ));
}
