/**
 * Momentum meter — tug-of-war style momentum calculation.
 * Rolling window of last N plays, scored by impact.
 */
import type { PlayEvent } from './types';

const WINDOW = 8;

export interface MomentumState {
  /** -5 (away dominated) to +5 (home dominated), 0 = neutral */
  value: number;
  /** 0–100 bar position (50 = center/neutral) */
  pct: number;
  /** Which team has momentum, or null if neutral */
  leader: 'home' | 'away' | null;
}

/**
 * Score a single play's momentum contribution.
 * Positive = good for the offense, negative = bad (good for defense).
 */
function scorePlays(ev: PlayEvent): number {
  let pts = 0;

  // Touchdowns
  if (ev.result === 'touchdown') pts += 3;

  // Turnovers (bad for offense)
  else if (ev.result === 'turnover') pts -= 3;

  // Big play (20+ yards)
  else if (ev.yards >= 20) pts += 2;

  // First down
  else if (ev.firstDown) pts += 1;

  // Sack (bad for offense)
  else if (ev.type === 'sack') pts -= 1;

  // Turnover on downs (down > 4 means failed 4th down)
  else if (ev.down >= 4 && ev.result === 'fail') pts -= 2;

  // Safety
  else if (ev.result === 'safety') pts -= 3;

  return pts;
}

/**
 * Compute momentum from events up to `idx`.
 * @param homeId — the home team's ID (positive momentum = home advantage)
 */
export function computeMomentum(events: PlayEvent[], idx: number, homeId: string): MomentumState {
  if (idx < 0 || events.length === 0) {
    return { value: 0, pct: 50, leader: null };
  }

  const start = Math.max(0, idx - WINDOW + 1);
  let raw = 0;

  for (let i = start; i <= Math.min(idx, events.length - 1); i++) {
    const ev = events[i]!;
    const playScore = scorePlays(ev);
    // Convert to home-relative: if home is on offense, positive is good for home
    // If away is on offense, positive is good for away (so negate for home-relative)
    if (ev.offenseTeamId === homeId) {
      raw += playScore;
    } else {
      raw -= playScore;
    }
  }

  // Clamp to [-5, 5]
  const value = Math.max(-5, Math.min(5, raw));

  // Map to 0-100 (50 = center)
  const pct = 50 + (value / 5) * 50;

  const leader = value > 0.5 ? 'home' : value < -0.5 ? 'away' : null;

  return { value, pct, leader };
}
