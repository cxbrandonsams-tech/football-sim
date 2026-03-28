/**
 * Drive summaries, key moments, and postgame recaps.
 *
 * Pure functions — no React, no side effects.
 * Operates entirely on existing Game/PlayEvent/GameBoxScore data.
 */

import type { Game, PlayEvent, GameBoxScore, Team, OffensivePlay } from './types';

// ── Opponent Scouting Report ─────────────────────────────────────────────────

export interface ScoutingReport {
  teamAbbr:    string;
  passRate:    number;  // 0–1
  runRate:     number;
  deepRate:    number;  // fraction of passes that are deep
  shortRate:   number;
  totalCalls:  number;
  topPlays:    { name: string; calls: number; avgYards: number }[];
  summary:     string;
}

/**
 * Generate a scouting report from opponent team data.
 * @param opponent - the opponent Team object
 * @param allPlays - optional full play library (if available); when absent, top plays are omitted
 */
export function generateScoutingReport(
  opponent: Team,
  allPlays?: OffensivePlay[],
): ScoutingReport | null {
  const stats = opponent.playStats;
  if (!stats) return null;

  const playLookup = allPlays
    ? new Map([...allPlays, ...(opponent.customOffensivePlays ?? [])].map(p => [p.id, p]))
    : new Map((opponent.customOffensivePlays ?? []).map(p => [p.id, p]));

  let runCalls = 0, passCalls = 0, deepCalls = 0, shortCalls = 0, totalCalls = 0;
  const playLines: { name: string; calls: number; totalYards: number }[] = [];

  for (const [playId, s] of Object.entries(stats)) {
    const play = playLookup.get(playId);
    totalCalls += s.calls;

    // Infer engine type from play object or from play ID conventions
    const et = play?.engineType ?? inferEngineType(playId);
    if (!et) continue;
    if (et === 'inside_run' || et === 'outside_run') runCalls += s.calls;
    if (et === 'short_pass' || et === 'medium_pass' || et === 'deep_pass') passCalls += s.calls;
    if (et === 'deep_pass') deepCalls += s.calls;
    if (et === 'short_pass') shortCalls += s.calls;
    if (play) playLines.push({ name: play.name, calls: s.calls, totalYards: s.totalYards });
  }

  if (totalCalls < 10) return null;

  const passRate = passCalls / totalCalls;
  const deepRate = passCalls > 0 ? deepCalls / passCalls : 0;
  const shortRate = passCalls > 0 ? shortCalls / passCalls : 0;

  const topPlays = playLines
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5)
    .map(p => ({ name: p.name, calls: p.calls, avgYards: p.calls > 0 ? +(p.totalYards / p.calls).toFixed(1) : 0 }));

  const parts: string[] = [];
  if (passRate > 0.6) parts.push('Pass-heavy offense');
  else if (passRate < 0.4) parts.push('Run-heavy offense');
  else parts.push('Balanced attack');

  if (deepRate > 0.3) parts.push('favors deep shots');
  else if (shortRate > 0.55) parts.push('relies on short passes');

  if (topPlays[0]) parts.push(`top play: ${topPlays[0].name} (${topPlays[0].calls} calls, ${topPlays[0].avgYards} avg)`);

  return {
    teamAbbr: opponent.abbreviation,
    passRate, runRate: 1 - passRate, deepRate, shortRate, totalCalls,
    topPlays,
    summary: parts.join('. ') + '.',
  };
}

/** Infer engine type from built-in play ID naming conventions. */
function inferEngineType(playId: string): string | null {
  if (playId.includes('inside') || playId.includes('power') || playId.includes('dive') || playId.includes('slam') || playId.includes('lead')) return 'inside_run';
  if (playId.includes('outside') || playId.includes('counter') || playId.includes('sweep')) return 'outside_run';
  if (playId.includes('four_vert') || playId.includes('boot_deep') || playId.includes('comeback_post') || playId.includes('pa_vertical')) return 'deep_pass';
  if (playId.includes('curl') || playId.includes('slant') || playId.includes('hitch') || playId.includes('quick') || playId.includes('spacing') || playId.includes('te_slip')) return 'short_pass';
  if (playId.includes('drive') || playId.includes('mesh') || playId.includes('seam') || playId.includes('cross') || playId.includes('smash') || playId.includes('pa_boot') || playId.includes('pa_seam') || playId.includes('pa_cross')) return 'medium_pass';
  return null;
}

