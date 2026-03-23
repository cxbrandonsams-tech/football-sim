import { type Player } from './Player';
import { type DepthChart, buildDepthChart, getStarters } from './DepthChart';

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  ownerId?: string;
  roster: Player[];
  depthChart: DepthChart;
}

export function createTeam(id: string, name: string, abbreviation: string, roster: Player[]): Team {
  return { id, name, abbreviation, roster, depthChart: buildDepthChart(roster) };
}

export function getTeamOverall(team: Team): number {
  const players = getStarters(team.depthChart);
  if (players.length === 0) {
    if (team.roster.length === 0) return 0;
    return Math.round(team.roster.reduce((sum, p) => sum + p.overall, 0) / team.roster.length);
  }
  return Math.round(players.reduce((sum, p) => sum + p.scoutedOverall, 0) / players.length);
}
