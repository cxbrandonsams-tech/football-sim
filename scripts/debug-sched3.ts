import { createInitialLeague } from '../src/initialLeague';

const l = createInitialLeague('test-001');
const teams = l.teams;
console.log('Team count:', teams.length);

// Verify bye weeks from schedule
const games = l.currentSeason.games;
const teamWeeks: Record<string, Set<number>> = {};
for (const g of games) {
  (teamWeeks[g.homeTeam.id] ??= new Set()).add(g.week);
  (teamWeeks[g.awayTeam.id] ??= new Set()).add(g.week);
}

// Show first 8 teams' bye weeks (week 6-13 expected)
for (const [i, team] of teams.slice(0, 16).entries()) {
  const weeks = [...(teamWeeks[team.id] ?? new Set())].sort((a,b)=>a-b);
  const missingIn118: number[] = [];
  for (let w = 1; w <= 18; w++) {
    if (!teamWeeks[team.id]?.has(w)) missingIn118.push(w);
  }
  console.log(`Team ${i} (${team.abbreviation}): ${weeks.length} games, missing weeks: ${missingIn118.join(',')}`);
}