// ── Drive Summary ────────────────────────────────────────────────────────────

export interface DriveSummary {
  teamId:         string;
  teamAbbr:       string;
  startYardLine:  number;     // 0–100 (0 = own goal line)
  endYardLine:    number;
  plays:          number;
  yards:          number;
  result:         DriveResult;
  quarter:        number;     // quarter the drive started in
  events:         PlayEvent[];
}

export type DriveResult =
  | 'touchdown' | 'field_goal' | 'field_goal_miss' | 'punt'
  | 'turnover_on_downs' | 'interception' | 'fumble'
  | 'end_of_half' | 'end_of_game';

/**
 * Reconstruct drives from a flat PlayEvent[] array.
 * A drive ends when possession changes (TD, FG, punt, turnover) or
 * the game/half ends.
 */
export function buildDriveSummaries(game: Game): DriveSummary[] {
  const events = game.events;
  if (!events || events.length === 0) return [];

  const drives: DriveSummary[] = [];
  let driveEvents: PlayEvent[] = [];
  let driveTeamId = events[0]!.offenseTeamId;
  let startYardLine = events[0]!.yardLine;
  let driveQuarter = events[0]!.quarter;

  function abbrFor(teamId: string): string {
    if (teamId === game.homeTeam.id) return game.homeTeam.abbreviation;
    return game.awayTeam.abbreviation;
  }

  function flushDrive(result: DriveResult) {
    if (driveEvents.length === 0) return;
    const lastEv = driveEvents[driveEvents.length - 1]!;
    const yards = driveEvents.reduce((sum, ev) => sum + ev.yards, 0);
    drives.push({
      teamId: driveTeamId,
      teamAbbr: abbrFor(driveTeamId),
      startYardLine,
      endYardLine: lastEv.yardLine,
      plays: driveEvents.length,
      yards,
      result,
      quarter: driveQuarter,
      events: [...driveEvents],
    });
    driveEvents = [];
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const nextEv = events[i + 1];

    // Possession change detection: if next play's offense differs
    const possessionChanges = nextEv && nextEv.offenseTeamId !== ev.offenseTeamId;

    // Start a new drive if offense changed from the tracked team
    if (ev.offenseTeamId !== driveTeamId) {
      driveTeamId = ev.offenseTeamId;
      startYardLine = ev.yardLine;
      driveQuarter = ev.quarter;
    }

    driveEvents.push(ev);

    // Determine drive result
    if (ev.result === 'touchdown') {
      flushDrive('touchdown');
      driveTeamId = nextEv?.offenseTeamId ?? driveTeamId;
      startYardLine = nextEv?.yardLine ?? 25;
      driveQuarter = nextEv?.quarter ?? ev.quarter;
    } else if (ev.result === 'field_goal_good') {
      flushDrive('field_goal');
      driveTeamId = nextEv?.offenseTeamId ?? driveTeamId;
      startYardLine = nextEv?.yardLine ?? 25;
      driveQuarter = nextEv?.quarter ?? ev.quarter;
    } else if (ev.result === 'field_goal_miss') {
      flushDrive('field_goal_miss');
      driveTeamId = nextEv?.offenseTeamId ?? driveTeamId;
      startYardLine = nextEv?.yardLine ?? 25;
      driveQuarter = nextEv?.quarter ?? ev.quarter;
    } else if (ev.type === 'punt') {
      flushDrive('punt');
      driveTeamId = nextEv?.offenseTeamId ?? driveTeamId;
      startYardLine = nextEv?.yardLine ?? 25;
      driveQuarter = nextEv?.quarter ?? ev.quarter;
    } else if (ev.type === 'interception' || ev.result === 'turnover') {
      const result = ev.type === 'interception' ? 'interception' as const : 'fumble' as const;
      flushDrive(result);
      driveTeamId = nextEv?.offenseTeamId ?? driveTeamId;
      startYardLine = nextEv?.yardLine ?? 25;
      driveQuarter = nextEv?.quarter ?? ev.quarter;
    } else if (possessionChanges) {
      // Possession changed without an obvious terminal event (turnover on downs, end of half)
      const isEndOfHalf = ev.quarter !== nextEv!.quarter && (ev.quarter === 2 || ev.quarter === 4);
      flushDrive(isEndOfHalf ? 'end_of_half' : 'turnover_on_downs');
      driveTeamId = nextEv!.offenseTeamId;
      startYardLine = nextEv!.yardLine;
      driveQuarter = nextEv!.quarter;
    } else if (!nextEv) {
      // Last event in the game
      flushDrive('end_of_game');
    }
  }

  return drives;
}

