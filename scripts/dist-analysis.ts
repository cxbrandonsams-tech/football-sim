import { createInitialLeague } from '../src/initialLeague';
import { simulateGame }        from '../src/engine/simulateGame';
import { createGame }          from '../src/models/Game';
import { type PlayEvent }      from '../src/models/PlayEvent';

const league = createInitialLeague('dist-test');
const teams  = league.teams;

// Build playerId → slot lookup from all team depth charts
const posByPlayer: Record<string, { position: string; slot: string }> = {};
for (const team of teams) {
  const dc = team.depthChart as Record<string, ({ id: string } | null)[]>;
  const slotMap: [string, string[]][] = [
    ['WR', ['WR1','WR2','WR3']],
    ['TE', ['TE1','TE2']],
    ['RB', ['RB1','RB2']],
  ];
  for (const [pos, names] of slotMap) {
    (dc[pos] ?? []).forEach((p, i) => {
      if (p && names[i]) posByPlayer[p.id] = { position: pos, slot: names[i]! };
    });
  }
}

const slotTargets: Record<string, number> = { WR1:0, WR2:0, WR3:0, TE1:0, TE2:0, RB1:0, RB2:0 };
const teYards: Record<string, number> = {};
const wrYards: Record<string, number> = {};
let games = 0;

const T = teams.length;
for (let i = 0; i < T && games < 500; i++) {
  for (let j = i + 1; j < T && games < 500; j++) {
    const homeTeam = teams[i]!;
    const awayTeam = teams[j]!;
    const game   = createGame(`g${games}`, 1, homeTeam, awayTeam);
    const result = simulateGame(game);
    const events: PlayEvent[] = result.game.events ?? [];

    for (const ev of events) {
      if (!['short_pass','medium_pass','deep_pass'].includes(ev.type)) continue;
      if (!ev.targetId) continue;
      const info = posByPlayer[ev.targetId];
      if (!info) continue;
      if (slotTargets[info.slot] !== undefined) slotTargets[info.slot]!++;
      const yards = ev.yards ?? 0;
      const scored = ev.result !== 'fail' && ev.result !== 'turnover';
      if (scored) {
        if (info.position === 'TE') teYards[ev.targetId] = (teYards[ev.targetId] ?? 0) + yards;
        if (info.position === 'WR') wrYards[ev.targetId] = (wrYards[ev.targetId] ?? 0) + yards;
      }
    }
    games++;
  }
}

const total = Object.values(slotTargets).reduce((s, v) => s + v, 0);
// Each team appears in (games * 2 / T) games on average in the round-robin
const gamesPerPlayer = games * 2 / T;

console.log(`\n=== TARGET SHARE BY SLOT (${games} games) ===`);
const ordered = ['WR1','WR2','WR3','TE1','TE2','RB1','RB2'];
for (const slot of ordered) {
  const n   = slotTargets[slot] ?? 0;
  const pct = (n / total * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(n / total * 40));
  console.log(`  ${slot.padEnd(4)} ${pct.padStart(5)}%  ${bar}  (${n})`);
}

console.log(`\n=== TOP 10 WR SEASON PROJECTION (× 17 / ${gamesPerPlayer.toFixed(1)} games each) ===`);
Object.entries(wrYards)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([id, y]) => {
    const season = Math.round(y / gamesPerPlayer * 17);
    const pg     = (y / gamesPerPlayer).toFixed(1);
    console.log(`  ${id.slice(-8).padEnd(10)}  ${season.toString().padStart(5)} yds/season  (${pg}/game)`);
  });

console.log(`\n=== TOP 10 TE SEASON PROJECTION (× 17 / ${gamesPerPlayer.toFixed(1)} games each) ===`);
const teSorted = Object.entries(teYards).sort((a, b) => b[1] - a[1]).slice(0, 10);
if (teSorted.length === 0) {
  console.log('  (no TE receiving yards tracked — may need targetId on TE plays)');
} else {
  teSorted.forEach(([id, y]) => {
    const season = Math.round(y / gamesPerPlayer * 17);
    const pg     = (y / gamesPerPlayer).toFixed(1);
    console.log(`  ${id.slice(-8).padEnd(10)}  ${season.toString().padStart(5)} yds/season  (${pg}/game)`);
  });
}
