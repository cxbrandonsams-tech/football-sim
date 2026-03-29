const { createInitialLeague } = require('../dist/initialLeague');
const { simulateWeek } = require('../dist/engine/simulateWeek');
const { buildBoxScoreFromGame } = require('../dist/engine/gameStats');

console.log('Running 1000+ game simulation (4 full seasons)...\n');

let allGames = [];
let allPlayerStats = {};

for (let season = 0; season < 4; season++) {
  let league = createInitialLeague('sim'+season, { displayName: 'Sim', commissionerId: 'x' });
  for (let w = 1; w <= 18; w++) league = simulateWeek(league);
  const games = league.currentSeason.games.filter(g => g.status === 'final');
  allGames.push(...games);

  for (const g of games) {
    const bs = buildBoxScoreFromGame(g.homeTeam, g.awayTeam, g.events, g.homeScore, g.awayScore);
    if (!bs || !bs.players) continue;
    for (const [n, p] of Object.entries(bs.players)) {
      const key = season + ':' + n;
      if (!allPlayerStats[key]) allPlayerStats[key] = {s:season,pY:0,pT:0,i:0,c:0,a:0,rY:0,rT:0,ca:0,rcY:0,rcT:0,rc:0,sk:0,intC:0,tkl:0};
      const t = allPlayerStats[key];
      t.pY+=p.passingYards||0; t.pT+=p.passingTDs||0; t.i+=p.interceptions||0;
      t.c+=p.completions||0; t.a+=p.attempts||0; t.rY+=p.rushingYards||0; t.rT+=p.rushingTDs||0;
      t.ca+=p.carries||0; t.rcY+=p.receivingYards||0; t.rcT+=p.receivingTDs||0; t.rc+=p.receptions||0;
      t.sk+=p.sacks||0; t.intC+=p.interceptionsCaught||0; t.tkl+=p.tackles||0;
    }
  }
  console.log('  Season ' + (season+1) + ' complete (' + games.length + ' games)');
}

const gc = allGames.length;
console.log('\nTotal games: ' + gc + '\n');

// Aggregate stats
let totalPts=0, tds=0, fgs=0, fgMiss=0, penalties=0, spikes=0, totalPlays=0;
let passAttempts=0, passComp=0, passYds=0, passTDs=0, passINTs=0;
let rushAttempts=0, rushYds=0, rushTDs=0, sacks=0, fumbles=0;

for (const g of allGames) {
  totalPts += g.homeScore + g.awayScore;
  totalPlays += g.events.length;
  for (const ev of g.events) {
    if (ev.result === 'touchdown') tds++;
    if (ev.result === 'field_goal_good') fgs++;
    if (ev.result === 'field_goal_miss') fgMiss++;
    if (ev.penalty) penalties++;
    if (ev.type === 'spike') spikes++;
    const isPass = ['short_pass','medium_pass','deep_pass'].includes(ev.type);
    const isRun = ['inside_run','outside_run'].includes(ev.type);
    if (isPass) {
      passAttempts++;
      if (ev.result === 'success' || ev.result === 'touchdown') { passComp++; passYds += ev.yards; }
      if (ev.result === 'touchdown') passTDs++;
    }
    if (ev.type === 'interception') passINTs++;
    if (isRun) { rushAttempts++; rushYds += ev.yards; if (ev.result === 'touchdown') rushTDs++; }
    if (ev.type === 'sack') sacks++;
    if (ev.type === 'fumble') fumbles++;
  }
}

const margins = allGames.map(g => Math.abs(g.homeScore - g.awayScore));
const shutouts = allGames.filter(g => g.homeScore === 0 || g.awayScore === 0).length;
const oneScore = allGames.filter(g => Math.abs(g.homeScore - g.awayScore) <= 8).length;

// Per-season leaders
let qbYds=[], qbTD=[], qbINT=[], rbYds=[], rbCar=[], wrYds=[], wrRec=[], skLead=[], intLead=[];
for (let s = 0; s < 4; s++) {
  const sp = Object.values(allPlayerStats).filter(p => p.s === s);
  const qbs = sp.filter(p=>p.a>100).sort((a,b)=>b.pY-a.pY);
  const rbs = sp.filter(p=>p.ca>50).sort((a,b)=>b.rY-a.rY);
  const wrs = sp.filter(p=>p.rc>20).sort((a,b)=>b.rcY-a.rcY);
  const sks = sp.filter(p=>p.sk>0).sort((a,b)=>b.sk-a.sk);
  const ints = sp.filter(p=>p.intC>0).sort((a,b)=>b.intC-a.intC);
  if(qbs[0]) { qbYds.push(qbs[0].pY); qbTD.push(qbs[0].pT); qbINT.push(qbs[0].i); }
  if(rbs[0]) { rbYds.push(rbs[0].rY); rbCar.push(rbs[0].ca); }
  if(wrs[0]) { wrYds.push(wrs[0].rcY); wrRec.push(wrs[0].rc); }
  if(sks[0]) skLead.push(sks[0].sk);
  if(ints[0]) intLead.push(ints[0].intC);
}

