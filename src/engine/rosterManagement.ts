import { calcSalary } from '../models/Player';
import { type Team } from '../models/Team';
import { type League, getUserTeam } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';

export const MAX_ROSTER_SIZE = 20;
export const CAP_LIMIT       = 150;

export function getTeamPayroll(team: Team): number {
  return team.roster.reduce((sum, p) => sum + p.salary, 0);
}

export function signPlayer(league: League, playerId: string): { league: League; error?: string } {
  const player = league.freeAgents.find(p => p.id === playerId);
  if (!player) return { league, error: 'Player not found in free agency.' };

  const userTeam = getUserTeam(league);
  if (userTeam.roster.length >= MAX_ROSTER_SIZE) {
    return { league, error: `Roster is full (max ${MAX_ROSTER_SIZE}).` };
  }

  const currentPayroll = getTeamPayroll(userTeam);
  if (currentPayroll + player.salary > CAP_LIMIT) {
    return { league, error: `Signing ${player.name} ($${player.salary}) would exceed the cap ($${currentPayroll}/$${CAP_LIMIT}).` };
  }

  // Give signed player a fresh contract (2–4 years, recalculate salary from current overall)
  const signedPlayer = {
    ...player,
    salary: calcSalary(player.overall),
    yearsRemaining: Math.floor(Math.random() * 3) + 2,
  };

  const newRoster    = [...userTeam.roster, signedPlayer];
  const updatedTeam  = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedTeams = league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t);

  return {
    league: {
      ...league,
      teams: updatedTeams,
      freeAgents: league.freeAgents.filter(p => p.id !== playerId),
    },
  };
}

// Each AI team signs the best FAs it can afford until its roster is full or cap is tight.
// Skips the user team entirely (user manages their own roster).
export function aiSignFreeAgents(league: League): { league: League; signed: { teamAbbr: string; playerName: string; salary: number }[] } {
  let current = { ...league, freeAgents: [...league.freeAgents] };
  const signed: { teamAbbr: string; playerName: string; salary: number }[] = [];

  for (const team of current.teams) {
    if (team.id === current.userTeamId) continue;

    let currentTeam = current.teams.find(t => t.id === team.id)!;

    // Sort FAs by true overall desc so AI always targets best player it can afford
    const sortedFAs = [...current.freeAgents].sort((a, b) => b.overall - a.overall);

    for (const fa of sortedFAs) {
      if (currentTeam.roster.length >= MAX_ROSTER_SIZE) break;
      const payroll = getTeamPayroll(currentTeam);
      if (payroll + fa.salary > CAP_LIMIT) continue; // can't afford — try cheaper next iteration

      const newRoster   = [...currentTeam.roster, { ...fa, yearsRemaining: Math.floor(Math.random() * 3) + 2 }];
      currentTeam       = { ...currentTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, false) };
      current           = {
        ...current,
        teams: current.teams.map(t => t.id === currentTeam.id ? currentTeam : t),
        freeAgents: current.freeAgents.filter(p => p.id !== fa.id),
      };
      signed.push({ teamAbbr: team.abbreviation, playerName: fa.name, salary: fa.salary });
    }
  }

  return { league: current, signed };
}

export function releasePlayer(league: League, playerId: string): { league: League; error?: string } {
  const userTeam = getUserTeam(league);
  const player   = userTeam.roster.find(p => p.id === playerId);
  if (!player) return { league, error: 'Player not found on roster.' };

  const newRoster    = userTeam.roster.filter(p => p.id !== playerId);
  const updatedTeam  = { ...userTeam, roster: newRoster, depthChart: buildDepthChart(newRoster, true) };
  const updatedTeams = league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t);

  return {
    league: {
      ...league,
      teams: updatedTeams,
      freeAgents: [...league.freeAgents, player],
    },
  };
}
