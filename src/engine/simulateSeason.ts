import { type Season } from '../models/Season';
import { simulateGame } from './simulateGame';

export function simulateSeason(season: Season): Season {
  const games = season.games.map(game =>
    game.status === 'scheduled' ? simulateGame(game).game : game
  );
  return { ...season, games, currentWeek: season.games.length > 0
    ? Math.max(...games.map(g => g.week))
    : season.currentWeek
  };
}
