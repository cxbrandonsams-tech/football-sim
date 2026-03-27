import { createInitialLeague } from '../src/initialLeague';

// Temporarily patch generateSchedule to count matchups
const { generateSchedule } = require('../src/engine/scheduleGenerator');

const l = createInitialLeague('test-001');
const divisions = l.divisions;
const teams = l.teams;

// Count matchups per team
const matchupCount: Record<string, number> = {};
for (const g of l.currentSeason.games) {
  matchupCount[g.homeTeam.id] = (matchupCount[g.homeTeam.id] ?? 0) + 1;
  matchupCount[g.awayTeam.id] = (matchupCount[g.awayTeam.id] ?? 0) + 1;
}

console.log('Games per team:');
const counts = Object.values(matchupCount);
console.log('  min:', Math.min(...counts), 'max:', Math.max(...counts));

// Find the 2 teams that end up with NO game in some week
// Check week 1 specifically
const week1games = l.currentSeason.games.filter(g => g.week === 1);
const week1teams = new Set<string>();
for (const g of week1games) { week1teams.add(g.homeTeam.id); week1teams.add(g.awayTeam.id); }
console.log('Week 1 teams busy:', week1teams.size, '(expected 32)');

// Find free teams in week 1
const freeInWeek1 = teams.filter(t => !week1teams.has(t.id));
console.log('Free teams in week 1:', freeInWeek1.map(t => t.abbreviation).join(', '));

// Check if free teams have a matchup with each other
if (freeInWeek1.length === 2) {
  const [a, b] = freeInWeek1;
  const mutual = l.currentSeason.games.find(g =>
    (g.homeTeam.id === a!.id && g.awayTeam.id === b!.id) ||
    (g.homeTeam.id === b!.id && g.awayTeam.id === a!.id)
  );
  console.log('Mutual matchup between free teams:', mutual ? `week ${mutual.week}` : 'NONE');
  
  // Print their bye weeks
  const aWeeks = l.currentSeason.games.filter(g => g.homeTeam.id === a!.id || g.awayTeam.id === a!.id).map(g => g.week).sort((x,y) => x-y);
  const bWeeks = l.currentSeason.games.filter(g => g.homeTeam.id === b!.id || g.awayTeam.id === b!.id).map(g => g.week).sort((x,y) => x-y);
  console.log(a!.abbreviation, 'weeks:', aWeeks.join(','));
  console.log(b!.abbreviation, 'weeks:', bWeeks.join(','));
}
