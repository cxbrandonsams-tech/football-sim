import { type Team } from '../models/Team';
import { type League, type BudgetAllocation } from '../models/League';

function rosterAvgOverall(team: Team): number {
  if (team.roster.length === 0) return 0;
  return Math.round(team.roster.reduce((sum, p) => sum + p.overall, 0) / team.roster.length);
}

// Low overall → scout for new talent (2/3 scouting)
// High overall → develop existing players (1/3 scouting)
export function computeAiBudgetAllocation(team: Team, ownerBudget: number): BudgetAllocation {
  const avg     = rosterAvgOverall(team);
  const scouting = avg < 65
    ? Math.round(ownerBudget * 2 / 3)   // rebuilding: 20/10
    : Math.round(ownerBudget / 3);       // contending: 10/20
  return { scouting, development: ownerBudget - scouting };
}

// Compute and store allocations for all AI teams.
export function aiSetBudgetAllocations(league: League): League {
  const allocations: Record<string, BudgetAllocation> = {};
  for (const team of league.teams) {
    if (team.id === league.userTeamId) continue;
    allocations[team.id] = computeAiBudgetAllocation(team, league.ownerBudget);
  }
  return { ...league, aiBudgetAllocations: allocations };
}
