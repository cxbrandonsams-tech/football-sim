import { createInitialLeague } from '../src/initialLeague';

const l = createInitialLeague('test-001');
const games = l.currentSeason.games;

const weekCounts: Record<number, number> = {};
const teamGameCounts: Record<string, number> = {};

for (const g of games) {
  weekCounts[g.week] = (weekCounts[g.week] ?? 0) + 1;
  teamGameCounts[g.homeTeam.id] = (teamGameCounts[g.homeTeam.id] ?? 0) + 1;
  teamGameCounts[g.awayTeam.id] = (teamGameCounts[g.awayTeam.id] ?? 0) + 1;
}

console.log('=== Week distribution ===');
for (let w = 1; w <= 20; w++) {
  if (weekCounts[w]) console.log(`Week ${w}: ${weekCounts[w]} games`);
}

const counts = Object.values(teamGameCounts);
console.log('Games per team: min', Math.min(...counts), 'max', Math.max(...counts));
console.log('Total games:', games.length, 'week-19:', weekCounts[19] ?? 0);
