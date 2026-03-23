import { type Ratings } from '../models/Player';
import { type Team } from '../models/Team';
import { type Game } from '../models/Game';
import { type DepthChartSlot } from '../models/DepthChart';
import { type PlayEvent, type PlayType, type PlayResult } from '../models/PlayEvent';

// ── Rating helpers ────────────────────────────────────────────────────────────

// Returns the first healthy (non-injured) player in a depth chart slot.
function firstHealthy(team: Team, slot: DepthChartSlot) {
  return team.depthChart[slot].find(p => p !== null && p.injuryWeeksRemaining === 0);
}

function r(team: Team, slot: DepthChartSlot, stat: keyof Ratings): number {
  return firstHealthy(team, slot)?.trueRatings[stat] ?? 50;
}

function avg(...vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function lastName(team: Team, slot: DepthChartSlot): string {
  const name = firstHealthy(team, slot)?.name ?? '';
  const parts = name.split(' ');
  return parts[parts.length - 1] ?? name;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ── Play selection ────────────────────────────────────────────────────────────

function selectPlayType(down: number, distance: number): PlayType {
  const roll = Math.random();
  if (distance <= 3) {
    if (roll < 0.55) return 'inside_run';
    if (roll < 0.75) return 'outside_run';
    return 'short_pass';
  }
  if (distance <= 7) {
    if (roll < 0.20) return 'inside_run';
    if (roll < 0.38) return 'outside_run';
    if (roll < 0.58) return 'short_pass';
    if (roll < 0.82) return 'medium_pass';
    return 'deep_pass';
  }
  if (roll < 0.10) return 'inside_run';
  if (roll < 0.20) return 'outside_run';
  if (roll < 0.40) return 'short_pass';
  if (roll < 0.68) return 'medium_pass';
  return 'deep_pass';
}

// ── Matchup ratings ───────────────────────────────────────────────────────────

function offRating(off: Team, type: PlayType): number {
  switch (type) {
    case 'inside_run':  return avg(r(off,'OL','skill'), r(off,'RB','athleticism'), r(off,'RB','skill'));
    case 'outside_run': return avg(r(off,'RB','athleticism'), r(off,'WR','athleticism'), r(off,'OL','skill'));
    case 'short_pass':  return avg(r(off,'QB','skill'), r(off,'QB','iq'), r(off,'WR','skill'));
    case 'medium_pass': return avg(r(off,'QB','skill'), r(off,'QB','iq'), r(off,'WR','skill'), r(off,'WR','iq'));
    case 'deep_pass':   return avg(r(off,'QB','skill'), r(off,'QB','athleticism'), r(off,'WR','athleticism'));
    default:            return 60;
  }
}

function defRating(def: Team, type: PlayType): number {
  switch (type) {
    case 'inside_run':  return avg(r(def,'DT','athleticism'), r(def,'DT','skill'), r(def,'LB','skill'));
    case 'outside_run': return avg(r(def,'DE','athleticism'), r(def,'LB','athleticism'), r(def,'CB','athleticism'));
    case 'short_pass':  return avg(r(def,'CB','skill'), r(def,'LB','iq'));
    case 'medium_pass': return avg(r(def,'CB','skill'), r(def,'CB','iq'), r(def,'S','iq'));
    case 'deep_pass':   return avg(r(def,'CB','athleticism'), r(def,'S','athleticism'));
    default:            return 60;
  }
}

// ── Yards ─────────────────────────────────────────────────────────────────────

function yardsOnSuccess(type: PlayType, offAth: number): number {
  let base: number;
  switch (type) {
    case 'inside_run':  base = randInt(1, 8);   break;
    case 'outside_run': base = randInt(2, 12);  break;
    case 'short_pass':  base = randInt(3, 9);   break;
    case 'medium_pass': base = randInt(8, 20);  break;
    case 'deep_pass':   base = randInt(15, 45); break;
    default:            base = 5;
  }
  if (offAth > 82 && Math.random() < 0.15) base += randInt(5, 12); // big play burst
  return base;
}

function yardsOnFail(type: PlayType): number {
  if (type === 'inside_run' || type === 'outside_run') return randInt(-2, 1);
  return 0; // incomplete pass
}

// ── Single play ───────────────────────────────────────────────────────────────

function simulatePlay(
  off: Team, def: Team, type: PlayType,
  quarter: number, down: number, distance: number, yardLine: number,
): PlayEvent {
  const base = { type, offenseTeamId: off.id, defenseTeamId: def.id, quarter, down, distance, yardLine };

  // Punt
  if (type === 'punt') {
    return { ...base, result: 'success' as PlayResult, yards: 0 };
  }

  // Field goal
  if (type === 'field_goal') {
    const fgDist = (100 - yardLine) + 17;
    const kSkill = r(off, 'K', 'skill');
    const chance = Math.max(0.30, 0.95 - (fgDist - 20) * 0.015 + (kSkill - 70) * 0.004);
    const made = Math.random() < chance;
    return { ...base, result: made ? 'field_goal_good' : 'field_goal_miss', yards: 0, ballCarrier: lastName(off, 'K') };
  }

  const isPass = type === 'short_pass' || type === 'medium_pass' || type === 'deep_pass';
  const isRun  = type === 'inside_run' || type === 'outside_run';

  // Sack check (before pass)
  if (isPass) {
    const sackChance = Math.max(0.03, Math.min(0.18, 0.06 + (r(def,'DE','athleticism') - r(off,'OL','skill')) * 0.002));
    if (Math.random() < sackChance) {
      return { ...base, type: 'sack', result: 'fail', yards: randInt(-8, -2), ballCarrier: lastName(off, 'QB') };
    }
  }

  // Fumble check (before run)
  if (isRun && Math.random() < 0.012) {
    return { ...base, type: 'fumble', result: 'turnover', yards: 0, ballCarrier: lastName(off, 'RB') };
  }

  // Success/fail
  const oRating = offRating(off, type);
  const dRating = defRating(def, type);
  const successChance = oRating / (oRating + dRating);
  const success = Math.random() < successChance;

  // Interception on failed pass
  if (isPass && !success) {
    const intChance = Math.max(0.02, Math.min(0.12, 0.05 + (r(def,'CB','iq') - r(off,'QB','iq')) * 0.001));
    if (Math.random() < intChance) {
      return { ...base, type: 'interception', result: 'turnover', yards: 0, ballCarrier: lastName(off, 'QB'), target: lastName(off, 'WR') };
    }
  }

  const offAth = isRun ? r(off,'RB','athleticism') : r(off,'WR','athleticism');
  const yards  = success ? yardsOnSuccess(type, offAth) : yardsOnFail(type);
  const newYardLine = yardLine + yards;
  const isTD = newYardLine >= 100;

  const result: PlayResult = isTD ? 'touchdown' : success ? 'success' : 'fail';
  const firstDown = !isTD && success && yards >= distance;

  return {
    ...base,
    result,
    yards: isTD ? 100 - yardLine : yards,
    ...(firstDown ? { firstDown: true as const } : {}),
    ballCarrier: isRun ? lastName(off, 'RB') : lastName(off, 'QB'),
    ...(isPass ? { target: lastName(off, 'WR') } : {}),
  };
}

// ── Game loop ─────────────────────────────────────────────────────────────────

const PLAYS_PER_QUARTER = 18;
const FG_MIN_YARD_LINE  = 62; // attempt FG from opponent ~38 or closer

export function simulateGame(game: Game): Game {
  const home = game.homeTeam;
  const away = game.awayTeam;
  const events: PlayEvent[] = [];

  let quarter      = 1;
  let quarterPlays = 0;
  let possession: 'home' | 'away' = Math.random() < 0.5 ? 'home' : 'away';
  let down     = 1;
  let distance = 10;
  let yardLine = 25;
  let homeScore = 0;
  let awayScore = 0;

  const score = (pts: number) => {
    if (possession === 'home') homeScore += pts;
    else awayScore += pts;
  };

  const changePoss = () => {
    possession = possession === 'home' ? 'away' : 'home';
    down = 1; distance = 10; yardLine = 25;
  };

  while (quarter <= 4) {
    const off = possession === 'home' ? home : away;
    const def = possession === 'home' ? away : home;

    if (down === 4) {
      if (yardLine >= FG_MIN_YARD_LINE) {
        const ev = simulatePlay(off, def, 'field_goal', quarter, down, distance, yardLine);
        events.push(ev);
        if (ev.result === 'field_goal_good') score(3);
        changePoss();
      } else {
        const puntYards = randInt(35, 52);
        const newYL = Math.max(5, 100 - (yardLine + puntYards));
        events.push({ type: 'punt', offenseTeamId: off.id, defenseTeamId: def.id,
          result: 'success', yards: puntYards, quarter, down, distance, yardLine });
        changePoss();
        yardLine = newYL;
      }
    } else {
      const type = selectPlayType(down, distance);
      const ev   = simulatePlay(off, def, type, quarter, down, distance, yardLine);
      events.push(ev);

      if (ev.result === 'touchdown') {
        score(7);
        changePoss();
      } else if (ev.result === 'turnover') {
        yardLine = Math.max(5, Math.min(95, 100 - yardLine));
        changePoss();
      } else {
        yardLine = Math.min(99, yardLine + ev.yards);
        const gained = ev.yards;
        if (gained >= distance) {
          down = 1; distance = 10;           // first down
        } else {
          down++;
          distance -= gained;
        }
      }
    }

    quarterPlays++;
    if (quarterPlays >= PLAYS_PER_QUARTER) {
      quarter++;
      quarterPlays = 0;
      if (quarter === 3) changePoss(); // halftime flip
    }
  }

  return { ...game, homeScore, awayScore, status: 'final', events };
}
