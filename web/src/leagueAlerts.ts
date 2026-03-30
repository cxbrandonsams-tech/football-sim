/**
 * Around-the-League alerts — generate key moments from other games
 * and schedule them to appear during the user's game replay.
 */
import type { Game } from './types';

export interface LeagueAlert {
  /** When to show this alert (0–1 progress through the user's game) */
  triggerPct: number;
  /** Team abbreviation that did something notable */
  teamAbbr: string;
  /** Description */
  text: string;
  /** Score at the time */
  score: string;
  /** Type of alert for styling */
  kind: 'touchdown' | 'turnover' | 'final' | 'close';
}

/**
 * Generate alerts from other games in the same week.
 * Returns ~3-6 alerts timed across the 0–100% game progress.
 */
export function generateLeagueAlerts(
  otherGames: Game[],
  focusGameId: string,
): LeagueAlert[] {
  const alerts: LeagueAlert[] = [];

  for (const game of otherGames) {
    if (game.id === focusGameId) continue;
    if (game.status !== 'final') continue;

    const events = game.events ?? [];
    if (events.length === 0) {
      // No events — just report final score if close
      const margin = Math.abs(game.homeScore - game.awayScore);
      if (margin <= 3) {
        alerts.push({
          triggerPct: 0.95,
          teamAbbr: game.homeScore > game.awayScore ? game.homeTeam.abbreviation : game.awayTeam.abbreviation,
          text: `${game.awayTeam.abbreviation} ${game.awayScore}, ${game.homeTeam.abbreviation} ${game.homeScore} — Thriller!`,
          score: `${game.awayScore}-${game.homeScore}`,
          kind: 'close',
        });
      }
      continue;
    }

    // Scan events for key moments
    const totalEvents = events.length;
    let hScore = 0, aScore = 0;

    for (let i = 0; i < totalEvents; i++) {
      const ev = events[i]!;
      const pct = totalEvents > 0 ? i / totalEvents : 0;
      const isHome = ev.offenseTeamId === game.homeTeam.id;

      if (ev.result === 'touchdown') {
        if (isHome) hScore += 7; else aScore += 7;
        const scorer = isHome ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
        // Only report TDs that change the lead or tie the game
        const prevLead = (hScore - 7 * (isHome ? 1 : 0)) - (aScore - 7 * (isHome ? 0 : 1));
        const newLead = hScore - aScore;
        const isSwing = (prevLead <= 0 && newLead > 0) || (prevLead >= 0 && newLead < 0) || Math.abs(newLead) <= 3;
        if (isSwing && ev.quarter >= 3) {
          alerts.push({
            triggerPct: Math.min(0.95, pct + 0.05),
            teamAbbr: scorer,
            text: `${scorer} scores to ${newLead === 0 ? 'tie it up' : 'take the lead'}! ${game.awayTeam.abbreviation} ${aScore}, ${game.homeTeam.abbreviation} ${hScore}`,
            score: `${aScore}-${hScore}`,
            kind: 'touchdown',
          });
        }
      } else if (ev.result === 'turnover' && ev.quarter >= 4) {
        if (isHome) hScore += 0; else aScore += 0;
        const defTeam = isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation;
        alerts.push({
          triggerPct: Math.min(0.95, pct + 0.05),
          teamAbbr: defTeam,
          text: `${defTeam} with a huge ${ev.type === 'interception' ? 'INT' : 'fumble recovery'}!`,
          score: `${aScore}-${hScore}`,
          kind: 'turnover',
        });
      } else if (ev.result === 'field_goal_good') {
        if (isHome) hScore += 3; else aScore += 3;
      }
    }

    // Add final score alert for close games
    const margin = Math.abs(game.homeScore - game.awayScore);
    if (margin <= 7) {
      const winner = game.homeScore > game.awayScore ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
      alerts.push({
        triggerPct: 0.92,
        teamAbbr: winner,
        text: `${game.awayTeam.abbreviation} ${game.awayScore}, ${game.homeTeam.abbreviation} ${game.homeScore} — Final`,
        score: `${game.awayScore}-${game.homeScore}`,
        kind: 'final',
      });
    }
  }

  // Sort by trigger time and limit to ~5 alerts
  alerts.sort((a, b) => a.triggerPct - b.triggerPct);

  // Deduplicate close alerts (within 5% of each other)
  const deduped: LeagueAlert[] = [];
  for (const a of alerts) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(a.triggerPct - last.triggerPct) < 0.05) continue;
    deduped.push(a);
  }

  return deduped.slice(0, 6);
}

/**
 * Given the user's current play progress (0-1), return alerts that should fire now.
 * Each alert only fires once — pass in a Set of already-shown alert indices.
 */
export function getActiveAlerts(
  alerts: LeagueAlert[],
  currentPct: number,
  shownSet: Set<number>,
): { alert: LeagueAlert; index: number }[] {
  const active: { alert: LeagueAlert; index: number }[] = [];
  for (let i = 0; i < alerts.length; i++) {
    if (shownSet.has(i)) continue;
    if (alerts[i]!.triggerPct <= currentPct) {
      active.push({ alert: alerts[i]!, index: i });
    }
  }
  return active;
}
