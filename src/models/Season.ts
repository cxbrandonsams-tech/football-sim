import { type Team } from './Team';
import { type Game, createGame } from './Game';

export interface Season {
  year: number;
  teams: Team[];
  games: Game[];
  currentWeek: number;
}

function generateSchedule(teams: Team[], year: number): Game[] {
  const games: Game[] = [];
  let gameNum = 0;

  // Standard round-robin rotation: fix first team, rotate the rest
  // Produces N-1 weeks where each team plays exactly once per week
  const slots = [...teams];
  const fixed = slots[0]!;
  const rotating = slots.slice(1);
  const numWeeks = rotating.length;

  for (let week = 1; week <= numWeeks; week++) {
    const weekTeams = [fixed, ...rotating];
    const half = weekTeams.length / 2;

    for (let i = 0; i < half; i++) {
      const home = weekTeams[i]!;
      const away = weekTeams[weekTeams.length - 1 - i]!;
      games.push(createGame(`${year}-g${++gameNum}`, week, home, away));
    }

    // Rotate: move last element to front of rotating array
    rotating.unshift(rotating.pop()!);
  }

  return games;
}

export function createSeason(year: number, teams: Team[]): Season {
  return {
    year,
    teams,
    games: generateSchedule(teams, year),
    currentWeek: 1,
  };
}
