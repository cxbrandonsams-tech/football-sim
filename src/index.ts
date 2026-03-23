import { getTeamOverall } from './models/Team';
import { getUserTeam, getWeekGames } from './models/League';
import { calcStandings } from './models/Standings';
import { createInitialLeague } from './initialLeague';

const league   = createInitialLeague('l1');
const userTeam = getUserTeam(league);
const week1Games = getWeekGames(league, 1);

console.log(`League: ${league.name} — Season ${league.currentSeason.year}`);
console.log(`Your team: ${userTeam.name} (OVR: ${getTeamOverall(userTeam)})`);
console.log(`Total games: ${league.currentSeason.games.length} over ${league.currentWeek} weeks scheduled\n`);

console.log(`Week ${league.currentWeek} matchups:`);
for (const game of week1Games) {
  console.log(`  ${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}  [${game.status}]`);
}

console.log(`\nStandings (pre-season):`);
const standings = calcStandings(league.currentSeason);
console.log('  Team  W  L  T');
for (const s of standings) {
  console.log(`  ${s.team.abbreviation.padEnd(4)}  ${s.wins}  ${s.losses}  ${s.ties}`);
}
