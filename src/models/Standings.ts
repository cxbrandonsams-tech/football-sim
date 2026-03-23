import { type Team } from './Team';
import { type Season } from './Season';

export interface Standing {
  team: Team;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export function calcStandings(season: Season): Standing[] {
  const map = new Map<string, Standing>();

  for (const team of season.teams) {
    map.set(team.id, { team, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
  }

  for (const game of season.games) {
    if (game.status !== 'final') continue;

    const home = map.get(game.homeTeam.id)!;
    const away = map.get(game.awayTeam.id)!;

    home.pointsFor     += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor     += game.awayScore;
    away.pointsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins++;
      away.losses++;
    } else if (game.awayScore > game.homeScore) {
      away.wins++;
      home.losses++;
    } else {
      home.ties++;
      away.ties++;
    }
  }

  return [...map.values()].sort((a, b) =>
    b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
  );
}
