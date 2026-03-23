import { createPlayer } from './models/Player';
import { createTeam } from './models/Team';
import { createLeague, type LeagueOptions } from './models/League';

const teams = [
  createTeam('t1', 'River City Rams', 'RCR', [
    createPlayer('p1',  'Alex Rivers',  'QB',  26, { skill: 78, athleticism: 65, iq: 91 }, { scoutingLevel: 80 }),
    createPlayer('p2',  'Marcus Webb',  'RB',  23, { skill: 72, athleticism: 88, iq: 60 }, { scoutingLevel: 80 }),
    createPlayer('p3',  'Deon Carter',  'WR',  24, { skill: 80, athleticism: 85, iq: 60 }, { scoutingLevel: 80 }),
    createPlayer('p4',  'Jake Simmons', 'MLB', 28, { skill: 68, athleticism: 72, iq: 85 }, { scoutingLevel: 80 }),
    createPlayer('p5',  'Luis Ortega',  'K',   30, { skill: 88, athleticism: 55, iq: 60 }, { scoutingLevel: 80 }),
  ]),
  createTeam('t2', 'Steel City Wolves', 'SCW', [
    createPlayer('p6',  'Brian Cole',   'QB',  29, { skill: 82, athleticism: 70, iq: 85 }),
    createPlayer('p7',  'Tre Daniels',  'RB',  22, { skill: 65, athleticism: 92, iq: 55 }),
    createPlayer('p8',  'Sam Pruitt',   'WR',  25, { skill: 75, athleticism: 80, iq: 65 }),
    createPlayer('p9',  'Ray Ford',     'MLB', 30, { skill: 74, athleticism: 68, iq: 88 }),
    createPlayer('p10', 'Carlos Vega',  'K',   27, { skill: 80, athleticism: 60, iq: 65 }),
  ]),
  createTeam('t3', 'Bay Area Hawks', 'BAH', [
    createPlayer('p11', 'Devon Price',  'QB',  31, { skill: 85, athleticism: 60, iq: 88 }),
    createPlayer('p12', 'Kenji Moss',   'RB',  24, { skill: 70, athleticism: 85, iq: 65 }),
    createPlayer('p13', 'Tyrell Shaw',  'WR',  22, { skill: 74, athleticism: 90, iq: 55 }),
    createPlayer('p14', 'Omar Reyes',   'MLB', 27, { skill: 72, athleticism: 74, iq: 80 }),
    createPlayer('p15', 'Jin Park',     'K',   29, { skill: 83, athleticism: 58, iq: 70 }),
  ]),
  createTeam('t4', 'Desert Kings', 'DSK', [
    createPlayer('p16', 'Matt Flynn',   'QB',  27, { skill: 74, athleticism: 72, iq: 80 }),
    createPlayer('p17', 'Leon Grant',   'RB',  25, { skill: 68, athleticism: 80, iq: 68 }),
    createPlayer('p18', 'Andre Willis', 'WR',  23, { skill: 78, athleticism: 75, iq: 62 }),
    createPlayer('p19', 'Chris Tatum',  'MLB', 26, { skill: 65, athleticism: 78, iq: 75 }),
    createPlayer('p20', 'Ben Ruiz',     'K',   28, { skill: 76, athleticism: 62, iq: 68 }),
  ]),
];

const freeAgents = [
  createPlayer('fa1',  'Jay Monroe',    'QB',  25, { skill: 65, athleticism: 68, iq: 72 }, { scoutingLevel: 25 }),
  createPlayer('fa2',  'Darius Hunt',   'QB',  30, { skill: 70, athleticism: 60, iq: 80 }, { scoutingLevel: 25 }),
  createPlayer('fa3',  'Calvin Osei',   'RB',  22, { skill: 60, athleticism: 85, iq: 55 }, { scoutingLevel: 25 }),
  createPlayer('fa4',  'Pete Navarro',  'RB',  28, { skill: 68, athleticism: 70, iq: 72 }, { scoutingLevel: 25 }),
  createPlayer('fa5',  'Randy Stokes',  'WR',  24, { skill: 72, athleticism: 78, iq: 58 }, { scoutingLevel: 25 }),
  createPlayer('fa6',  'Eli Cross',     'WR',  26, { skill: 66, athleticism: 80, iq: 62 }, { scoutingLevel: 25 }),
  createPlayer('fa7',  'Mark Dalton',   'TE',  27, { skill: 70, athleticism: 72, iq: 68 }, { scoutingLevel: 25 }),
  createPlayer('fa8',  'Victor Stone',  'OT',  24, { skill: 64, athleticism: 75, iq: 65 }, { scoutingLevel: 25 }),
  createPlayer('fa9',  'Amir Khalil',   'DE',  23, { skill: 62, athleticism: 82, iq: 58 }, { scoutingLevel: 25 }),
  createPlayer('fa10', 'Rod Jenkins',   'CB',  25, { skill: 68, athleticism: 78, iq: 62 }, { scoutingLevel: 25 }),
  createPlayer('fa11', 'Sam Wheeler',   'FS',  29, { skill: 65, athleticism: 68, iq: 78 }, { scoutingLevel: 25 }),
  createPlayer('fa12', 'Tony Marsh',    'MLB', 26, { skill: 66, athleticism: 72, iq: 74 }, { scoutingLevel: 25 }),
];

export function createInitialLeague(id: string, options: LeagueOptions = {}) {
  const league = createLeague(id, 'Gridiron League', teams, 't1', 2025, options);
  return { ...league, freeAgents };
}
