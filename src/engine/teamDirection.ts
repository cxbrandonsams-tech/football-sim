/**
 * Team direction model and roster need evaluation.
 *
 * getTeamDirection() classifies each AI team as contender / neutral / rebuilding
 * based on current record, roster quality, and age profile.
 *
 * evaluateRosterNeeds() scores each position group by how urgently the team
 * needs players there (positive = need, negative = overstocked).
 *
 * Both functions are consumed by AI subsystems in contracts, rosterManagement,
 * draft, and trades to make strategically coherent decisions.
 */

import { type Team } from '../models/Team';
import { type League } from '../models/League';
import { type Position } from '../models/Player';
import { calcStandings } from '../models/Standings';

export type TeamDirection = 'contender' | 'neutral' | 'rebuilding';
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST';

// ── Position helpers ──────────────────────────────────────────────────────────

/** Map a position to its positional group */
export function posGroup(pos: Position): PositionGroup {
  switch (pos) {
    case 'QB':  return 'QB';
    case 'RB':  return 'RB';
    case 'WR':  return 'WR';
    case 'TE':  return 'TE';
    case 'OT': case 'OG': case 'C':   return 'OL';
    case 'DE': case 'DT':             return 'DL';
    case 'OLB': case 'MLB':           return 'LB';
    case 'CB': case 'FS': case 'SS':  return 'DB';
    case 'K':  case 'P':              return 'ST';
  }
}

/** Desired roster depth per position group */
export const WANT_COUNTS: Record<PositionGroup, number> = {
  QB: 2, RB: 3, WR: 4, TE: 2, OL: 8, DL: 5, LB: 4, DB: 5, ST: 2,
};

// ── Team profile helpers ──────────────────────────────────────────────────────

/** Average overall rating across the team's active roster */
export function getTeamAvgOvr(team: Team): number {
  if (team.roster.length === 0) return 50;
  return team.roster.reduce((sum, p) => sum + p.overall, 0) / team.roster.length;
}

/** Average age across the team's active roster */
export function getTeamAvgAge(team: Team): number {
  if (team.roster.length === 0) return 25;
  return team.roster.reduce((sum, p) => sum + p.age, 0) / team.roster.length;
}

// ── Direction model ───────────────────────────────────────────────────────────

/**
 * Classify a team's strategic posture based on record, roster quality, and age.
 *
 *   contender  — strong record + quality roster; targeting a championship now
 *   rebuilding — poor record or weak roster; prioritising youth and future picks
 *   neutral    — everything in between
 */
export function getTeamDirection(team: Team, league: League): TeamDirection {
  const standings = calcStandings(league.currentSeason);
  const entry     = standings.find(s => s.team.id === team.id);
  const wins      = entry?.wins   ?? 0;
  const losses    = entry?.losses ?? 0;
  const games     = wins + losses;
  // Need a meaningful sample before reading win%; default to neutral otherwise.
  const winPct    = games >= 4 ? wins / games : 0.5;

  const avgOvr = getTeamAvgOvr(team);
  const avgAge = getTeamAvgAge(team);

  // Contenders: winning record + quality roster + not aging out
  if (winPct >= 0.56 && avgOvr >= 64 && avgAge <= 30.0) return 'contender';
  // Dominant record overrides soft roster concern
  if (winPct >= 0.65 && avgOvr >= 60) return 'contender';

  // Rebuilders: bad record + weak roster, OR simply too weak regardless of record
  if (winPct <= 0.35 && avgOvr <= 63) return 'rebuilding';
  if (avgOvr < 57) return 'rebuilding';

  return 'neutral';
}

// ── Roster need evaluation ────────────────────────────────────────────────────

/**
 * Score each position group by how urgently the team needs reinforcement there.
 *   > 0  — real need: short on depth or top starter is weak
 *   = 0  — adequately covered
 *   < 0  — overstocked; deprioritise
 */
export function evaluateRosterNeeds(team: Team): Record<PositionGroup, number> {
  const groups: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
  const result = {} as Record<PositionGroup, number>;

  for (const group of groups) {
    const players = team.roster.filter(p => posGroup(p.position) === group);
    const want    = WANT_COUNTS[group];
    const have    = players.length;

    // Depth need: how many bodies are we short?
    const depthNeed = Math.max(0, want - have);

    // Quality need: is the best player here below a starter threshold?
    const sorted      = [...players].sort((a, b) => b.overall - a.overall);
    const topOvr      = sorted[0]?.overall ?? 0;
    const qualityNeed = topOvr === 0 ? 3 : topOvr < 62 ? 2 : 0;

    // Overstock penalty: well above target depth, reduce priority
    const overstock = Math.max(0, have - want - 2);

    result[group] = depthNeed + qualityNeed - overstock;
  }

  return result;
}
