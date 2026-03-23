/**
 * Standings and playoff seeding.
 *
 * - Division standings: 4 teams per division, sorted by record then point-diff
 * - Conference standings: sorted division winners first, then wild cards
 * - Playoff seeding: 7 teams per conference (4 division winners + 3 wild cards)
 */

import { type Season }                            from '../models/Season';
import { type Team }                              from '../models/Team';
import { type Division, type ConferenceName }     from '../models/League';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamStandingRow {
  teamId:       string;
  teamName:     string;
  abbreviation: string;
  wins:         number;
  losses:       number;
  ties:         number;
  pointsFor:    number;
  pointsAgainst: number;
  /** 0-based division finish rank within this row's division. */
  divRank:      number;
}

export interface DivisionStandings {
  conference: ConferenceName;
  division:   string;
  rows:       TeamStandingRow[];   // sorted 1st → 4th
}

export interface ConferenceStandings {
  conference: ConferenceName;
  /** Division winners (seeds 1-4) followed by wild cards (seeds 5-7), in seed order. */
  seeds:      Array<TeamStandingRow & { seed: number; isDivWinner: boolean }>;
}

export interface PlayoffField {
  conference: ConferenceName;
  /** Seeds 1-7. Seed 1 receives a first-round bye. */
  seeds:      Array<{ seed: number; teamId: string; teamName: string; isDivWinner: boolean }>;
}

// ── Core record builder ───────────────────────────────────────────────────────

function buildRecords(
  season: Season,
  teams:  Team[],
): Map<string, TeamStandingRow> {
  const map = new Map<string, TeamStandingRow>();
  for (const t of teams) {
    map.set(t.id, {
      teamId:       t.id,
      teamName:     t.name,
      abbreviation: t.abbreviation,
      wins: 0, losses: 0, ties: 0,
      pointsFor: 0, pointsAgainst: 0,
      divRank: 0,
    });
  }
  for (const g of season.games) {
    if (g.status !== 'final') continue;
    const h = map.get(g.homeTeam.id);
    const a = map.get(g.awayTeam.id);
    if (!h || !a) continue;
    h.pointsFor     += g.homeScore; h.pointsAgainst += g.awayScore;
    a.pointsFor     += g.awayScore; a.pointsAgainst += g.homeScore;
    if      (g.homeScore > g.awayScore) { h.wins++;   a.losses++; }
    else if (g.awayScore > g.homeScore) { a.wins++;   h.losses++; }
    else                                 { h.ties++;   a.ties++;   }
  }
  return map;
}

// ── Tiebreaker sort (simplified: record → point diff) ────────────────────────

function rowSort(a: TeamStandingRow, b: TeamStandingRow): number {
  const aPct  = a.wins + 0.5 * a.ties;
  const bPct  = b.wins + 0.5 * b.ties;
  if (bPct !== aPct) return bPct - aPct;
  return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeDivisionStandings(
  season:    Season,
  teams:     Team[],
  divisions: Division[],
): DivisionStandings[] {
  const records = buildRecords(season, teams);
  const result:  DivisionStandings[] = [];

  for (const d of divisions) {
    const rows = d.teamIds
      .map(id => records.get(id))
      .filter((r): r is TeamStandingRow => r !== undefined)
      .sort(rowSort);

    rows.forEach((r, i) => { r.divRank = i; });
    result.push({ conference: d.conference, division: d.division, rows });
  }

  return result;
}

export function computeConferenceStandings(
  season:    Season,
  teams:     Team[],
  divisions: Division[],
): ConferenceStandings[] {
  const divStandings = computeDivisionStandings(season, teams, divisions);
  const result: ConferenceStandings[] = [];

  for (const conf of ['IC', 'SC'] as ConferenceName[]) {
    const confDivs = divStandings.filter(d => d.conference === conf);

    // Division winners = rank-0 row from each division
    const winners  = confDivs.map(d => d.rows[0]!).sort(rowSort);
    // Wild cards = everyone else, sorted, top 3
    const nonWinners = confDivs
      .flatMap(d => d.rows.slice(1))
      .sort(rowSort)
      .slice(0, 3);

    const seeds = [
      ...winners.map((r, i)  => ({ ...r, seed: i + 1,             isDivWinner: true  })),
      ...nonWinners.map((r, i) => ({ ...r, seed: winners.length + i + 1, isDivWinner: false })),
    ];
    result.push({ conference: conf, seeds });
  }
  return result;
}

export function computePlayoffField(
  season:    Season,
  teams:     Team[],
  divisions: Division[],
): PlayoffField[] {
  const confStandings = computeConferenceStandings(season, teams, divisions);
  return confStandings.map(cs => ({
    conference: cs.conference,
    seeds: cs.seeds.slice(0, 7).map(s => ({
      seed:        s.seed,
      teamId:      s.teamId,
      teamName:    s.teamName,
      isDivWinner: s.isDivWinner,
    })),
  }));
}

/**
 * Returns a map of teamId → 0-based division finish rank.
 * Useful as the `prevDivFinish` input for the next season's schedule generator.
 */
export function extractDivFinish(
  divStandings: DivisionStandings[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of divStandings) {
    d.rows.forEach((r, i) => { out[r.teamId] = i; });
  }
  return out;
}