const DRIVE_RESULT_LABELS: Record<DriveResult, string> = {
  touchdown:         'Touchdown',
  field_goal:        'Field Goal',
  field_goal_miss:   'Missed FG',
  punt:              'Punt',
  turnover_on_downs: 'Turnover on Downs',
  interception:      'Interception',
  fumble:            'Fumble',
  end_of_half:       'End of Half',
  end_of_game:       'End of Game',
};

export function formatDriveSummary(d: DriveSummary): string {
  const result = DRIVE_RESULT_LABELS[d.result];
  const yardWord = Math.abs(d.yards) === 1 ? 'yard' : 'yards';
  if (d.result === 'touchdown') {
    return `${d.plays}-play, ${d.yards}-${yardWord} touchdown drive`;
  }
  if (d.result === 'field_goal') {
    return `${d.plays}-play, ${d.yards}-${yardWord} field goal drive`;
  }
  if (d.yards <= 0) {
    return `${d.plays}-play drive ending in ${result.toLowerCase()}`;
  }
  return `${d.plays}-play, ${d.yards}-${yardWord} drive ending in ${result.toLowerCase()}`;
}

// ── Key Moments ──────────────────────────────────────────────────────────────

export interface KeyMoment {
  quarter:     number;
  type:        'touchdown' | 'turnover' | 'big_play' | 'sack' | 'field_goal' | 'long_drive';
  description: string;
  eventIndex:  number;  // index into game.events
}

export function identifyKeyMoments(game: Game): KeyMoment[] {
  const events = game.events;
  if (!events || events.length === 0) return [];

  const moments: KeyMoment[] = [];
  const homeAbbr = game.homeTeam.abbreviation;
  const awayAbbr = game.awayTeam.abbreviation;

  function abbr(teamId: string): string {
    return teamId === game.homeTeam.id ? homeAbbr : awayAbbr;
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const team = abbr(ev.offenseTeamId);
    const carrier = ev.ballCarrier ?? '?';
    const target = ev.target ?? '?';

    // Touchdowns
    if (ev.result === 'touchdown') {
      const isPass = ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass';
      const desc = isPass
        ? `${team} ${carrier} to ${target} — ${ev.yards}-yard TD`
        : `${team} ${carrier} — ${ev.yards}-yard rushing TD`;
      moments.push({ quarter: ev.quarter, type: 'touchdown', description: desc, eventIndex: i });
    }

    // Turnovers
    if (ev.type === 'interception') {
      moments.push({
        quarter: ev.quarter, type: 'turnover',
        description: `${team} ${carrier} intercepted — turnover`,
        eventIndex: i,
      });
    }
    if (ev.type === 'fumble' || (ev.result === 'turnover' && ev.type !== 'interception')) {
      moments.push({
        quarter: ev.quarter, type: 'turnover',
        description: `${team} ${carrier} fumble — turnover`,
        eventIndex: i,
      });
    }

    // Big plays (15+ yards, not a TD since those are already captured)
    if (ev.result === 'success' && ev.yards >= 15) {
      const isPass = ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass';
      const desc = isPass
        ? `${team} ${carrier} to ${target} — ${ev.yards}-yard gain`
        : `${team} ${carrier} — ${ev.yards}-yard run`;
      moments.push({ quarter: ev.quarter, type: 'big_play', description: desc, eventIndex: i });
    }

    // Field goals
    if (ev.result === 'field_goal_good') {
      const fgDist = (100 - ev.yardLine) + 17;
      moments.push({
        quarter: ev.quarter, type: 'field_goal',
        description: `${team} ${fgDist}-yard field goal`,
        eventIndex: i,
      });
    }
  }

  // Long drives (10+ plays)
  const drives = buildDriveSummaries(game);
  for (const d of drives) {
    if (d.plays >= 10 && d.events.length > 0) {
      const firstEvIdx = events.indexOf(d.events[0]!);
      moments.push({
        quarter: d.quarter, type: 'long_drive',
        description: `${d.teamAbbr} ${formatDriveSummary(d)}`,
        eventIndex: firstEvIdx >= 0 ? firstEvIdx : 0,
      });
    }
  }

  // Sort by event index (chronological)
  moments.sort((a, b) => a.eventIndex - b.eventIndex);
  return moments;
}

// ── Postgame Recap ───────────────────────────────────────────────────────────

