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

/** Exactly 8 bye weeks × 4 teams each = 32 bye slots (one per team). */
const BYE_WEEKS   = [6, 7, 8, 9, 10, 11, 12, 13] as const;
const TOTAL_WEEKS = 18; // 18-week window: 17 games + 1 bye per team, capacity = 10×16 + 8×14 = 272 (exact fit)

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
  // 32 teams ÷ 8 bye weeks = exactly 4 teams per bye week — guaranteed no overflow.
  const byes = new Map<string, number>();
  teams.forEach((t, i) => byes.set(t.id, BYE_WEEKS[Math.floor(i / 4)]!));
  return byes;
}

/**
 * Near-maximum matching via randomised greedy restarts + one DFS augmentation pass.
 *
 * The DFS augmenting-path algorithm for *general* (non-bipartite) graphs can produce
 * inconsistent matchedTo entries when odd cycles exist (the classic "blossom" problem).
 * Rather than implementing Edmonds' full blossom algorithm we use:
 *   1. 50 random greedy passes — shuffle candidates, accept each matchup if both teams
 *      are free.  Keeps the best result across all passes.
 *   2. One DFS augmenting-path pass on the *best* greedy result to pick up any
 *      remaining slack (safe because the greedy already avoids odd-cycle issues).
 *
 * For a 17-regular graph on 32 vertices this reliably finds the perfect matching.
 */
function maxMatchingGreedy(candidates: Matchup[], seed: number): Matchup[] {
  if (candidates.length === 0) return [];

  // Compute max possible: floor(teams / 2).
  const teamSet = new Set<string>();
  for (const m of candidates) { teamSet.add(m.homeId); teamSet.add(m.awayId); }
  const maxPossible = Math.floor(teamSet.size / 2);

  // ── Phase 1: 50 random greedy restarts ───────────────────────────────────────
  let bestPlaced: Matchup[] = [];

  for (let attempt = 0; attempt < 50 && bestPlaced.length < maxPossible; attempt++) {
    const order = shuffled(candidates, seed + attempt * 7919);
    const used  = new Set<string>();
    const cur:  Matchup[] = [];

    for (const m of order) {
      if (!used.has(m.homeId) && !used.has(m.awayId)) {
        used.add(m.homeId);
        used.add(m.awayId);
        cur.push(m);
      }
    }
    if (cur.length > bestPlaced.length) bestPlaced = cur;
  }

  // ── Phase 2: DFS augmentation on remaining unmatched teams ───────────────────
  // Build adjacency list from the original candidates (not just placed ones).
  const adj = new Map<string, Matchup[]>();
  for (const m of candidates) {
    if (!adj.has(m.homeId)) adj.set(m.homeId, []);
    adj.get(m.homeId)!.push(m);
    if (!adj.has(m.awayId)) adj.set(m.awayId, []);
    adj.get(m.awayId)!.push(m);
  }

  // Seed the matching from the greedy result.
  const matchedTo = new Map<string, string>();
  const matchedBy = new Map<string, Matchup>();
  for (const m of bestPlaced) {
    matchedTo.set(m.homeId, m.awayId);
    matchedTo.set(m.awayId, m.homeId);
    matchedBy.set(m.homeId, m);
    matchedBy.set(m.awayId, m);
  }

  function augment(u: string, visited: Set<string>): boolean {
    for (const m of (adj.get(u) ?? [])) {
      const v = m.homeId === u ? m.awayId : m.homeId;
      if (visited.has(v)) continue;
      visited.add(v);
      const prev = matchedTo.get(v);
      if (prev === undefined || augment(prev, visited)) {
        // Clear the edge that prev was using (if any), so it's no longer in result.
        if (prev !== undefined) {
          const oldEdge = matchedBy.get(prev);
          if (oldEdge) {
            matchedBy.delete(oldEdge.homeId);
            matchedBy.delete(oldEdge.awayId);
          }
        }
        matchedTo.set(u, v);
        matchedTo.set(v, u);
        matchedBy.set(u, m);
        matchedBy.set(v, m);
        return true;
      }
    }
    return false;
  }

  // Only try teams that the greedy left unmatched.
  for (const team of teamSet) {
    if (!matchedTo.has(team)) augment(team, new Set([team]));
  }

  // Collect distinct matchups from matchedBy (each matchup appears twice).
  const placed = new Set<Matchup>(matchedBy.values());
  return [...placed];
}

/**
 * Attempt one full season schedule with the given shuffle seed.
 * Returns games-with-weeks; any games with week > TOTAL_WEEKS are overflow.
 */
function assignWeeks(
  matchups: Matchup[],
  byes:     Map<string, number>,
  seed:     number,
): Array<Matchup & { week: number }> {
  const weekBusy: Set<string>[] = Array.from({ length: TOTAL_WEEKS + 2 }, () => new Set());
  for (const [teamId, byeWeek] of byes) {
    weekBusy[byeWeek]!.add(teamId);
  }

  // Pre-sort matchups by "flexibility": games with fewest valid weeks go first,
  // so the most constrained matchups get the best chance of landing in the right week.
  // Flexibility ≈ number of weeks where neither team is on bye.
  const byeOf = new Map<string, number>();
  for (const [teamId, byeWeek] of byes) byeOf.set(teamId, byeWeek);

  const flexibility = (m: Matchup) => {
    const bA = byeOf.get(m.homeId) ?? -1;
    const bB = byeOf.get(m.awayId) ?? -1;
    const excluded = bA === bB ? 1 : (bA >= 0 ? 1 : 0) + (bB >= 0 ? 1 : 0);
    return TOTAL_WEEKS - excluded;
  };

  // Shuffle first (for variety across seeds), then stable-sort by flexibility.
  const shuffledMatchups = shuffled(matchups, seed);
  shuffledMatchups.sort((a, b) => flexibility(a) - flexibility(b));

  let remaining = shuffledMatchups;
  const result: Array<Matchup & { week: number }> = [];

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const busy = weekBusy[w]!;

    // Candidates = remaining matchups where both teams are free this week.
    const candidates = remaining.filter(m => !busy.has(m.homeId) && !busy.has(m.awayId));
    const placed      = maxMatchingGreedy(candidates, seed * 1000 + w);
    const placedSet   = new Set(placed);

    for (const m of placed) {
      busy.add(m.homeId);
      busy.add(m.awayId);
      result.push({ ...m, week: w });
    }
    remaining = remaining.filter(m => !placedSet.has(m));
  }

  for (const m of remaining) {
    result.push({ ...m, week: TOTAL_WEEKS + 1 }); // overflow marker
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

  const byes = assignByes(teams);

  // Try up to 30 different shuffle seeds; stop as soon as we find a perfect schedule.
  let bestPlaced: Array<Matchup & { week: number }> = [];
  let bestOverflow = Infinity;

  for (let attempt = 0; attempt < 30 && bestOverflow > 0; attempt++) {
    const placed   = assignWeeks(matchups, byes, year * 100 + attempt);
    const overflow = placed.filter(m => m.week > TOTAL_WEEKS).length;
    if (overflow < bestOverflow) {
      bestOverflow = overflow;
      bestPlaced   = placed;
    }
  }

  let gameNum = 0;
  return bestPlaced.map(m => createGame(
    `${year}-g${++gameNum}`,
    m.week,
    teamMap.get(m.homeId)!,
    teamMap.get(m.awayId)!,
  ));
}
