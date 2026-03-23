import { type Player } from './Player';
import { type Team } from './Team';
import { type Game } from './Game';
import { type Season, createSeason } from './Season';
import { buildDepthChart } from './DepthChart';

export const OWNER_BUDGET = 30;

export interface BudgetAllocation {
  scouting: number;
  development: number;
}

export type LeaguePhase = 'regular_season' | 'postseason' | 'offseason';

export interface PlayoffMatchup {
  id: string;
  round: 'semifinal' | 'championship';
  topSeedId: string;
  bottomSeedId: string;
  game?: Game;
  winnerId?: string;
}

export interface PlayoffBracket {
  year: number;
  currentRound: 'semifinal' | 'championship' | 'complete';
  matchups: PlayoffMatchup[];
  championId?: string;
  championName?: string;
}

export interface SeasonRecord {
  year: number;
  championId: string;
  championName: string;
}

export interface Activity {
  id: string;
  message: string;
  createdAt: number;
}

export interface LeagueNotification {
  id: string;
  teamId: string;
  message: string;
  createdAt: number;
  read: boolean;
}

export interface TradeProposal {
  id: string;
  fromTeamId: string;
  toTeamId: string;
  playerId: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface League {
  id: string;
  name: string;
  displayName: string;
  visibility: 'public' | 'private';
  advanceSchedule?: string;
  lastAdvanceTime?: number;
  phase: LeaguePhase;
  playoff?: PlayoffBracket;
  seasonHistory: SeasonRecord[];
  activities: Activity[];
  tradeProposals: TradeProposal[];
  notifications: LeagueNotification[];
  teams: Team[];
  userTeamId: string;
  currentSeason: Season;
  currentWeek: number;
  freeAgents: Player[];
  ownerBudget: number;
  budgetAllocation: BudgetAllocation;         // user team's chosen split
  aiBudgetAllocations: Record<string, BudgetAllocation>; // keyed by team id
  scoutingBudget: number;
  developmentBudget: number;
}

const DEFAULT_ALLOCATION: BudgetAllocation = { scouting: 15, development: 15 };

export interface LeagueOptions {
  displayName?: string;
  visibility?: 'public' | 'private';
  advanceSchedule?: string;
}

export function createLeague(
  id: string,
  name: string,
  teams: Team[],
  userTeamId: string,
  year: number,
  options: LeagueOptions = {},
): League {
  const preparedTeams = teams.map(t =>
    t.id === userTeamId
      ? { ...t, depthChart: buildDepthChart(t.roster, true) }
      : t
  );
  return {
    id,
    name,
    displayName: options.displayName ?? name,
    visibility: options.visibility ?? 'public',
    ...(options.advanceSchedule !== undefined && { advanceSchedule: options.advanceSchedule }),
    phase: 'regular_season',
    seasonHistory: [],
    activities: [],
    tradeProposals: [],
    notifications: [],
    teams: preparedTeams,
    userTeamId,
    currentSeason: createSeason(year, preparedTeams),
    currentWeek: 1,
    freeAgents: [],
    ownerBudget: OWNER_BUDGET,
    budgetAllocation: DEFAULT_ALLOCATION,
    aiBudgetAllocations: {},
    scoutingBudget: DEFAULT_ALLOCATION.scouting,
    developmentBudget: DEFAULT_ALLOCATION.development,
  };
}

export function getUserTeam(league: League): Team {
  const team = league.teams.find(t => t.id === league.userTeamId);
  if (!team) throw new Error(`User team ${league.userTeamId} not found in league`);
  return team;
}

export function getWeekGames(league: League, week: number): Game[] {
  return league.currentSeason.games.filter(g => g.week === week);
}

export function getCompletedGames(league: League): Game[] {
  return league.currentSeason.games.filter(g => g.status === 'final');
}
