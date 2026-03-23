import { type Team }                             from './Team';
import { type Game, createGame }                 from './Game';
import { type PlayerSeasonStats }                from './History';
import { type Division }                         from './League';
import { generateSchedule, type ScheduleParams } from '../engine/scheduleGenerator';

export interface Season {
  year:        number;
  teams:       Team[];
  games:       Game[];
  currentWeek: number;
  /**
   * Accumulated player season stats — refreshed after each week's games complete.
   * Keyed by player.id. Undefined until the first game is played.
   */
  statsCache?: Record<string, PlayerSeasonStats>;
}

export function createSeason(
  year:          number,
  teams:         Team[],
  divisions:     Division[]  = [],
  prevDivFinish: Record<string, number> = {},
): Season {
  const params: ScheduleParams = { year, teams, divisions, prevDivFinish };
  const games = divisions.length > 0
    ? generateSchedule(params)
    : generateRoundRobin(teams, year); // fallback for tests / ≤8 teams

  return { year, teams, games, currentWeek: 1 };
}

// ── Round-robin fallback (used when no division structure is provided) ─────────

function generateRoundRobin(teams: Team[], year: number): Game[] {
  const games: Game[] = [];
  let gameNum = 0;
  const slots    = [...teams];
  const fixed    = slots[0]!;
  const rotating = slots.slice(1);
  const numWeeks = rotating.length;

  for (let week = 1; week <= numWeeks; week++) {
    const weekTeams = [fixed, ...rotating];
    const half      = weekTeams.length / 2;
    for (let i = 0; i < half; i++) {
      const home = weekTeams[i]!;
      const away = weekTeams[weekTeams.length - 1 - i]!;
      games.push(createGame(`${year}-g${++gameNum}`, week, home, away));
    }
    rotating.unshift(rotating.pop()!);
  }
  return games;
}
