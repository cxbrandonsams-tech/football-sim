import { createPlayer } from './models/Player';
import { createTeam, getTeamOverall } from './models/Team';
import { createLeague, getUserTeam, getWeekGames, getCompletedGames } from './models/League';
import { calcStandings } from './models/Standings';

const rams = createTeam('t1', 'River City Rams', 'RCR', [
  createPlayer('p1', 'Alex Rivers',  'QB',  26, { skill: 78, athleticism: 65, iq: 91 }),
  createPlayer('p2', 'Marcus Webb',  'RB',  23, { skill: 72, athleticism: 88, iq: 60 }),
  createPlayer('p3', 'Deon Carter',  'WR',  24, { skill: 80, athleticism: 85, iq: 60 }),
]);

const wolves = createTeam('t2', 'Steel City Wolves', 'SCW', [
  createPlayer('p4', 'Brian Cole',   'QB',  29, { skill: 82, athleticism: 70, iq: 85 }),
  createPlayer('p5', 'Tre Daniels',  'RB',  22, { skill: 65, athleticism: 92, iq: 55 }),
  createPlayer('p6', 'Sam Pruitt',   'WR',  25, { skill: 75, athleticism: 80, iq: 65 }),
]);

const hawks = createTeam('t3', 'Bay Area Hawks', 'BAH', [
  createPlayer('p7',  'Devon Price',  'QB',  31, { skill: 85, athleticism: 60, iq: 88 }),
  createPlayer('p8',  'Kenji Moss',   'RB',  24, { skill: 70, athleticism: 85, iq: 65 }),
  createPlayer('p9',  'Tyrell Shaw',  'WR',  22, { skill: 74, athleticism: 90, iq: 55 }),
]);

const kings = createTeam('t4', 'Desert Kings', 'DSK', [
  createPlayer('p10', 'Matt Flynn',   'QB',  27, { skill: 74, athleticism: 72, iq: 80 }),
  createPlayer('p11', 'Leon Grant',   'RB',  25, { skill: 68, athleticism: 80, iq: 68 }),
  createPlayer('p12', 'Andre Willis', 'WR',  23, { skill: 78, athleticism: 75, iq: 62 }),
]);

const league = createLeague('l1', 'Gridiron League', [rams, wolves, hawks, kings], 't1', 2025);
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
