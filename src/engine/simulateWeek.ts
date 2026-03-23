import { type Player } from '../models/Player';
import { type Team } from '../models/Team';
import { type League } from '../models/League';
import { buildDepthChart } from '../models/DepthChart';
import { simulateGame, type GameInjury } from './simulateGame';
import { buildSeasonStats } from './seasonStats';
import { newsForGame, addNewsItems } from './news';

function recoverInjuries(team: Team, isUserTeam: boolean): Team {
  const newRoster = team.roster.map((p: Player) =>
    p.injuryWeeksRemaining > 0
      ? { ...p, injuryWeeksRemaining: p.injuryWeeksRemaining - 1 }
      : p
  );
  if (newRoster.every((p, i) => p.injuryWeeksRemaining === team.roster[i]!.injuryWeeksRemaining)) {
    return team;
  }
  return { ...team, roster: newRoster, depthChart: buildDepthChart(newRoster, isUserTeam) };
}

export function simulateWeek(league: League): League {
  // 1. Recover existing multi-game injuries
  let teams = league.teams.map(t => recoverInjuries(t, t.id === league.userTeamId));

  // 2. Simulate games, collecting in-game injuries
  const teamMap      = new Map(teams.map(t => [t.id, t]));
  const allInjuries: GameInjury[] = [];
  const updatedGames = league.currentSeason.games.map(g => {
    if (g.week !== league.currentWeek || g.status !== 'scheduled') return g;
    const result = simulateGame({
      ...g,
      homeTeam: teamMap.get(g.homeTeam.id) ?? g.homeTeam,
      awayTeam: teamMap.get(g.awayTeam.id) ?? g.awayTeam,
    });
    allInjuries.push(...result.injuries);
    return result.game;
  });

  // 3. Apply in-game injuries to team rosters
  for (const inj of allInjuries) {
    teams = teams.map(t => {
      if (t.id !== inj.teamId) return t;
      const roster = t.roster.map(p =>
        p.id === inj.playerId ? { ...p, injuryWeeksRemaining: inj.weeks } : p
      );
      if (roster === t.roster) return t;
      return { ...t, roster, depthChart: buildDepthChart(roster, t.id === league.userTeamId) };
    });
  }

  const updatedSeason = { ...league.currentSeason, games: updatedGames };
  const currentSeasonStats = buildSeasonStats(updatedSeason, teams);

  // Generate news for games played this week
  const year      = league.currentSeason.year;
  const newsItems = updatedGames
    .filter(g => g.week === league.currentWeek && g.status === 'final')
    .map(g => newsForGame(g, year));

  const base: League = {
    ...league,
    teams,
    currentSeason:      updatedSeason,
    currentSeasonStats,
    currentWeek:        league.currentWeek + 1,
  };
  return addNewsItems(base, newsItems);
}
