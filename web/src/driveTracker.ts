/**
 * Drive tracking — computes current drive stats from play events.
 * A drive ends on: possession change (turnover, punt, score, downs).
 */
import type { PlayEvent } from './types';

export interface DriveStats {
  plays: number;
  yards: number;
  /** Elapsed seconds (estimated from play count × avg runoff). */
  elapsed: number;
  startYardLine: number;
}

/**
 * Walk backward from `idx` to find the start of the current drive.
 * A new drive starts when the offenseTeamId changes from the previous play.
 */
export function computeDriveStats(events: PlayEvent[], idx: number): DriveStats | null {
  if (idx < 0 || idx >= events.length) return null;

  const current = events[idx]!;
  const offTeam = current.offenseTeamId;

  // Walk backward to find drive start
  let driveStart = idx;
  for (let i = idx - 1; i >= 0; i--) {
    if (events[i]!.offenseTeamId !== offTeam) break;
    driveStart = i;
  }

  let totalYards = 0;
  let playCount = 0;
  for (let i = driveStart; i <= idx; i++) {
    const ev = events[i]!;
    if (ev.type === 'punt' || ev.type === 'field_goal') continue; // don't count special teams as "plays"
    totalYards += ev.yards;
    playCount++;
  }

  // Estimate elapsed time: ~35 seconds per play average
  const elapsed = playCount * 35;

  return {
    plays: playCount,
    yards: totalYards,
    elapsed,
    startYardLine: events[driveStart]!.yardLine,
  };
}

/** Format seconds as M:SS */
export function formatDriveTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