export interface PostgameRecap {
  headline:      string;
  paragraph:     string;
  winnerAbbr:    string;
  loserAbbr:     string;
  winnerScore:   number;
  loserScore:    number;
  isTie:         boolean;
  keyMoments:    KeyMoment[];
  drives:        DriveSummary[];
  standouts:     StandoutPlayer[];
}

export interface StandoutPlayer {
  name:     string;
  playerId: string;
  teamId:   string;
  line:     string;   // e.g. "22/31, 285 yds, 3 TD"
}

function pickSeeded(templates: string[], seed: number): string {
  return templates[((seed >>> 0) % templates.length)]!;
}

export function generateRecap(game: Game): PostgameRecap | null {
  if (game.status !== 'final' || !game.boxScore) return null;

  const bs = game.boxScore;
  const homeAbbr = game.homeTeam.abbreviation;
  const awayAbbr = game.awayTeam.abbreviation;

  const homeWins = game.homeScore > game.awayScore;
  const isTie = game.homeScore === game.awayScore;
  const winnerAbbr = isTie ? homeAbbr : homeWins ? homeAbbr : awayAbbr;
  const loserAbbr = isTie ? awayAbbr : homeWins ? awayAbbr : homeAbbr;
  const winnerScore = isTie ? game.homeScore : homeWins ? game.homeScore : game.awayScore;
  const loserScore = isTie ? game.awayScore : homeWins ? game.awayScore : game.homeScore;
  const winnerName = isTie ? game.homeTeam.name : homeWins ? game.homeTeam.name : game.awayTeam.name;
  const loserName = isTie ? game.awayTeam.name : homeWins ? game.awayTeam.name : game.homeTeam.name;

  const diff = winnerScore - loserScore;
  const isBlowout = diff >= 21;
  const isClose = diff <= 7 && !isTie;
  const totalPoints = game.homeScore + game.awayScore;
  const isHighScoring = totalPoints >= 50;
  const isDefensive = totalPoints <= 20;

  const keyMoments = identifyKeyMoments(game);
  const drives = buildDriveSummaries(game);

  // ── Headline ──
  let headline: string;
  const seed = game.homeScore * 100 + game.awayScore + game.week;
  if (isTie) {
    headline = `${homeAbbr} and ${awayAbbr} battle to a ${winnerScore}–${loserScore} tie`;
  } else if (isBlowout) {
    headline = pickSeeded([
      `${winnerAbbr} dominates ${loserAbbr} ${winnerScore}–${loserScore}`,
      `${winnerAbbr} cruises past ${loserAbbr} ${winnerScore}–${loserScore}`,
      `${winnerAbbr} rolls over ${loserAbbr} in ${winnerScore}–${loserScore} rout`,
    ], seed);
  } else if (isClose) {
    headline = pickSeeded([
      `${winnerAbbr} edges ${loserAbbr} ${winnerScore}–${loserScore}`,
      `${winnerAbbr} holds on to beat ${loserAbbr} ${winnerScore}–${loserScore}`,
      `${winnerAbbr} survives ${loserAbbr} challenge, wins ${winnerScore}–${loserScore}`,
    ], seed);
  } else {
    headline = pickSeeded([
      `${winnerAbbr} defeats ${loserAbbr} ${winnerScore}–${loserScore}`,
      `${winnerAbbr} takes down ${loserAbbr} ${winnerScore}–${loserScore}`,
      `${winnerAbbr} gets the win over ${loserAbbr}, ${winnerScore}–${loserScore}`,
    ], seed);
  }

  // ── Standout players ──
  const standouts = findStandouts(bs);

  // ── Recap paragraph ──
  const paragraph = buildRecapParagraph(
    winnerName, loserName, winnerAbbr, loserAbbr,
    winnerScore, loserScore, isTie, isBlowout, isClose, isHighScoring, isDefensive,
    bs, standouts, keyMoments, drives, seed,
  );

  return {
    headline, paragraph,
    winnerAbbr, loserAbbr, winnerScore, loserScore, isTie,
    keyMoments, drives, standouts,
  };
}

