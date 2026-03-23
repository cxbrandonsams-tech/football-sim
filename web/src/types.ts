export interface Ratings {
  skill: number;
  athleticism: number;
  iq: number;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  age: number;
  trait?: string;
  scoutedOverall: number;
  scoutedRatings: Ratings;
  salary: number;
  yearsRemaining: number;
  injuryWeeksRemaining: number;
  scoutingLevel: number;
  contractDemand?: { salary: number; years: number };
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  ownerId?: string;
  roster: Player[];
}

export type PlayType =
  | 'inside_run' | 'outside_run'
  | 'short_pass' | 'medium_pass' | 'deep_pass'
  | 'sack' | 'interception' | 'fumble'
  | 'field_goal' | 'punt';

export type PlayResult =
  | 'success' | 'fail' | 'touchdown' | 'turnover'
  | 'field_goal_good' | 'field_goal_miss';

export interface PlayEvent {
  type: PlayType;
  offenseTeamId: string;
  defenseTeamId: string;
  result: PlayResult;
  yards: number;
  quarter: number;
  down: number;
  distance: number;
  yardLine: number;
  firstDown?: boolean;
  ballCarrier?: string;
  target?: string;
}

export interface Game {
  id: string;
  week: number;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  status: 'scheduled' | 'in_progress' | 'final';
  events: PlayEvent[];
}

export interface Season {
  year: number;
  games: Game[];
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
  scoutingBudget: number;
  developmentBudget: number;
  ownerBudget: number;
}

export interface Standing {
  team: Team;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
}

export function computeStandings(league: League): Standing[] {
  const map = new Map<string, Standing>();
  for (const team of league.teams) {
    map.set(team.id, { team, w: 0, l: 0, t: 0, pf: 0, pa: 0 });
  }
  for (const game of league.currentSeason.games) {
    if (game.status !== 'final') continue;
    const home = map.get(game.homeTeam.id)!;
    const away = map.get(game.awayTeam.id)!;
    home.pf += game.homeScore; home.pa += game.awayScore;
    away.pf += game.awayScore; away.pa += game.homeScore;
    if (game.homeScore > game.awayScore)      { home.w++; away.l++; }
    else if (game.awayScore > game.homeScore) { away.w++; home.l++; }
    else                                       { home.t++; away.t++; }
  }
  return [...map.values()].sort(
    (a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa)
  );
}
