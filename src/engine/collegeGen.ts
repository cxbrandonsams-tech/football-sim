/**
 * College data generator — produces conference standings and stat leaders
 * for the scouting presentation layer. Called once per offseason alongside
 * draft class generation.
 *
 * No college games are simulated. W/L records and stat lines are generated
 * with plausible ranges. Better programs tend to produce more highly-rated
 * prospects.
 */

import { type CollegeData, type CollegeTeam, type CollegeStatLeader, COLLEGE_CONFERENCES, ALL_COLLEGE_NAMES } from '../models/College';
import { type Prospect } from '../models/Prospect';

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Generate college standings. Better programs (earlier in conference lists)
 * tend to get more wins, with randomness mixed in.
 */
function generateStandings(year: number): CollegeData['conferences'] {
  return COLLEGE_CONFERENCES.map(conf => {
    const teams: CollegeTeam[] = conf.teams.map((name, idx) => {
      // Base win expectation: top teams get more wins
      const baseWins = Math.max(3, 12 - idx - randInt(0, 3));
      const wins = Math.min(13, Math.max(1, baseWins + randInt(-2, 2)));
      const losses = Math.min(12, Math.max(0, 13 - wins + randInt(-1, 1)));
      return { name, conference: conf.name, wins, losses };
    });
    // Sort by wins descending
    teams.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    return { name: conf.name, teams };
  });
}

/**
 * Generate stat leaders from the prospect pool.
 * Picks the best prospects at each position group and gives them
 * plausible college stat lines.
 */
function generateStatLeaders(prospects: Prospect[]): CollegeStatLeader[] {
  const leaders: CollegeStatLeader[] = [];

  // Passing leaders — top QBs
  const qbs = prospects.filter(p => p.position === 'QB').sort((a, b) => b.trueOverall - a.trueOverall);
  for (const qb of qbs.slice(0, 3)) {
    const yds = randInt(2800, 4200);
    const tds = randInt(20, 38);
    const ints = randInt(4, 14);
    leaders.push({
      name: qb.name, prospectId: qb.id, college: qb.college,
      stat: `${yds.toLocaleString()} yds, ${tds} TD, ${ints} INT`,
      category: 'passing',
    });
  }

  // Rushing leaders — top RBs
  const rbs = prospects.filter(p => p.position === 'RB').sort((a, b) => b.trueOverall - a.trueOverall);
  for (const rb of rbs.slice(0, 3)) {
    const yds = randInt(1000, 1800);
    const tds = randInt(8, 20);
    leaders.push({
      name: rb.name, prospectId: rb.id, college: rb.college,
      stat: `${yds.toLocaleString()} yds, ${tds} TD`,
      category: 'rushing',
    });
  }

  // Receiving leaders — top WRs/TEs
  const recvrs = prospects.filter(p => p.position === 'WR' || p.position === 'TE').sort((a, b) => b.trueOverall - a.trueOverall);
  for (const wr of recvrs.slice(0, 3)) {
    const rec = randInt(55, 95);
    const yds = randInt(800, 1500);
    const tds = randInt(5, 15);
    leaders.push({
      name: wr.name, prospectId: wr.id, college: wr.college,
      stat: `${rec} rec, ${yds.toLocaleString()} yds, ${tds} TD`,
      category: 'receiving',
    });
  }

  // Sack leaders — top DEs
  const des = prospects.filter(p => p.position === 'DE' || p.position === 'OLB').sort((a, b) => b.trueOverall - a.trueOverall);
  for (const de of des.slice(0, 2)) {
    const sacks = randInt(8, 16);
    leaders.push({
      name: de.name, prospectId: de.id, college: de.college,
      stat: `${sacks}.${randInt(0, 5)} sacks`,
      category: 'sacks',
    });
  }

  // INT leaders — top CBs/safeties
  const dbs = prospects.filter(p => p.position === 'CB' || p.position === 'FS' || p.position === 'SS').sort((a, b) => b.trueOverall - a.trueOverall);
  for (const db of dbs.slice(0, 2)) {
    const ints = randInt(4, 9);
    leaders.push({
      name: db.name, prospectId: db.id, college: db.college,
      stat: `${ints} interceptions`,
      category: 'interceptions',
    });
  }

  return leaders;
}

/**
 * Generate a full college data set for a given year and prospect pool.
 */
export function generateCollegeData(year: number, prospects: Prospect[]): CollegeData {
  return {
    year,
    conferences: generateStandings(year),
    statLeaders: generateStatLeaders(prospects),
  };
}