function findStandouts(bs: GameBoxScore): StandoutPlayer[] {
  const players = Object.values(bs.players);
  const standouts: StandoutPlayer[] = [];

  // Top passer
  const passers = players.filter(p => p.attempts >= 5).sort((a, b) => b.passingYards - a.passingYards);
  if (passers[0]) {
    const p = passers[0];
    standouts.push({
      name: p.name, playerId: p.playerId, teamId: p.teamId,
      line: `${p.completions}/${p.attempts}, ${p.passingYards} yds, ${p.passingTDs} TD${p.interceptions > 0 ? `, ${p.interceptions} INT` : ''}`,
    });
  }
  // Second passer if present
  if (passers[1] && passers[1].passingYards >= 100) {
    const p = passers[1];
    standouts.push({
      name: p.name, playerId: p.playerId, teamId: p.teamId,
      line: `${p.completions}/${p.attempts}, ${p.passingYards} yds, ${p.passingTDs} TD${p.interceptions > 0 ? `, ${p.interceptions} INT` : ''}`,
    });
  }

  // Top rusher
  const rushers = players.filter(p => p.carries >= 3).sort((a, b) => b.rushingYards - a.rushingYards);
  if (rushers[0] && rushers[0].rushingYards >= 30) {
    const p = rushers[0];
    standouts.push({
      name: p.name, playerId: p.playerId, teamId: p.teamId,
      line: `${p.carries} car, ${p.rushingYards} yds${p.rushingTDs > 0 ? `, ${p.rushingTDs} TD` : ''}`,
    });
  }

  // Top receiver
  const receivers = players.filter(p => p.receptions >= 2).sort((a, b) => b.receivingYards - a.receivingYards);
  if (receivers[0] && receivers[0].receivingYards >= 40) {
    const p = receivers[0];
    standouts.push({
      name: p.name, playerId: p.playerId, teamId: p.teamId,
      line: `${p.receptions} rec, ${p.receivingYards} yds${p.receivingTDs > 0 ? `, ${p.receivingTDs} TD` : ''}`,
    });
  }

  return standouts;
}

function buildRecapParagraph(
  winnerName: string, loserName: string,
  winnerAbbr: string, loserAbbr: string,
  winnerScore: number, loserScore: number,
  isTie: boolean, isBlowout: boolean, isClose: boolean,
  isHighScoring: boolean, isDefensive: boolean,
  bs: GameBoxScore, standouts: StandoutPlayer[],
  _moments: KeyMoment[], _drives: DriveSummary[],
  seed: number,
): string {
  const parts: string[] = [];

  // Opener
  if (isTie) {
    parts.push(`The ${winnerName} and ${loserName} played to a ${winnerScore}–${loserScore} draw.`);
  } else if (isBlowout) {
    parts.push(pickSeeded([
      `The ${winnerName} were in control from start to finish, cruising to a ${winnerScore}–${loserScore} victory over the ${loserName}.`,
      `It was all ${winnerAbbr} as they pulled away for a commanding ${winnerScore}–${loserScore} win.`,
    ], seed));
  } else if (isClose) {
    parts.push(pickSeeded([
      `In a tightly contested affair, the ${winnerName} held on for a ${winnerScore}–${loserScore} win over the ${loserName}.`,
      `It came down to the wire as ${winnerAbbr} escaped with a ${winnerScore}–${loserScore} victory.`,
    ], seed + 1));
  } else {
    parts.push(`The ${winnerName} defeated the ${loserName} ${winnerScore}–${loserScore}.`);
  }

  // Yardage context
  const winnerStats = bs.home.teamId === (isTie ? bs.home.teamId : winnerScore === bs.home.score ? bs.home.teamId : bs.away.teamId)
    ? bs.home : bs.away;
  const loserStats = winnerStats === bs.home ? bs.away : bs.home;

  if (winnerStats.totalYards - loserStats.totalYards > 100) {
    parts.push(`${winnerAbbr} outgained ${loserAbbr} ${winnerStats.totalYards}–${loserStats.totalYards} in total yards.`);
  } else if (isDefensive) {
    parts.push('Both defenses were dominant, keeping offenses in check all game.');
  } else if (isHighScoring) {
    parts.push('The offenses traded blows in a high-scoring contest.');
  }

  // Standout mention
  if (standouts.length > 0) {
    const top = standouts[0]!;
    parts.push(`${top.name} led the way with ${top.line}.`);
  }

  // Turnover note
  const totalTurnovers = bs.home.turnovers + bs.away.turnovers;
  if (totalTurnovers >= 4) {
    parts.push(`Turnovers were a factor, with ${totalTurnovers} combined on the day.`);
  } else if (!isTie && loserStats.turnovers >= 2 && winnerStats.turnovers === 0) {
    parts.push(`${loserAbbr} hurt themselves with ${loserStats.turnovers} turnovers.`);
  }

  return parts.join(' ');
}

