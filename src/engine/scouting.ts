import { refreshScouting } from '../models/Player';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';

export const SCOUT_GAIN = 20; // scoutingLevel increase per action

export function scoutPlayer(league: League, playerId: string): { league: League; error?: string } {
  if (league.scoutingBudget <= 0) {
    return { league, error: 'No scouting actions remaining this season.' };
  }

  const userTeam = getUserTeam(league);
  const inRoster = userTeam.roster.find(p => p.id === playerId);
  const inFA     = league.freeAgents.find(p => p.id === playerId);
  const player   = inRoster ?? inFA;

  if (!player) return { league, error: 'Player not found.' };
  if (player.scoutingLevel >= 100) return { league, error: `${player.name} is already fully scouted.` };

  const updated = refreshScouting({
    ...player,
    scoutingLevel: Math.min(100, player.scoutingLevel + SCOUT_GAIN),
  });

  let next = { ...league, scoutingBudget: league.scoutingBudget - 1 };

  if (inRoster) {
    const newRoster = userTeam.roster.map(p => p.id === playerId ? updated : p);
    const updatedTeam = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
    next = { ...next, teams: next.teams.map(t => t.id === userTeam.id ? updatedTeam : t) };
  } else {
    next = { ...next, freeAgents: next.freeAgents.map(p => p.id === playerId ? updated : p) };
  }

  return { league: next };
}
