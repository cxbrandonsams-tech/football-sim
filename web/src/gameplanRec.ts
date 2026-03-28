/**
 * Gameplan recommendation engine.
 *
 * Deterministic rules that suggest a preset based on team performance,
 * league meta, and upcoming opponent tendencies. Pure function, no React.
 */

import type { Team, League, PlayEffStats } from './types';
import { COACH_ARCHETYPES } from './types';

export interface GameplanRecommendation {
  presetId:   string;
  presetName: string;
  reasons:    string[];
  opponent:   { abbr: string; name: string } | null;
}

/** Classify a play ID as run or pass based on naming conventions. */
function isRunPlay(id: string): boolean {
  return id.includes('zone') || id.includes('power') || id.includes('counter')
    || id.includes('dive') || id.includes('slam') || id.includes('lead')
    || id.includes('inside') || id.includes('outside');
}

function isDeepPlay(id: string): boolean {
  return id.includes('vert') || id.includes('deep') || id.includes('comeback') || id.includes('boot_deep');
}

function computePassRate(playStats: Record<string, PlayEffStats>): number {
  let run = 0, pass = 0;
  for (const [id, s] of Object.entries(playStats)) {
    if (isRunPlay(id)) run += s.calls; else pass += s.calls;
  }
  return run + pass > 10 ? pass / (run + pass) : 0.5;
}

export function generateGameplanRecommendation(
  team:   Team,
  league: League,
): GameplanRecommendation | null {
  const ps = team.playStats;
  if (!ps || Object.keys(ps).length < 3) return null;

  const meta = league.metaProfile;
  const games = league.currentSeason.games;
  const myId = team.id;

  // Compute team stats
  let teamDeep = 0, teamTotal = 0;
  let runYards = 0, passYards = 0, runCalls = 0, passCalls = 0;
  for (const [id, s] of Object.entries(ps)) {
    teamTotal += s.calls;
    if (isRunPlay(id)) { runCalls += s.calls; runYards += s.totalYards; }
    else { passCalls += s.calls; passYards += s.totalYards; }
    if (isDeepPlay(id)) teamDeep += s.calls;
  }
  if (teamTotal < 15) return null;

  const runAvg = runCalls > 0 ? runYards / runCalls : 0;
  const passAvg = passCalls > 0 ? passYards / passCalls : 0;
  const teamPassRate = passCalls / teamTotal;

  // Find opponent
  const nextGame = games.find(g => g.status === 'scheduled' && (g.homeTeam.id === myId || g.awayTeam.id === myId));
  const opp = nextGame ? (nextGame.homeTeam.id === myId ? nextGame.awayTeam : nextGame.homeTeam) : null;
  let oppPassRate = 0.5;
  if (opp?.playStats) {
    oppPassRate = computePassRate(opp.playStats);
  }

  // Recommendation rules
  let recId = 'balanced';
  const reasons: string[] = [];

  if (runAvg > 4.5 && runCalls >= 10) {
    recId = 'run_heavy';
    reasons.push(`Your run game averages ${runAvg.toFixed(1)} yds/carry`);
    if (passAvg > 6.0) {
      recId = 'play_action';
      reasons.push(`Strong pass avg (${passAvg.toFixed(1)}) makes PA deadly`);
    }
  } else if (passAvg > 7.0 && teamDeep / teamTotal > 0.15) {
    recId = 'vertical';
    reasons.push(`Your passing attack averages ${passAvg.toFixed(1)} yds/att`);
  } else if (passAvg > 5.0 && teamPassRate > 0.55) {
    recId = 'west_coast';
    reasons.push('Your short passing game is efficient');
  }

  if (meta && meta.totalCalls >= 50) {
    if (meta.passRate > 0.58 && recId === 'balanced') {
      recId = 'run_heavy';
      reasons.push('League is pass-heavy — running creates a counter-meta edge');
    } else if (meta.runRate > 0.58 && recId === 'balanced') {
      recId = 'west_coast';
      reasons.push('League is run-heavy — efficient passing exploits the trend');
    }
  }

  if (opp && oppPassRate > 0.60) {
    if (recId === 'balanced' || recId === 'run_heavy') {
      recId = 'coverage_defense';
      reasons.push(`${opp.abbreviation} passes ${(oppPassRate * 100).toFixed(0)}% — coverage defense recommended`);
    } else {
      reasons.push(`${opp.abbreviation} is pass-heavy — your defense will auto-adapt`);
    }
  } else if (opp && oppPassRate < 0.40) {
    if (recId === 'balanced') {
      recId = 'run_stop_defense';
      reasons.push(`${opp.abbreviation} is run-heavy — stack the box`);
    }
  }

  if (reasons.length === 0) reasons.push('No strong signal — balanced approach is safe');

  const rec = COACH_ARCHETYPES.find(a => a.id === recId);
  if (!rec) return null;

  return {
    presetId: rec.id,
    presetName: rec.name,
    reasons: reasons.slice(0, 3),
    opponent: opp ? { abbr: opp.abbreviation, name: opp.name } : null,
  };
}