// ── Post-Game Gameplan Review ────────────────────────────────────────────────

export type ReviewVerdict = 'effective' | 'mixed' | 'poor';

export interface GameplanReview {
  verdict:  ReviewVerdict;
  label:    string;
  metrics:  { label: string; value: string; good: boolean }[];
  insights: string[];
}

/**
 * Evaluate how well a team's gameplan worked in a completed game.
 * Uses box score stats to determine rushing/passing effectiveness,
 * turnovers, and scoring efficiency.
 */
export function evaluateGameplan(
  game: Game,
  teamId: string,
): GameplanReview | null {
  if (game.status !== 'final' || !game.boxScore) return null;

  const bs = game.boxScore;
  const isHome = game.homeTeam.id === teamId;
  const myStats  = isHome ? bs.home : bs.away;
  const oppStats = isHome ? bs.away : bs.home;
  if (!myStats || !oppStats) return null;

  const won = myStats.score > oppStats.score;
  const metrics: { label: string; value: string; good: boolean }[] = [];
  const insights: string[] = [];

  // Rushing efficiency
  const rushGood = myStats.rushingYards >= 100;
  metrics.push({
    label: 'Rushing',
    value: `${myStats.rushingYards} yds`,
    good: rushGood,
  });

  // Passing efficiency
  const passGood = myStats.passingYards >= 200;
  metrics.push({
    label: 'Passing',
    value: `${myStats.passingYards} yds`,
    good: passGood,
  });

  // Turnovers
  const toGood = myStats.turnovers === 0;
  metrics.push({
    label: 'Turnovers',
    value: `${myStats.turnovers}`,
    good: toGood,
  });

  // Determine verdict
  let score = 0;
  if (won) score += 2;
  if (rushGood) score += 1;
  if (passGood) score += 1;
  if (toGood) score += 1;
  if (myStats.totalYards > oppStats.totalYards) score += 1;

  let verdict: ReviewVerdict;
  let label: string;
  if (score >= 5) {
    verdict = 'effective';
    label = 'Gameplan was effective';
  } else if (score >= 3) {
    verdict = 'mixed';
    label = 'Gameplan had mixed results';
  } else {
    verdict = 'poor';
    label = 'Gameplan struggled';
  }

  // Insights
  if (rushGood && passGood) {
    insights.push('Balanced attack worked — both run and pass were productive.');
  } else if (rushGood && !passGood) {
    insights.push('The run game carried the offense. Consider leaning into it more.');
  } else if (!rushGood && passGood) {
    insights.push('Passing was the primary weapon. The run game could use more support.');
  } else {
    insights.push('Both phases struggled. Consider adjusting your scheme or play weights.');
  }

  if (myStats.turnovers >= 2) {
    insights.push(`${myStats.turnovers} turnovers hurt — ball security is a concern.`);
  } else if (toGood && won) {
    insights.push('Clean game with no turnovers — well-executed plan.');
  }

  if (myStats.totalYards > oppStats.totalYards + 100) {
    insights.push(`Dominated in total yards (${myStats.totalYards} to ${oppStats.totalYards}).`);
  } else if (oppStats.totalYards > myStats.totalYards + 100) {
    insights.push(`Outgained ${myStats.totalYards} to ${oppStats.totalYards} — the defense was under pressure.`);
  }

  return { verdict, label, metrics, insights: insights.slice(0, 2) };
}

// ── Season Coaching Grade ────────────────────────────────────────────────────

export type CoachingGrade = 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'D' | 'F';

export interface SeasonCoachingReport {
  grade:      CoachingGrade;
  gamesEval:  number;
  wins:       number;
  losses:     number;
  avgScore:   number;     // 0–6 scale
  strengths:  string[];
  weaknesses: string[];
}

/**
 * Compute a raw 0–6 game performance score.
 * Same formula as evaluateGameplan but returns just the number.
 */
function gamePerformanceScore(game: Game, teamId: string): number | null {
  if (game.status !== 'final' || !game.boxScore) return null;
  const bs = game.boxScore;
  const isHome = game.homeTeam.id === teamId;
  const myStats  = isHome ? bs.home : bs.away;
  const oppStats = isHome ? bs.away : bs.home;
  if (!myStats || !oppStats) return null;

  let score = 0;
  if (myStats.score > oppStats.score) score += 2;
  if (myStats.rushingYards >= 100) score += 1;
  if (myStats.passingYards >= 200) score += 1;
  if (myStats.turnovers === 0) score += 1;
  if (myStats.totalYards > oppStats.totalYards) score += 1;
  return score;
}

