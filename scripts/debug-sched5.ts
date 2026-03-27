import { createInitialLeague } from '../src/initialLeague';

const l = createInitialLeague('test-001');
const games = l.currentSeason.games;

// Check for duplicate team appearances in each week
for (let w = 1; w <= 19; w++) {
  const weekGames = games.filter(g => g.week === w);
  const teamCounts: Record<string, number> = {};
  for (const g of weekGames) {
    teamCounts[g.homeTeam.id] = (teamCounts[g.homeTeam.id] ?? 0) + 1;
    teamCounts[g.awayTeam.id] = (teamCounts[g.awayTeam.id] ?? 0) + 1;
  }
  const dups = Object.entries(teamCounts).filter(([,c]) => c > 1);
  if (dups.length > 0 || weekGames.length > 16) {
    console.log(`Week ${w}: ${weekGames.length} games, dups: ${dups.map(([id,c]) => `${id}x${c}`).join(', ')}`);
  } else if (weekGames.length > 0) {
    console.log(`Week ${w}: ${weekGames.length} games ✓`);
  }
}
