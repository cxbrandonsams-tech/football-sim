import { type Team } from './Team';
import { type PlayEvent } from './PlayEvent';
import { type GameBoxScore } from '../engine/gameStats';

export type GameStatus = 'scheduled' | 'in_progress' | 'final';

export interface Game {
  id:        string;
  week:      number;
  homeTeam:  Team;
  awayTeam:  Team;
  homeScore: number;
  awayScore: number;
  status:    GameStatus;
  /** Play-by-play log. Present during simulation; stripped from the stored
   *  league blob once a game is final. Fetch on demand via GET /league/:id/game/:gameId/events. */
  events?:   PlayEvent[];
  /** Structured box score — populated once status === 'final'. */
  boxScore?: GameBoxScore;
}

export function createGame(id: string, week: number, homeTeam: Team, awayTeam: Team): Game {
  return {
    id, week, homeTeam, awayTeam,
    homeScore: 0, awayScore: 0,
    status: 'scheduled',
  };
}