/**
 * Generate a season-long coaching grade from all completed games.
 */
export function generateSeasonGrade(
  games: Game[],
  teamId: string,
): SeasonCoachingReport | null {
  const myGames = games.filter(g =>
    g.status === 'final' && (g.homeTeam.id === teamId || g.awayTeam.id === teamId),
  );
  if (myGames.length < 2) return null;

  let totalScore = 0;
  let evaluated = 0;
  let wins = 0, losses = 0;
  let rushGoodCount = 0, passGoodCount = 0, cleanCount = 0, outgainedCount = 0;
  let rushTotal = 0, passTotal = 0, toTotal = 0;

  for (const g of myGames) {
    const s = gamePerformanceScore(g, teamId);
    if (s === null) continue;
    evaluated++;
    totalScore += s;

    const bs = g.boxScore!;
    const isHome = g.homeTeam.id === teamId;
    const my = isHome ? bs.home : bs.away;
    const opp = isHome ? bs.away : bs.home;

    if (my.score > opp.score) wins++; else losses++;
    if (my.rushingYards >= 100) rushGoodCount++;
    if (my.passingYards >= 200) passGoodCount++;
    if (my.turnovers === 0) cleanCount++;
    if (my.totalYards > opp.totalYards) outgainedCount++;
    rushTotal += my.rushingYards;
    passTotal += my.passingYards;
    toTotal += my.turnovers;
  }

  if (evaluated < 2) return null;

  const avgScore = totalScore / evaluated;

  // Grade mapping (0–6 avg scale)
  let grade: CoachingGrade;
  if (avgScore >= 5.2)      grade = 'A';
  else if (avgScore >= 4.6) grade = 'A-';
  else if (avgScore >= 4.0) grade = 'B+';
  else if (avgScore >= 3.5) grade = 'B';
  else if (avgScore >= 3.0) grade = 'B-';
  else if (avgScore >= 2.5) grade = 'C+';
  else if (avgScore >= 2.0) grade = 'C';
  else if (avgScore >= 1.2) grade = 'D';
  else                      grade = 'F';

  // Strengths & weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const rushGoodPct   = rushGoodCount / evaluated;
  const passGoodPct   = passGoodCount / evaluated;
  const cleanPct      = cleanCount / evaluated;
  const outgainedPct  = outgainedCount / evaluated;
  const avgRush       = rushTotal / evaluated;
  const avgPass       = passTotal / evaluated;
  const avgTO         = toTotal / evaluated;

  if (rushGoodPct >= 0.6) strengths.push(`Strong run game (100+ yds in ${(rushGoodPct * 100).toFixed(0)}% of games)`);
  if (passGoodPct >= 0.6) strengths.push(`Consistent passing (200+ yds in ${(passGoodPct * 100).toFixed(0)}% of games)`);
  if (cleanPct >= 0.6) strengths.push(`Ball security (turnover-free in ${(cleanPct * 100).toFixed(0)}% of games)`);
  if (outgainedPct >= 0.7) strengths.push(`Dominant yardage (outgained opponents ${(outgainedPct * 100).toFixed(0)}% of the time)`);
  if (wins > losses * 2 && wins >= 4) strengths.push(`Winning consistently (${wins}–${losses})`);

  if (rushGoodPct < 0.3) weaknesses.push(`Run game inconsistent (avg ${avgRush.toFixed(0)} yds/game)`);
  if (passGoodPct < 0.3) weaknesses.push(`Passing attack limited (avg ${avgPass.toFixed(0)} yds/game)`);
  if (avgTO >= 1.5) weaknesses.push(`Turnover-prone (${avgTO.toFixed(1)} per game)`);
  if (wins < losses && evaluated >= 4) weaknesses.push(`Below .500 record (${wins}–${losses})`);

  return {
    grade,
    gamesEval: evaluated,
    wins, losses,
    avgScore,
    strengths: strengths.slice(0, 2),
    weaknesses: weaknesses.slice(0, 2),
  };
}

// ── Season Summary / Year-End Report ─────────────────────────────────────────

export interface SeasonSummary {
  year:        number;
  teamName:    string;
  teamAbbr:    string;
  record:      string;           // "12–5"
  headline:    string;
  grade:       CoachingGrade | null;
  repChange:   { from: number; to: number; tier: string } | null;
  highlights:  string[];
  outlook:     string;
}

