import { createInitialLeague } from '../src/initialLeague';
import { generateSchedule } from '../src/engine/scheduleGenerator';

const l = createInitialLeague('test-001');
const games = l.currentSeason.games;

// Count matchups per team
const teamGames: Record<string, number[]> = {};
for (const g of games) {
  const h = g.homeTeam.id, a = g.awayTeam.id;
  (teamGames[h] = teamGames[h] ?? []).push(g.week);
  (teamGames[a] = teamGames[a] ?? []).push(g.week);
}

// Find teams with games in week 19
const week19games = games.filter(g => g.week === 19);
console.log('Week 19 games:', week19games.length);

// Get bye weeks
const byeWeeks: Record<string, number> = {};
for (const team of l.teams) {
  const weeks = new Set(teamGames[team.id]?.map(w => w) ?? []);
  for (let w = 1; w <= 18; w++) {
    if (!weeks.has(w)) { byeWeeks[team.id] = w; break; }
  }
}

// For a week-19 game, show both teams' schedules
const g19 = week19games[0];
if (g19) {
  const h = g19.homeTeam.id, a = g19.awayTeam.id;
  console.log('Example overflow game:', g19.homeTeam.abbreviation, 'vs', g19.awayTeam.abbreviation);
  console.log('Home team weeks:', teamGames[h]?.sort((x,y) => x-y).join(','));
  console.log('Away team weeks:', teamGames[a]?.sort((x,y) => x-y).join(','));
  console.log('Home bye:', byeWeeks[h], 'Away bye:', byeWeeks[a]);
}

// Count teams per bye week
const byeCount: Record<number, number> = {};
for (const w of Object.values(byeWeeks)) byeCount[w] = (byeCount[w] ?? 0) + 1;
console.log('\nBye distribution:', JSON.stringify(byeCount));
console.log('Teams:', l.teams.length);
