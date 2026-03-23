import { type Player } from '../models/Player';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { CAP_LIMIT, getTeamPayroll } from './rosterManagement';

// Remove contractDemand from a player after extension or decline-and-expire.
function clearDemand(player: Player): Player {
  const { contractDemand: _removed, ...rest } = player;
  return rest as Player;
}

// ── User extension ────────────────────────────────────────────────────────────

export function extendPlayer(
  league: League,
  playerId: string,
): { league: League; error?: string } {
  const userTeam = getUserTeam(league);
  const player   = userTeam.roster.find(p => p.id === playerId);

  if (!player)              return { league, error: 'Player not found on roster.' };
  if (!player.contractDemand) return { league, error: 'No pending contract demand for this player.' };

  const demand     = player.contractDemand;
  const payroll    = getTeamPayroll(userTeam);
  const capImpact  = demand.salary - player.salary; // may be 0 or positive

  if (payroll + capImpact > CAP_LIMIT) {
    return {
      league,
      error: `Extension would put payroll at $${payroll + capImpact} (cap: $${CAP_LIMIT}).`,
    };
  }

  const extended   = { ...clearDemand(player), salary: demand.salary, yearsRemaining: demand.years };
  const newRoster  = userTeam.roster.map(p => p.id === playerId ? extended : p);
  const updatedTeam = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };

  return {
    league: { ...league, teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t) },
  };
}

// ── AI extensions ─────────────────────────────────────────────────────────────

const AI_EXTEND_THRESHOLD = 65; // extend players at or above this true overall

export function aiExtendPlayers(
  league: League,
): { league: League; log: { teamAbbr: string; playerName: string; salary: number }[] } {
  let current = league;
  const log: { teamAbbr: string; playerName: string; salary: number }[] = [];

  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;

    let currentTeam = current.teams.find(t => t.id === team.id)!;

    for (const player of currentTeam.roster) {
      if (!player.contractDemand) continue;
      if (player.overall < AI_EXTEND_THRESHOLD) continue; // let mediocre players walk

      const payroll   = getTeamPayroll(currentTeam);
      const capImpact = player.contractDemand.salary - player.salary;
      if (payroll + capImpact > CAP_LIMIT) continue;

      const extended  = { ...clearDemand(player), salary: player.contractDemand.salary, yearsRemaining: player.contractDemand.years };
      const newRoster = currentTeam.roster.map(p => p.id === player.id ? extended : p);
      currentTeam     = { ...currentTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, false) };
      current         = { ...current, teams: current.teams.map(t => t.id === team.id ? currentTeam : t) };
      log.push({ teamAbbr: team.abbreviation, playerName: player.name, salary: player.contractDemand.salary });
    }
  }

  return { league: current, log };
}
