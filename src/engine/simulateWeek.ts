import { type Player } from '../models/Player';
import { type Team } from '../models/Team';
import { type League } from '../models/League';
import { type DepthChartSlot, buildDepthChart } from '../models/DepthChart';
import { simulateGame } from './simulateGame';

const BASE_INJURY_CHANCE = 0.06;
const INJURY_SLOTS: DepthChartSlot[] = ['QB', 'RB', 'WR', 'OL', 'DE', 'DT', 'LB', 'CB', 'S'];

function injuryChance(player: Player): number {
  if (player.trait === 'injury_prone') return BASE_INJURY_CHANCE * 2.0;
  if (player.trait === 'durable')      return BASE_INJURY_CHANCE * 0.5;
  return BASE_INJURY_CHANCE;
}

// Apply random post-game injuries to a team's roster starters.
function applyGameInjuries(team: Team, isUserTeam: boolean): Team {
  let roster = team.roster;

  for (const slot of INJURY_SLOTS) {
    const starter = team.depthChart[slot][0];
    if (!starter || starter.injuryWeeksRemaining > 0) continue; // slot empty or already injured
    if (Math.random() >= injuryChance(starter)) continue;

    const weeks = Math.floor(Math.random() * 4) + 1; // 1–4 weeks
    roster = roster.map(p => p.id === starter.id ? { ...p, injuryWeeksRemaining: weeks } : p);
  }

  if (roster === team.roster) return team; // nothing changed
  return { ...team, roster, depthChart: buildDepthChart(roster, isUserTeam) };
}

// Decrement all injuries by 1 at the start of each week (weekly recovery).
function recoverInjuries(team: Team, isUserTeam: boolean): Team {
  const newRoster = team.roster.map(p =>
    p.injuryWeeksRemaining > 0
      ? { ...p, injuryWeeksRemaining: p.injuryWeeksRemaining - 1 }
      : p
  );
  // Only rebuild if something actually changed
  if (newRoster.every((p, i) => p.injuryWeeksRemaining === team.roster[i]!.injuryWeeksRemaining)) {
    return team;
  }
  return { ...team, roster: newRoster, depthChart: buildDepthChart(newRoster, isUserTeam) };
}

export function simulateWeek(league: League): League {
  // 1. Recover existing injuries (decrement by 1)
  let teams = league.teams.map(t => recoverInjuries(t, t.id === league.userTeamId));

  // 2. Simulate games using recovered rosters
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const updatedGames = league.currentSeason.games.map(g => {
    if (g.week !== league.currentWeek || g.status !== 'scheduled') return g;
    return simulateGame({
      ...g,
      homeTeam: teamMap.get(g.homeTeam.id) ?? g.homeTeam,
      awayTeam: teamMap.get(g.awayTeam.id) ?? g.awayTeam,
    });
  });

  // 3. Apply new injuries from games played this week
  const playedThisWeek = updatedGames.filter(g => g.week === league.currentWeek && g.status === 'final');
  for (const game of playedThisWeek) {
    teams = teams.map(t => {
      if (t.id === game.homeTeam.id || t.id === game.awayTeam.id) {
        return applyGameInjuries(t, t.id === league.userTeamId);
      }
      return t;
    });
  }

  return {
    ...league,
    teams,
    currentSeason: { ...league.currentSeason, games: updatedGames },
    currentWeek: league.currentWeek + 1,
  };
}
