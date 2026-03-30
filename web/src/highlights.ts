/**
 * Post-game highlights — top plays ranked by score swing (change in score differential).
 */
import type { PlayEvent } from './types';

export interface Highlight {
  idx: number;
  event: PlayEvent;
  /** Absolute change in score differential this play caused */
  swing: number;
  /** Score differential BEFORE the play (home - away) */
  diffBefore: number;
  /** Score differential AFTER the play */
  diffAfter: number;
  /** Description of the play */
  description: string;
  /** What type of highlight */
  kind: 'touchdown' | 'turnover' | 'field_goal' | 'safety' | 'big_play';
}

/**
 * Generate top N highlights from a completed game.
 * Ranks by absolute score swing — the biggest momentum-shifting plays.
 */
export function generateHighlights(events: PlayEvent[], homeId: string, count = 5): Highlight[] {
  if (events.length === 0) return [];

  const plays: Highlight[] = [];
  let homeScore = 0;
  let awayScore = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const diffBefore = homeScore - awayScore;
    const isHome = ev.offenseTeamId === homeId;

    // Update scores
    if (ev.result === 'touchdown') {
      if (isHome) homeScore += 7; else awayScore += 7;
    } else if (ev.result === 'field_goal_good') {
      if (isHome) homeScore += 3; else awayScore += 3;
    } else if (ev.result === 'safety') {
      // Safety scores for defense
      if (isHome) awayScore += 2; else homeScore += 2;
    }

    const diffAfter = homeScore - awayScore;
    const swing = Math.abs(diffAfter - diffBefore);

    if (swing === 0 && ev.yards < 20 && ev.result !== 'turnover') continue;

    let kind: Highlight['kind'] = 'big_play';
    if (ev.result === 'touchdown') kind = 'touchdown';
    else if (ev.result === 'turnover') kind = 'turnover';
    else if (ev.result === 'field_goal_good') kind = 'field_goal';
    else if (ev.result === 'safety') kind = 'safety';

    const carrier = ev.ballCarrier ?? '???';
    const target = ev.target ?? '';

    let description = '';
    if (kind === 'touchdown') {
      const isPass = ev.type.includes('pass');
      description = isPass
        ? `${carrier} to ${target} — TOUCHDOWN`
        : `${carrier} rushes in — TOUCHDOWN`;
    } else if (kind === 'turnover') {
      description = ev.type === 'interception'
        ? `${carrier} INTERCEPTED by ${target}`
        : `${carrier} FUMBLE — turnover`;
    } else if (kind === 'field_goal') {
      const dist = Math.max(0, 100 - ev.yardLine + 17);
      description = `${dist}-yard field goal — GOOD`;
    } else if (kind === 'safety') {
      description = `SAFETY! ${carrier} brought down in the end zone`;
    } else {
      const isPass = ev.type.includes('pass');
      description = isPass
        ? `${carrier} to ${target} for ${ev.yards} yards`
        : `${carrier} breaks free for ${ev.yards} yards`;
    }

    plays.push({ idx: i, event: ev, swing, diffBefore, diffAfter, description, kind });
  }

  // Sort by swing descending, then by "drama" (later quarter matters more)
  plays.sort((a, b) => {
    const swingDiff = b.swing - a.swing;
    if (swingDiff !== 0) return swingDiff;
    // Tiebreak: later plays are more dramatic
    return b.event.quarter - a.event.quarter || b.idx - a.idx;
  });

  return plays.slice(0, count);
}
