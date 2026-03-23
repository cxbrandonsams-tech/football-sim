import { type Player, type Ratings, calcOverall, clamp, refreshScouting } from '../models/Player';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';

export type TrainingFocus = 'skill' | 'athleticism' | 'iq';

// ── Cost ──────────────────────────────────────────────────────────────────────

export function trainingCost(age: number): number {
  if (age < 23) return 1;
  if (age < 27) return 2;
  if (age < 31) return 3;
  return 4;
}

// ── Roll ──────────────────────────────────────────────────────────────────────

const DC_SUCCESS = 12;
const DC_CRIT    = 18;

function traitBonus(player: Player): number {
  return player.trait === 'high_work_ethic' ? 3 : 0;
}

export interface TrainingResult {
  roll: number;        // raw 1d20
  total: number;       // roll + trait bonus
  gain: number;        // points added to focus rating (0, 2, or 4)
  focus: TrainingFocus;
  cost: number;
}

function applyGain(ratings: Ratings, focus: TrainingFocus, gain: number): Ratings {
  return { ...ratings, [focus]: clamp(ratings[focus] + gain) };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function trainPlayer(
  league: League,
  playerId: string,
  focus: TrainingFocus,
): { league: League; result?: TrainingResult; error?: string } {
  const userTeam = getUserTeam(league);
  const player = userTeam.roster.find(p => p.id === playerId);

  if (!player) return { league, error: 'Player not found on your roster.' };

  const cost = trainingCost(player.age);
  if (league.developmentBudget < cost) {
    return { league, error: `Not enough development points (need ${cost}, have ${league.developmentBudget}).` };
  }

  const roll  = Math.ceil(Math.random() * 20);
  const total = roll + traitBonus(player);
  const gain  = total >= DC_CRIT ? 4 : total >= DC_SUCCESS ? 2 : 0;

  const newTrueRatings  = applyGain(player.trueRatings, focus, gain);
  const updatedPlayer   = refreshScouting({
    ...player,
    trueRatings: newTrueRatings,
    overall: calcOverall(player.position, newTrueRatings),
  });

  const newRoster    = userTeam.roster.map(p => p.id === playerId ? updatedPlayer : p);
  const updatedTeam  = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedLeague: League = {
    ...league,
    teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t),
    developmentBudget: league.developmentBudget - cost,
  };

  return {
    league: updatedLeague,
    result: { roll, total, gain, focus, cost },
  };
}