const lavg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;

// Print results
console.log('================================================================');
console.log('  1,000-GAME SIM vs NFL 5-YEAR AVERAGE (2019-2023)');
console.log('================================================================');
console.log('');
console.log('GAME AVERAGES (both teams combined per game)');
console.log('--------------------------------------------');
console.log('                         SIM        NFL');
console.log('Points/Game:          ' + (totalPts/gc).toFixed(1).padStart(6) + '       44.7');
console.log('Plays/Game:           ' + (totalPlays/gc).toFixed(0).padStart(6) + '        125');
console.log('Margin of Victory:    ' + (margins.reduce((a,b)=>a+b,0)/margins.length).toFixed(1).padStart(6) + '       10.8');
console.log('Shutouts/Season:      ' + (shutouts/4).toFixed(1).padStart(6) + '        1.5');
console.log('One-Score Games:      ' + (oneScore/gc*100).toFixed(1).padStart(5) + '%      48.0%');
console.log('Penalties/Game:       ' + (penalties/gc).toFixed(1).padStart(6) + '       12.5');
console.log('');
console.log('PASSING (per team per game)');
console.log('--------------------------');
console.log('Completions:          ' + (passComp/gc/2).toFixed(1).padStart(6) + '       21.5');
console.log('Attempts:             ' + (passAttempts/gc/2).toFixed(1).padStart(6) + '       33.5');
console.log('Completion %:         ' + (passComp/passAttempts*100).toFixed(1).padStart(5) + '%      64.8%');
console.log('Pass Yards/Team/Game: ' + (passYds/gc/2).toFixed(0).padStart(6) + '        215');
console.log('Pass TDs/Team/Game:   ' + (passTDs/gc/2).toFixed(2).padStart(6) + '       1.22');
console.log('INTs/Team/Game:       ' + (passINTs/gc/2).toFixed(2).padStart(6) + '       0.58');
console.log('Sacks/Team/Game:      ' + (sacks/gc/2).toFixed(2).padStart(6) + '       2.40');
console.log('');
console.log('RUSHING (per team per game)');
console.log('--------------------------');
console.log('Rush Attempts:        ' + (rushAttempts/gc/2).toFixed(1).padStart(6) + '       27.0');
console.log('Rush Yards:           ' + (rushYds/gc/2).toFixed(0).padStart(6) + '        114');
console.log('Yards/Carry:          ' + (rushYds/rushAttempts).toFixed(2).padStart(6) + '       4.33');
console.log('Rush TDs/Team/Game:   ' + (rushTDs/gc/2).toFixed(2).padStart(6) + '       0.43');
console.log('');
console.log('SCORING BREAKDOWN');
console.log('-----------------');
console.log('Total TDs/Game:       ' + (tds/gc).toFixed(2).padStart(6) + '       4.85');
console.log('FGs Made/Game:        ' + (fgs/gc).toFixed(2).padStart(6) + '       3.60');
console.log('FG Attempts/Game:     ' + ((fgs+fgMiss)/gc).toFixed(2).padStart(6) + '       3.90');
console.log('FG Success %:         ' + (fgs/(fgs+fgMiss)*100).toFixed(1).padStart(5) + '%      85.0%');
console.log('');
console.log('SEASON LEADERS (average of 4 seasons)');
console.log('-------------------------------------');
console.log('                         SIM        NFL');
console.log('QB Pass Yards:        ' + String(lavg(qbYds)).padStart(6) + '      4,450');
console.log('QB Pass TDs:          ' + String(lavg(qbTD)).padStart(6) + '         33');
console.log('QB INTs (top QB):     ' + String(lavg(qbINT)).padStart(6) + '         10');
console.log('RB Rush Yards:        ' + String(lavg(rbYds)).padStart(6) + '      1,450');
console.log('RB Carries:           ' + String(lavg(rbCar)).padStart(6) + '        270');
console.log('WR Receiving Yards:   ' + String(lavg(wrYds)).padStart(6) + '      1,650');
console.log('WR Receptions:        ' + String(lavg(wrRec)).padStart(6) + '        110');
console.log('Sack Leader:          ' + String(lavg(skLead)).padStart(6) + '         16');
console.log('INT Leader (DB):      ' + String(lavg(intLead)).padStart(6) + '          7');
console.log('');
console.log('================================================================');
