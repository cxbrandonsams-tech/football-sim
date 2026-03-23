import { type Player } from './Player';
import { type Coach, type CoachingStaff } from './Coach';
import { type DepthChart, buildDepthChart, getStarters } from './DepthChart';
import { type PlaycallingWeights, DEFAULT_PLAYCALLING } from './Playcalling';

export interface Team {
  id:           string;
  name:         string;
  abbreviation: string;
  ownerId?:     string;
  roster:       Player[];
  depthChart:   DepthChart;
  coaches:      CoachingStaff;
  /** Offensive playcalling weights — user-controlled for user's team, default for AI. */
  playcalling:  PlaycallingWeights;
  /** Conference this team belongs to (e.g. 'IC', 'SC') */
  conference?:  string;
  /** Division within the conference (e.g. 'East', 'West', 'North', 'South') */
  division?:    string;
}

export function createTeam(
  id:           string,
  name:         string,
  abbreviation: string,
  roster:       Player[],
  coaches:      CoachingStaff,
  opts: { conference?: string; division?: string; playcalling?: PlaycallingWeights } = {},
): Team {
  return {
    id,
    name,
    abbreviation,
    roster,
    depthChart: buildDepthChart(roster),
    coaches,
    playcalling: opts.playcalling ?? DEFAULT_PLAYCALLING,
    ...(opts.conference !== undefined && { conference: opts.conference }),
    ...(opts.division   !== undefined && { division:   opts.division   }),
  };
}

export function getTeamOverall(team: Team): number {
  const players = getStarters(team.depthChart);
  if (players.length === 0) {
    if (team.roster.length === 0) return 0;
    return Math.round(team.roster.reduce((sum, p) => sum + p.overall, 0) / team.roster.length);
  }
  return Math.round(players.reduce((sum, p) => sum + p.scoutedOverall, 0) / players.length);
}

/** Convenience: find a coach on any team by id. */
export function findCoach(team: Team, coachId: string): Coach | undefined {
  const { hc, oc, dc } = team.coaches;
  return [hc, oc, dc].find(c => c.id === coachId);
}