export function generateSeasonSummary(
  games:    Game[],
  teamId:   string,
  teamName: string,
  teamAbbr: string,
  year:     number,
  madePlayoffs: boolean,
  wonChampionship: boolean,
  reputation?: number,
  prevReputation?: number,
): SeasonSummary | null {
  // Compute record
  let wins = 0, losses = 0, ties = 0;
  let totalPf = 0, totalPa = 0;
  let rushTotal = 0, passTotal = 0, toTotal = 0, gamesPlayed = 0;

  for (const g of games) {
    if (g.status !== 'final') continue;
    const isHome = g.homeTeam.id === teamId;
    const isAway = g.awayTeam.id === teamId;
    if (!isHome && !isAway) continue;

    const myScore  = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    if (myScore > oppScore) wins++;
    else if (myScore < oppScore) losses++;
    else ties++;
    totalPf += myScore;
    totalPa += oppScore;

    if (g.boxScore) {
      const my = isHome ? g.boxScore.home : g.boxScore.away;
      rushTotal += my.rushingYards;
      passTotal += my.passingYards;
      toTotal += my.turnovers;
      gamesPlayed++;
    }
  }

  if (wins + losses + ties < 2) return null;

  const record = `${wins}–${losses}${ties > 0 ? `–${ties}` : ''}`;
  const winPct = wins / (wins + losses + ties);

  // Coaching grade
  const grade = generateSeasonGrade(games, teamId);

  // Reputation
  const repChange = (reputation != null && prevReputation != null)
    ? {
        from: prevReputation,
        to: reputation,
        tier: reputation >= 80 ? 'Elite' : reputation >= 60 ? 'Proven Winner' : reputation >= 40 ? 'Respected' : reputation >= 20 ? 'Unproven' : 'Hot Seat',
      }
    : null;

  // Headline
  let headline: string;
  if (wonChampionship) {
    headline = `${teamName} cap a ${record} season with a championship`;
  } else if (madePlayoffs && winPct >= 0.65) {
    headline = `Strong ${record} season for ${teamName}, playoff contenders`;
  } else if (winPct >= 0.60) {
    headline = `${teamName} finish ${record} in a solid campaign`;
  } else if (winPct >= 0.45) {
    headline = `${teamName} go ${record} in a competitive season`;
  } else {
    headline = `${teamName} struggle to a ${record} finish`;
  }

  // Highlights
  const highlights: string[] = [];

  if (wonChampionship) highlights.push('Won the league championship');
  else if (madePlayoffs) highlights.push('Earned a playoff berth');

  if (gamesPlayed >= 4) {
    const avgRush = rushTotal / gamesPlayed;
    const avgPass = passTotal / gamesPlayed;
    const avgTO   = toTotal / gamesPlayed;

    if (avgRush >= 120) highlights.push(`Dominant ground game averaging ${avgRush.toFixed(0)} rush yds/game`);
    else if (avgRush < 70) highlights.push(`Run game was a weakness at ${avgRush.toFixed(0)} rush yds/game`);

    if (avgPass >= 250) highlights.push(`Efficient passing attack at ${avgPass.toFixed(0)} pass yds/game`);

    if (avgTO <= 0.5) highlights.push('Excellent ball security all season');
    else if (avgTO >= 2.0) highlights.push(`Turnover issues persisted (${avgTO.toFixed(1)} per game)`);

    if (totalPf - totalPa > wins * 7) highlights.push(`Outscored opponents by ${totalPf - totalPa} points`);
    else if (totalPa - totalPf > losses * 5) highlights.push(`Outscored by ${totalPa - totalPf} points on the season`);
  }

  if (wins >= 10) highlights.push(`${wins} wins — among the league's best`);

  // Outlook
  let outlook: string;
  if (wonChampionship) {
    outlook = 'Coming off a championship, the target is on your back. Defend the title.';
  } else if (winPct >= 0.65) {
    outlook = 'A strong foundation is in place. The next step is a championship run.';
  } else if (winPct >= 0.45) {
    outlook = 'A few key additions could push this team over the top.';
  } else {
    outlook = 'A rebuild may be needed. Focus on the draft and developing young talent.';
  }

  return {
    year, teamName, teamAbbr, record, headline,
    grade: grade?.grade ?? null,
    repChange,
    highlights: highlights.slice(0, 4),
    outlook,
  };
}
