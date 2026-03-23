import { type Player } from '../models/Player';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { CAP_LIMIT, getTeamPayroll } from './rosterManagement';
import { getTeamDirection, evaluateRosterNeeds, posGroup } from './teamDirection';

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

  const extended   = { ...clearDemand(player), isRookie: false, salary: demand.salary, yearsRemaining: demand.years };
  const newRoster  = userTeam.roster.map(p => p.id === playerId ? extended : p);
  const updatedTeam = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };

  return {
    league: { ...league, teams: league.teams.map(t => t.id === userTeam.id ? updatedTeam : t) },
  };
}

// ── AI extensions ─────────────────────────────────────────────────────────────

/**
 * Direction-aware AI extension logic:
 *   contender  — extend OVR ≥ 60, including veterans up to age 35 (win-now)
 *   neutral    — extend OVR ≥ 65 regardless of age (solid starters only)
 *   rebuilding — extend OVR ≥ 67 only for young players (age ≤ 28); let veterans walk
 *
 * Also skips extension when the position group is already well-stocked.
 */
function shouldExtend(player: Player, direction: ReturnType<typeof getTeamDirection>, needs: ReturnType<typeof evaluateRosterNeeds>): boolean {
  const group = posGroup(player.position);
  // Never extend into an overstocked position (need < -1)
  if ((needs[group] ?? 0) < -1) return false;

  switch (direction) {
    case 'contender':
      // Prioritise keeping quality players; veterans still help a contender
      return player.overall >= 60 && player.age <= 35;
    case 'rebuilding':
      // Invest only in proven young talent; shed expensive veterans
      return player.overall >= 67 && player.age <= 28;
    case 'neutral':
    default:
      return player.overall >= 65;
  }
}

export function aiExtendPlayers(
  league: League,
): { league: League; log: { teamAbbr: string; playerName: string; salary: number }[] } {
  let current = league;
  const log: { teamAbbr: string; playerName: string; salary: number }[] = [];

  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;

    let currentTeam = current.teams.find(t => t.id === team.id)!;
    const direction = getTeamDirection(currentTeam, current);
    const needs     = evaluateRosterNeeds(currentTeam);

    for (const player of currentTeam.roster) {
      if (!player.contractDemand) continue;
      if (!shouldExtend(player, direction, needs)) continue;

      const payroll   = getTeamPayroll(currentTeam);
      const capImpact = player.contractDemand.salary - player.salary;
      if (payroll + capImpact > CAP_LIMIT) continue;

      const extended  = { ...clearDemand(player), isRookie: false, salary: player.contractDemand.salary, yearsRemaining: player.contractDemand.years };
      const newRoster = currentTeam.roster.map(p => p.id === player.id ? extended : p);
      currentTeam     = { ...currentTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, false) };
      current         = { ...current, teams: current.teams.map(t => t.id === team.id ? currentTeam : t) };
      log.push({ teamAbbr: team.abbreviation, playerName: player.name, salary: player.contractDemand.salary });
    }
  }

  return { league: current, log };
}
